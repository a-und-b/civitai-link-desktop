import chokidar from 'chokidar';
import os from 'os';
import path from 'path';
import workerpool from 'workerpool';
import { getModelByHash } from './civitai-api';
import { listDirectories } from './list-directory';
import { socketCommandStatus } from './socket';
import { addFile, deleteFile, findFileByFilename } from './store/files';
import { addNotFoundFile, searchNotFoundFile } from './store/not-found';
import { getAllPaths, getRootResourcePath, store } from './store/store';
import { diffDirectories } from './store/startup-files';
import { setVault } from './store/vault';
import { checkMissingFields } from './utils/check-missing-fields';
import { limitConcurrency } from './utils/concurrency-helpers';
import { fileStats } from './utils/file-stats';
import { safeSend } from './utils/safe-send';

const maxWorkers = os.cpus().length > 1 ? os.cpus().length - 1 : 1;
const pool = workerpool.pool(__dirname + '/worker.js', { maxWorkers });
const FILE_TYPES = ['.pt', '.safetensors', '.ckpt', '.bin'];

const watchConfig = {
  ignoreInitial: true,
};

let watcher: chokidar.FSWatcher | undefined;

export function folderWatcher() {
  const rootResourcePath = getRootResourcePath();

  // Makes sure a root path is set
  if (rootResourcePath && rootResourcePath !== '') {
    const resourcePaths = getAllPaths();
    watcher = createWatcher(resourcePaths);
  }

  // This is in case the directory changes
  // We want to stop watching the current directory and start watching the new one
  const handlePathUpdate = async () => {
    // Fetch the updated paths
    const updatedResourcePaths = getAllPaths();

    if (updatedResourcePaths) {
      if (watcher) await watcher.close();
      watcher = createWatcher(updatedResourcePaths);
    }
  };
  store.onDidChange('resourcePaths', handlePathUpdate);
  store.onDidChange('rootResourcePath', handlePathUpdate);
}

function createWatcher(paths: string | string[]) {
  return chokidar
    .watch(paths, watchConfig)
    .on('add', (path) => process(path, 'add'))
    .on('unlink', (path) => process(path, 'unlink'));
}

const UNLINK_DELAY = 1000;
const processing: Record<
  string,
  { event: 'add' | 'unlink'; timeout?: NodeJS.Timeout }
> = {};

function process(filepath: string, event: 'add' | 'unlink') {
  const key = path.basename(filepath);

  if (event === 'add') {
    if (processing[key]?.event === 'unlink')
      clearTimeout(processing[key].timeout);
    const timeout = setTimeout(() => delete processing[key], UNLINK_DELAY);
    processing[key] = { event, timeout };
    onAdd(filepath);
  } else if (event === 'unlink') {
    if (processing[key]?.event === 'add') return;
    const timeout = setTimeout(() => onUnlink(filepath), UNLINK_DELAY);
    processing[key] = { event, timeout };
  }
}

function onUnlink(filePath: string) {
  // Short circuit if file isnt a model file
  if (!FILE_TYPES.some((x) => filePath.includes(x))) return;

  // Remove file from store
  const resource = findFileByFilename(path.basename(filePath));

  if (!resource) {
    return;
  }

  deleteFile(resource.hash);
  const updatedResources = getAllPaths();

  socketCommandStatus({
    type: 'resources:list',
    resources: updatedResources,
  });

  safeSend('resource-remove', {
    resource,
  });
}

async function onAdd(pathname: string, fileSize?: number) {
  // Short circuit if file isnt a model file
  if (!FILE_TYPES.some((x) => pathname.includes(x))) return;

  // Short circuit if in not found store
  const notFoundFile = searchNotFoundFile(pathname);
  if (notFoundFile) {
    // Increment progress for skipped files
    if (scanState.isScanning && fileSize) {
      scanState.processedSize += fileSize;
      updateLoader();
    }
    return;
  }

  // See if file already exists by filename
  const resource = findFileByFilename(pathname);

  // Update file path and any missing fields
  if (resource) {
    await checkMissingFields(resource, pathname);
    // Increment progress for existing files
    if (scanState.isScanning && fileSize) {
      scanState.processedSize += fileSize;
      updateLoader();
    }
  } else {
    await hashFile(pathname, fileSize);
  }
}

const toHash: Record<
  string,
  { fileSize: number; status: 'pending' | 'complete' }
> = {};

// Track global scan state for accurate progress reporting
let scanState = {
  totalSize: 0,
  processedSize: 0,
  isScanning: false,
};

