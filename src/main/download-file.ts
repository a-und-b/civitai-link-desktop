import axios from 'axios';
import { BrowserWindow, Notification, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { performance } from 'perf_hooks';
import { Socket } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import { filterResourcesList } from './commands/filter-reources-list';
import { registerInProgress, unregisterInProgress } from './download-in-progress';
import { updateActivity } from './store/activities';
import { addFile } from './store/files';
import { getRootResourcePath } from './store/store';
import { getSettings } from './store/store';
import { findOrCreateFolder } from './utils/find-or-create-folder';
import { readMetadata } from './utils/read-metadata';

const REPORT_INTERVAL = 1000;

type DownloadChunkParams = {
  url: string;
  start: number;
  end: number;
  index: number;
  tempFilePath: string;
  abortController: AbortController;
  progressCallback: (index: number, loaded: number, total?: number) => void;
};

async function downloadChunk({
  url,
  start,
  end,
  index,
  tempFilePath,
  abortController,
  progressCallback,
}: DownloadChunkParams) {
  const headers = {
    Range: `bytes=${start}-${end}`,
  };

  const response = await axios.get(url, {
    headers,
    responseType: 'stream',
    signal: abortController.signal,
  });

  const chunkTotal = end - start + 1;
  let loaded = 0;
  response.data.on('data', (chunk: Buffer) => {
    loaded += chunk.length;
    progressCallback(index, loaded, chunkTotal);
  });

  const writeStream = fs.createWriteStream(`${tempFilePath}.part${index}`);
  await pipeline(response.data, writeStream);
}

async function getFileSize(url: string) {
  const CancelToken = axios.CancelToken;
  const source = CancelToken.source();

  try {
    const response = await axios.get(url, {
      cancelToken: source.token,
      responseType: 'stream',
    });

    // Get the content-length from the headers
    const contentLength = response.headers['content-length'];
    source.cancel('Got the content length, aborting the request');
    return parseInt(contentLength, 10);
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log('Request canceled:', error.message);
      return;
    } else {
      throw error;
    }
  }
}

type DownloadFileParams = {
  socket: Socket;
  mainWindow: BrowserWindow;
  resource: Resource;
  downloadPath: string;
};

