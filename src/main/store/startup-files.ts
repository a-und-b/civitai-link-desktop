import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import difference from 'lodash/difference';
import { findFileByFilename, updateFile } from './files';
import path from 'path';

const schema: Schema<Record<string, unknown>> = {
  startupFiles: {
    type: 'array',
    default: [],
  },
};

const storeName = app.isPackaged ? undefined : 'experimental';

export const store = new Store({ schema, name: storeName });

export function diffDirectories(filesInDirs: string[]): string[] {
  // Get existing list
  const oldFiles = [...store.get('startupFiles') as string[]];
  store.set('startupFiles', filesInDirs);
  const filenames = filesInDirs.map((file) => path.basename(file));

  // Short circuit if no files
  if (!oldFiles.length) {
    return [];
  }

  let diff = difference(oldFiles, filesInDirs);

  // Update paths and remove from diff if it exists and just moved
  const toRemove = diff.reduce((acc: string[], oldPath: string) => {
    const basename = path.basename(oldPath);
    const wasRemoved = !filenames.includes(basename);
    if (!wasRemoved) {
      // File was moved: find the new path in filesInDirs and update the resource
      const newPath = filesInDirs.find((p) => path.basename(p) === basename);
      const resource = findFileByFilename(basename);
      if (resource && newPath) {
        updateFile({ ...resource, localPath: newPath });
        return acc;
      }
    }

    // Otherwise, add to list to remove
    return [...acc, oldPath];
  }, []);

  // File no longer on file system
  return toRemove;
}

export function removeFilesFromStore(files: string[]) {
  const oldFiles = store.get('startupFiles') as string[];
  const newFiles = oldFiles.filter((file) => !files.includes(file));

  store.set('startupFiles', newFiles);
}

/**
 * Replace files under the given paths with the new file list.
 * Used for per-model-type rescan: removes old entries under these paths,
 * then adds the newly scanned files.
 */
export function replaceFilesUnderPaths(
  paths: string[],
  newFiles: { pathname: string }[],
) {
  const oldFiles = (store.get('startupFiles') as string[]) || [];
  const normalizedPaths = paths.map((p) => path.resolve(p));

  const isUnderPaths = (filePath: string) => {
    const normalized = path.resolve(filePath);
    return normalizedPaths.some((prefix) => {
      const relative = path.relative(prefix, normalized);
      return !relative.startsWith('..') && relative !== '';
    });
  };

  const remaining = oldFiles.filter((f) => !isUnderPaths(f));
  const newPathnames = newFiles.map((f) => f.pathname);
  store.set('startupFiles', [...remaining, ...newPathnames]);
}
