import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import path from 'path';

const schema: Schema<Record<string, unknown>> = {
  notFoundFile: {
    type: 'object',
    default: {},
  },
};

const storeName = app.isPackaged ? undefined : 'experimental';

export const store = new Store({ schema, name: storeName });

export function addNotFoundFile(filepath: string, hash: string) {
  const filename = path.basename(filepath);
  store.set(`notFoundFile.${filename}`, {
    hash,
    path: filepath,
    lastScannedDate: new Date(),
  });
}

export function removeNotFoundFile(filename: string) {
  filename = path.basename(filename);
  store.delete(`notFoundFile.${filename}`);
}

export function searchNotFoundFile(filename: string) {
  filename = path.basename(filename);
  return store.get(`notFoundFile.${filename}`);
}

export function getNotFoundFiles() {
  return store.get('notFoundFile') as Record<
    string,
    { hash: string; path: string; lastScannedDate: Date }
  >;
}

export function clearNotFoundFiles() {
  store.clear();
}

/**
 * Remove not-found entries whose path is under the given path prefix.
 * Used for per-model-type rescan.
 */
export function clearNotFoundFilesByPath(pathPrefix: string) {
  const entries = store.get('notFoundFile') as Record<
    string,
    { hash: string; path: string; lastScannedDate: Date }
  >;
  if (!entries) return;

  const normalizedPrefix = path.resolve(pathPrefix);
  for (const [filename, entry] of Object.entries(entries)) {
    if (!entry?.path || typeof entry.path !== 'string') continue;
    const relative = path.relative(normalizedPrefix, path.resolve(entry.path));
    if (!relative.startsWith('..') && relative !== '') {
      store.delete(`notFoundFile.${filename}`);
    }
  }
}