async function hashFile(pathname: string, fileSize?: number) {
  if (toHash[pathname]) return;
  
  if (!fileSize) {
    const stats = await fileStats(pathname);
    if (!stats?.fileSize) return;
    fileSize = stats.fileSize;
  }
  
  toHash[pathname] = { fileSize, status: 'pending' };
  updateLoader();

  try {
    const { modelHash, metadata } = await pool.exec('processTask', [pathname]);
    try {
      const model = await getModelByHash(modelHash);
      await addFile({ ...model, localPath: pathname, metadata });
    } catch (err) {
      addNotFoundFile(pathname, modelHash);
      console.error('Model not found', err);
    } finally {
      toHash[pathname].status = 'complete';
      // Increment processed size in scan state
      if (scanState.isScanning) {
        scanState.processedSize += fileSize;
      }
      updateLoader();
      setTimeout(() => {
        delete toHash[pathname];
        updateLoader();
      }, 30000);
    }
  } catch (err) {
    console.error('Error hashing', err);
    // Clean up toHash entry on error to prevent progress from getting stuck
    if (toHash[pathname]) {
      toHash[pathname].status = 'complete';
      // Increment processed size even on error
      if (scanState.isScanning) {
        scanState.processedSize += fileSize;
      }
      updateLoader();
      setTimeout(() => {
        delete toHash[pathname];
        updateLoader();
      }, 30000);
    }
  }
}

function updateLoader() {
  let toScan: number;
  let scanned: number;
  let isScanning: boolean;

  if (scanState.isScanning) {
    // Use global scan state for accurate progress
    toScan = scanState.totalSize;
    scanned = scanState.processedSize;
    isScanning = scanned < toScan;
    
    // Update scanning flag
    if (!isScanning) {
      scanState.isScanning = false;
    }
  } else {
    // Fallback to toHash for individual file updates outside of bulk scan
    toScan = Object.values(toHash).reduce((a, b) => a + b.fileSize, 0);
    scanned = Object.values(toHash)
      .filter((v) => v.status === 'complete')
      .reduce((a, b) => a + b.fileSize, 0);
    const remaining = toScan - scanned;
    isScanning = remaining > 0;
  }

  const payload = {
    toScan,
    scanned,
    isScanning,
  };
  const sent = safeSend('model-loading', payload);
  if (sent) {
    console.log('[Model Loading]', payload);
  }
}

export async function initFolderCheck() {
  // Init load is empty []
  const files = listDirectories();
  console.log(`[Folder Check] Found ${files.length} files to process.`);

  // Remove files that are no longer in the directories from our records
  const filesToRemoveFromStore = diffDirectories(
    files.map((file) => file.pathname),
  );
  filesToRemoveFromStore.forEach((pathname) => {
    const file = findFileByFilename(path.basename(pathname));

    if (file) {
      // Remove file from store
      deleteFile(file.hash);
    }
  });

  // Start background processing without blocking startup
  processFilesInBackground(files);
  await setVault();
}

async function processFilesInBackground(files: { pathname: string }[]) {
  const LARGE_FILE_THRESHOLD = 1024 * 1024 * 1024; // 1GB
  const smallFiles: { pathname: string; size: number }[] = [];
  const largeFiles: { pathname: string; size: number }[] = [];

  // Categorize files by size
  for (const { pathname } of files) {
    try {
      const stats = await fileStats(pathname);
      const fileSize = stats.fileSize || 0;
      if (fileSize > LARGE_FILE_THRESHOLD) {
        largeFiles.push({ pathname, size: fileSize });
      } else {
        smallFiles.push({ pathname, size: fileSize });
      }
    } catch (error) {
      // If we can't get stats, treat as small file with 0 size
      smallFiles.push({ pathname, size: 0 });
    }
  }

  // Calculate total size upfront
  const totalSize = [...smallFiles, ...largeFiles].reduce(
    (sum, file) => sum + file.size,
    0,
  );

  // Initialize scan state
  scanState = {
    totalSize,
    processedSize: 0,
    isScanning: true,
  };

  // Send initial model-loading event to indicate scanning is starting
  if (smallFiles.length > 0 || largeFiles.length > 0) {
    const payload = {
      toScan: totalSize,
      scanned: 0,
      isScanning: true,
    };
    const sent = safeSend('model-loading', payload);
    console.log('[Model Loading] Initial scan:', { 
      totalFiles: smallFiles.length + largeFiles.length,
      totalSize,
      sent,
    });
  } else {
    console.log('[Model Loading] No model files found to scan.');
    scanState.isScanning = false;
    safeSend('model-loading', {
      toScan: 0,
      scanned: 0,
      isScanning: false,
    });
  }

  try {
    // Process small files first with full concurrency
    if (smallFiles.length > 0) {

      const smallFilePromises = smallFiles.map((file) => async () => {
        await onAdd(file.pathname, file.size);
      });
      await limitConcurrency(smallFilePromises, pool.maxWorkers || maxWorkers);

    }

    // Process large files with reduced concurrency to avoid overwhelming system
    if (largeFiles.length > 0) {

      const largeFilePromises = largeFiles.map((file) => async () => {
        await onAdd(file.pathname, file.size);
      });
      const reducedConcurrency = Math.max(
        1,
        Math.floor((pool.maxWorkers || maxWorkers) / 2),
      );
      await limitConcurrency(largeFilePromises, reducedConcurrency);
    }


  } catch (error) {
    console.error('Error during background file processing:', error);
  }
}

export async function cleanupWatcher() {
  try {
    if (watcher) {
      await watcher.close();
      watcher = undefined;
    }
    await pool.terminate();
  } catch (error) {
    console.error('Error during watcher cleanup:', error);
  }
}
