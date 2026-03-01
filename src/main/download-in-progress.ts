/**
 * Tracks file paths that are currently being written by download processes.
 * Used by the folder watcher to skip hashing incomplete files.
 */
const inProgressPaths = new Set<string>();

export function registerInProgress(filePath: string): void {
  inProgressPaths.add(filePath);
}

export function unregisterInProgress(filePath: string): void {
  inProgressPaths.delete(filePath);
}

export function isInProgress(filePath: string): boolean {
  return inProgressPaths.has(filePath);
}
