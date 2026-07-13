import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import path from 'path';
import { safeSend } from '../utils/safe-send';
import { createModelJson } from '../utils/create-model-json';
import { createPreviewImage } from '../utils/create-preview-image';
import { fileStats } from '../utils/file-stats';
import { getApiKey } from './store';
import { getVaultByModelVersionId } from './vault';

const schema: Schema<Record<string, unknown>> = {
  files: {
    type: 'object',
    default: {},
  },
};

const storeName = app.isPackaged ? undefined : 'experimental';

export const store = new Store({ schema, name: storeName });

// electron-store re-reads/re-parses the whole JSON file on every get() and
// rewrites it on every set(). Scanning thousands of files would otherwise do
// thousands of full-file read/writes and IPC broadcasts. Instead we keep the
// authoritative copy in memory and debounce persistence + IPC broadcasts.
let files: ResourcesMap = (store.get('files') as ResourcesMap) || {};
const filenameIndex = new Map<string, string>();
for (const [hash, file] of Object.entries(files)) {
  if (file.name) filenameIndex.set(file.name, hash);
}

const PERSIST_DEBOUNCE_MS = 1000;
let persistTimeout: NodeJS.Timeout | undefined;

function schedulePersist() {
  if (persistTimeout) return;
  persistTimeout = setTimeout(() => {
    persistTimeout = undefined;
    store.set('files', files);
  }, PERSIST_DEBOUNCE_MS);
}

/** Persist immediately, bypassing the debounce. Call before app quit. */
export function flushFiles() {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = undefined;
  }
  store.set('files', files);
}

const BROADCAST_DEBOUNCE_MS = 500;
let broadcastTimeout: NodeJS.Timeout | undefined;

function scheduleBroadcast() {
  if (broadcastTimeout) return;
  broadcastTimeout = setTimeout(() => {
    broadcastTimeout = undefined;
    safeSend('files-update', files);
  }, BROADCAST_DEBOUNCE_MS);
}

function setFile(hash: string, file: Resource) {
  const existing = files[hash];
  if (existing?.name && existing.name !== file.name) {
    filenameIndex.delete(existing.name);
  }
  files[hash] = file;
  if (file.name) filenameIndex.set(file.name, hash);
  schedulePersist();
  scheduleBroadcast();
}

function removeFile(hash: string) {
  const existing = files[hash];
  if (existing?.name) filenameIndex.delete(existing.name);
  delete files[hash];
  schedulePersist();
  scheduleBroadcast();
}

export async function addFile(file: Resource) {
  const stats = await fileStats(file.localPath);
  const apiKey = getApiKey();

  const fileToAdd = { ...file, hash: file.hash.toLowerCase(), ...stats };
  if (file.localPath) {
    fileToAdd.name = path.basename(file.localPath);
  }

  if (apiKey && file.modelVersionId) {
    const vaultItem = getVaultByModelVersionId(file.modelVersionId);

    fileToAdd.vaultId = vaultItem?.id;
  }

  createModelJson(file);
  createPreviewImage(file);

  setFile(fileToAdd.hash, fileToAdd);
}

export function deleteFile(hash: string) {
  removeFile(hash.toLowerCase());
}

export function searchFile(hash: string) {
  return files[hash.toLowerCase()];
}

export function findFileByFilename(filename: string) {
  filename = path.basename(filename);
  const hash = filenameIndex.get(filename);

  return hash ? files[hash] : undefined;
}

export function findFileByPath(localPath: string) {
  const normalizedPath = path.resolve(localPath);

  return Object.values(files).find((file) => {
    if (!file.localPath) return false;
    return path.resolve(file.localPath) === normalizedPath;
  });
}

export function getIndexedLocalPathSet() {
  return new Set(
    Object.values(files)
      .map((file) => file.localPath)
      .filter((localPath): localPath is string => Boolean(localPath))
      .map((localPath) => path.resolve(localPath)),
  );
}

export function searchFileByModelVersionId(modelVersionId: number) {
  const hash = Object.keys(files).find(
    (hash) => files[hash.toLowerCase()].modelVersionId === modelVersionId,
  );

  return hash ? files[hash] : undefined;
}

export function updateFile(file: Resource) {
  const normalized = { ...file, hash: file.hash.toLowerCase() };
  if (file.localPath) {
    normalized.name = path.basename(file.localPath);
  }
  setFile(normalized.hash, normalized);
}

export function getFiles() {
  return files;
}

export function clearFiles() {
  files = {};
  filenameIndex.clear();
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = undefined;
  }
  store.clear();
  scheduleBroadcast();
}

/**
 * Remove only files whose localPath is under the given path prefix.
 * Used for per-model-type rescan to clear cached data for a specific folder.
 */
export function clearFilesByPathPrefix(pathPrefix: string) {
  const normalizedPrefix = path.resolve(pathPrefix);
  for (const [hash, file] of Object.entries(files)) {
    if (file.localPath) {
      const normalizedPath = path.resolve(file.localPath);
      const relative = path.relative(normalizedPrefix, normalizedPath);
      if (!relative.startsWith('..') && relative !== '') {
        removeFile(hash);
      }
    }
  }
}

export function filesByModelVersionIdHash() {
  const result: Record<string, Resource> = {};
  for (const file of Object.values(files)) {
    if (!file.modelVersionId) continue;
    result[file.modelVersionId] = file;
  }
  return result;
}