export async function downloadFile({
  socket,
  mainWindow,
  downloadPath,
  resource,
}: DownloadFileParams) {
  if (!resource.url) {
    throw new Error('Download URL is required');
  }
  const downloadUrl = resource.url;

  // Number of parts to split into from settings
  const NUMBER_PARTS = getSettings().concurrent || 10;
  const startTime = performance.now();
  let lastReportedTime = Date.now();

  const fileSize = await getFileSize(downloadUrl);

  // If the file size is not available, return (maybe throw an error here?)
  if (!fileSize) return;

  const controller = new AbortController();
  const chunkSize = Math.ceil(fileSize / NUMBER_PARTS);

  // Final file path
  const dirPath = path.resolve(__dirname, '', downloadPath);
  const filePath = path.resolve(dirPath, resource.name);

  // Temp file path
  const tempFileName = uuid();
  const tempDirPath = path.resolve(getRootResourcePath(), 'tmp');
  const tempFilePath = path.resolve(tempDirPath, tempFileName);

  // Creates temp folder if it doesnt exist, also ensures that the main dir exists
  if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath, { recursive: true });
  }

  // Must register before we await the downloadChunk
  // This allows us to cancel all downloads with AbortController
  function cancelDownload(id: string) {
    console.log('Canceling download', id);
    if (resource.id === id) {
      console.log('Download canceled', resource.id);

      // Abort download w/ Axios
      controller.abort();

      mainWindow.setProgressBar(-1);

      // Let server know its canceled
      socket.emit('commandStatus', {
        status: 'canceled',
        id: resource.id,
      });

      const newPayload = filterResourcesList();
      socket.emit('commandStatus', {
        type: 'resources:list',
        resources: newPayload,
      });

      const activity: ActivityItem = {
        name: resource.modelName ?? resource.name ?? 'Unknown',
        date: new Date().toISOString(),
        type: 'cancelled' as ActivityType,
        civitaiUrl: resource.civitaiUrl,
      };

      updateActivity(activity);

      mainWindow.webContents.send('resource-remove', {
        resource,
      });
    }
  }

  ipcMain.once('cancel-download', (_, id) => cancelDownload(id));

  // Let Civitai UI know that the download has started
  const newPayload = filterResourcesList();
  socket.emit('commandStatus', {
    type: 'resources:list',
    resources: [
      { ...resource, downloading: true, status: 'processing' },
      ...newPayload,
    ],
  });

  let downloadedBytes = 0;
  const progress = Array(NUMBER_PARTS).fill(0);

  const updateProgress = (index: number, loaded: number) => {
    const currentTime = Date.now();
    downloadedBytes += loaded - progress[index];
    progress[index] = loaded;

    const elapsedTime = (performance.now() - startTime) / 1000; // seconds
    const speed = downloadedBytes / elapsedTime; // bytes per second
    const remainingTime = (fileSize - downloadedBytes) / speed; // seconds

    if (currentTime - lastReportedTime > REPORT_INTERVAL) {
      const totalProgress = (downloadedBytes / fileSize) * 100;

      // Updates the UI with the current progress
      mainWindow.webContents.send(`resource-download:${resource.id}`, {
        totalLength: fileSize,
        downloaded: downloadedBytes,
        progress: totalProgress,
        speed,
        remainingTime,
        downloading: true,
      });

      // Updates the progress bar
      mainWindow.setProgressBar(downloadedBytes / fileSize);

      // Send progress to server
      socket.emit('commandStatus', {
        status: 'processing',
        progress: totalProgress,
        remainingTime,
        speed,
        updatedAt: new Date().toISOString(),
        type: 'resources:add',
        id: resource.id,
        resource: {
          downloadDate: currentTime,
          totalLength: fileSize,
          ...resource,
        },
      });

      lastReportedTime = currentTime;
    }
  };

  findOrCreateFolder(path.dirname(filePath));

  const promises: Promise<void>[] = [];

  // Create the promises for each chunk
  for (let i = 0; i < NUMBER_PARTS; i++) {
    const start = i * chunkSize;
    const end =
      (i + 1) * chunkSize - 1 < fileSize
        ? (i + 1) * chunkSize - 1
        : fileSize - 1;

    promises.push(
      downloadChunk({
        url: downloadUrl,
        start,
        end,
        index: i,
        progressCallback: updateProgress,
        tempFilePath,
        abortController: controller,
      }),
    );
  }

  await Promise.all(promises);

  // Merge phase: send progress updates so UI doesn't appear stuck
  const mergeProgressStart = 95;
  const mergeProgressRange = 5;
  mainWindow.webContents.send(`resource-download:${resource.id}`, {
    progress: mergeProgressStart,
    merging: true,
    downloading: true,
  });
  socket.emit('commandStatus', {
    status: 'processing',
    progress: mergeProgressStart,
    merging: true,
    updatedAt: new Date().toISOString(),
    type: 'resources:add',
    id: resource.id,
    resource: { totalLength: fileSize, ...resource },
  });

  registerInProgress(filePath);
  const writeStream = fs.createWriteStream(filePath);
  try {
    for (let i = 0; i < NUMBER_PARTS; i++) {
      const chunkPath = `${tempFilePath}.part${i}`;
      await appendChunkToStream(chunkPath, writeStream);
      fs.unlinkSync(chunkPath); // Clean up chunk file after merging

      const mergeProgress =
        mergeProgressStart +
        (mergeProgressRange * (i + 1)) / NUMBER_PARTS;
      mainWindow.webContents.send(`resource-download:${resource.id}`, {
        progress: mergeProgress,
        merging: true,
        downloading: true,
      });
      socket.emit('commandStatus', {
        status: 'processing',
        progress: mergeProgress,
        merging: true,
        updatedAt: new Date().toISOString(),
        type: 'resources:add',
        id: resource.id,
        resource: { totalLength: fileSize, ...resource },
      });
    }
  } catch (err) {
    unregisterInProgress(filePath);
    throw err;
  }

  async function onEnd() {
    unregisterInProgress(filePath);
    console.log("Downloaded to: '" + downloadPath + "'!");
    const timestamp = new Date().toISOString();

    const metadata = await readMetadata(filePath);

    const fileData = {
      downloadDate: timestamp,
      totalLength: fileSize,
      localPath: filePath,
      metadata,
      ...resource,
    };

    const activity: ActivityItem = {
      name: resource.modelName ?? resource.name ?? 'Unknown',
      date: timestamp,
      type: 'downloaded' as ActivityType,
      civitaiUrl: resource.civitaiUrl,
    };

    updateActivity(activity);
    await addFile(fileData);

    new Notification({
      title: 'Download Complete',
      body: resource.name,
    }).show();

    // Reset progress bar
    mainWindow.setProgressBar(-1);

    // Updates the UI with the final progress
    mainWindow.webContents.send(`resource-download:${resource.id}`, {
      progress: 100,
      merging: false,
      downloading: false,
    });

    // Send newly added resource to server
    socket.emit('commandStatus', {
      status: 'success',
      progress: 100,
      updatedAt: timestamp,
      resource: fileData,
      id: resource.id,
      type: 'resources:add',
    });

    // Send entire list of resources to server
    const newPayload = filterResourcesList();
    socket.emit('commandStatus', {
      type: 'resources:list',
      resources: newPayload,
    });
  }

  writeStream.end(onEnd);

  const totalTime = (performance.now() - startTime) / 1000;
  console.log(`Total time: ${totalTime.toFixed(2)} seconds`);
}

function appendChunkToStream(
  chunkPath: string,
  writeStream: fs.WriteStream,
): Promise<void> {
  const readStream = fs.createReadStream(chunkPath);
  return new Promise((resolve, reject) => {
    readStream.pipe(writeStream, { end: false });
    readStream.on('end', resolve);
    readStream.on('error', reject);
    writeStream.on('error', reject);
  });
}
