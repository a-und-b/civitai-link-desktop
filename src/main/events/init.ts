import { initFolderCheck } from '../folder-watcher';
import { getSettings } from '../store/store';

export function eventInit() {
  const settings = getSettings();
  console.log('[Init] Renderer ready, checking startup scan setting...', settings.scanOnStartup);
  
  if (settings.scanOnStartup) {
    console.log('[Init] Startup scan enabled, starting folder check...');
    initFolderCheck();
  } else {
    console.log('[Init] Startup scan disabled, skipping folder check.');
  }
}
