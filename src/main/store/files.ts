import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import path from 'path';
import { getWindow } from '../browser-window';
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

  store.set(`files.${file.hash.toLowerCase()}`, fileToAdd);

  const files = store.get('files') as ResourcesMap;

  getWindow().webContents.send('files-update', files);

  return;
}

export function deleteFile(hash: string) {
  return store.delete(`files.${hash.toLowerCase()}`);
}

export function searchFile(hash: string) {
  return store.get(`files.${hash.toLowerCase()}`) as Resource;
}

export function findFileByFilename(filename: string) {
  filename = path.basename(filename);
  const files = store.get('files') as ResourcesMap;

  const file = Object.values(files).find((file) => file.name == filename);

  if (!file) return;

  return file;
}

export function findFileByPath(localPath: string) {
  const normalizedPath = path.resolve(localPath);
  const files = store.get('files') as ResourcesMap;

  const file = Object.values(files).find((file) => {
    if (!file.localPath) return false;
    return path.resolve(file.localPath) === normalizedPath;
  });

  if (!file) return;

  return file;
}

export function getIndexedLocalPathSet() {
  const files = store.get('files') as ResourcesMap;

  return new Set(
    Object.values(files)
      .map((file) => file.localPath)
      .filter((localPath): localPath is string => Boolean(localPath))
      .map((localPath) => path.resolve(localPath)),
  );
}

export function searchFileByModelVersionId(modelVersionId: number) {
  const files = store.get('files') as ResourcesMap;

  const hash = Object.keys(files).find(
    (hash) => files[hash.toLowerCase()].modelVersionId === modelVersionId,
  );

  if (!hash) return;

  return files[hash];
}

export function updateFile(file: Resource) {
  const normalized = { ...file, hash: file.hash.toLowerCase() };
  if (file.localPath) {
    normalized.name = path.basename(file.localPath);
  }
  store.set(`files.${normalized.hash}`, normalized);

  const files = store.get('files') as ResourcesMap;
  safeSend('files-update', files);
}

export function getFiles() {
  const files = store.get('files') as ResourcesMap;
  return sortFiles(files);
}

export function clearFiles() {
  store.clear();
}

/**
 * Remove only files whose localPath is under the given path prefix.
 * Used for per-model-type rescan to clear cached data for a specific folder.
 */
export function clearFilesByPathPrefix(pathPrefix: string) {
  const files = store.get('files') as ResourcesMap;
  if (!files) return;

  const normalizedPrefix = path.resolve(pathPrefix);
  for (const [hash, file] of Object.entries(files)) {
    if (file.localPath) {
      const normalizedPath = path.resolve(file.localPath);
      const relative = path.relative(normalizedPrefix, normalizedPath);
      if (!relative.startsWith('..') && relative !== '') {
        store.delete(`files.${hash.toLowerCase()}`);
      }
    }
  }

  const updatedFiles = store.get('files') as ResourcesMap;
  getWindow().webContents.send('files-update', updatedFiles);
}

export function filesByModelVersionIdHash() {
  const files = store.get('files') as ResourcesMap;

  return Object.values(files).reduce(
    (acc: Record<string, Resource>, file: Resource) => {
      if (!file.modelVersionId) return acc;

      return {
        ...acc,
        [file.modelVersionId]: file,
      };
    },
    {},
  );
}

function sortFiles(files: ResourcesMap) {
  const sortedFiles = Object.values(files)
    .sort((a, b) => {
      const filteredFileListA = a.downloadDate;
      const filteredFileListB = b.downloadDate;

      if (!filteredFileListA) return 1;
      if (!filteredFileListB) return -1;

      return (
        new Date(filteredFileListB).getTime() -
        new Date(filteredFileListA).getTime()
      );
    })
    .reduce(
      (
        acc: Record<string, Resource>,
        file: Resource,
      ): Record<string, Resource> => {
        return {
          ...acc,
          [file.hash]: file,
        };
      },
      {},
    );

  return sortedFiles;
}
