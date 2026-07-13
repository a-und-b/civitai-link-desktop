import axios from 'axios';
import { BrowserWindow, Notification, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { performance } from 'perf_hooks';
import { Socket } from 'socket.io-client';
import { filterResourcesList } from './commands/filter-reources-list';
import { registerInProgress, unregisterInProgress } from './download-in-progress';
import { updateActivity } from './store/activities';
import { addFile } from './store/files';
import { getSettings } from './store/store';
import { findOrCreateFolder } from './utils/find-or-create-folder';
import { readMetadata } from './utils/read-metadata';

const REPORT_INTERVAL = 1000;

type DownloadChunkParams = {
  url: string;
  start: number;
  end: number;
  index: number;
  filePath: string;
  abortController: AbortController;
  progressCallback: (index: number, loaded: number, total?: number) => void;
};

async function downloadChunk({
  url,
  start,
  end,
  index,
  filePath,
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

  // Write straight into the final file at this chunk's byte offset instead
  // of a separate temp part-file, avoiding a full copy-merge pass afterward.
  const writeStream = fs.createWriteStream(filePath, { flags: 'r+', start });
  await pipeline(response.data, writeStream);
}

async function getFileSize(url: string) {
  const response = await axios.head(url);
  const contentLength = response.headers['content-length'];
  return contentLength ? parseInt(contentLength, 10) : undefined;
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

  findOrCreateFolder(path.dirname(filePath));

  // Preallocate the destination file so each chunk can be written directly
  // at its byte offset. Register as in-progress first so the folder watcher
  // ignores it while chunks are still being written.
  registerInProgress(filePath);
  fs.closeSync(fs.openSync(filePath, 'w'));
  fs.truncateSync(filePath, fileSize);

  async function cleanupPartialDownload() {
    unregisterInProgress(filePath);
    await fs.promises.rm(filePath, { force: true });
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

      void cleanupPartialDownload();

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
        filePath,
        abortController: controller,
      }),
    );
  }

  try {
    await Promise.all(promises);
  } catch (err) {
    await cleanupPartialDownload();
    throw err;
  }

  unregisterInProgress(filePath);
  console.log("Downloaded to: '" + downloadPath + "'!");
  const timestamp = new Date().toISOString();

  const metadata = await readMetadata(filePath).catch((err) => {
    console.error('Error reading metadata for', filePath, err);
    return undefined;
  });

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
  const finalPayload = filterResourcesList();
  socket.emit('commandStatus', {
    type: 'resources:list',
    resources: finalPayload,
  });

  const totalTime = (performance.now() - startTime) / 1000;
  console.log(`Total time: ${totalTime.toFixed(2)} seconds`);
}
