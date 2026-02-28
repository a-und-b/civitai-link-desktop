import { initFolderCheck } from '../folder-watcher';
import { clearFiles } from '../store/files';
import { clearNotFoundFiles } from '../store/not-found';

export async function eventFullRescan() {
  console.log('[Full Rescan] Clearing stores and restarting scan...');
  
  // Clear all stores
  clearFiles();
  clearNotFoundFiles();
  
  // Restart scanning process
  await initFolderCheck();
  
  console.log('[Full Rescan] Scan restarted');
}