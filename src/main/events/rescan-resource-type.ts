import { getResourcePath } from '../store/store';
import { clearFilesByPathPrefix } from '../store/files';
import { clearNotFoundFilesByPath } from '../store/not-found';
import { rescanPaths } from '../folder-watcher';

export async function eventRescanResourceType(
  _: Electron.IpcMainInvokeEvent,
  resourceType: string,
) {
  if (resourceType === 'DEFAULT') {
    throw new Error('Cannot rescan root path');
  }

  const path = getResourcePath(resourceType);
  if (!path || path === '') {
    throw new Error(`No path configured for ${resourceType}`);
  }

  console.log(`[Rescan] Clearing and rescanning ${resourceType} at ${path}`);

  clearFilesByPathPrefix(path);
  clearNotFoundFilesByPath(path);
  await rescanPaths([path]);

  console.log(`[Rescan] ${resourceType} scan complete`);
}
