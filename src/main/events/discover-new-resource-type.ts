import { discoverNewFilesInPaths } from '../folder-watcher';
import { getResourcePath } from '../store/store';

export async function eventDiscoverNewResourceType(
  _: Electron.IpcMainInvokeEvent,
  resourceType: string,
) {
  if (resourceType === 'DEFAULT') {
    throw new Error('Cannot discover new files in root path');
  }

  const path = getResourcePath(resourceType);
  if (!path || path === '') {
    throw new Error(`No path configured for ${resourceType}`);
  }

  console.log(`[Discover New] Scanning ${resourceType} for new files at ${path}`);

  const result = await discoverNewFilesInPaths([path]);

  console.log(
    `[Discover New] ${resourceType}: queued ${result.queued} new files, skipped ${result.skipped} existing files`,
  );

  return result;
}
