import { app, ipcMain } from 'electron';
import { getWindow } from '../browser-window';

// Settings Events
import { eventClearSettings } from './clear-settings';
import { eventSetAlwaysOnTop } from './set-always-on-top';
import { eventSetApiKey } from './set-api-key';
import { eventSetBaseModelSubfolders } from './set-base-model-subfolders';
import { eventSetKey } from './set-key';
import { eventSetNSFW } from './set-nsfw';
import { eventSetPath } from './set-path';
import { eventSetRootPath } from './set-root-path';
import { eventSetStableDiffusion } from './set-stable-diffusion';
import { eventSetScanOnStartup } from './set-scan-on-startup';

// App Events
import { eventCloseApp } from './close-app';
import { eventInit } from './init';
import { eventOpenRootModelFolder } from './open-root-model-folder';

// File Events
import { eventFetchMetadata } from './fetch-metadata';
import { eventFetchFileNotes, eventSaveFileNotes } from './notes';
import { eventOpenModelFileFolder } from './open-model-file-folder';
import { eventLinkToCivitai } from './link-to-civitai';
import { eventRefreshMetadataFromCivitai } from './refresh-metadata-from-civitai';
import { eventResourceRemove } from './resource-remove';
import { eventDiscoverNewResourceType } from './discover-new-resource-type';
import { eventSearchFile } from './search-file';

// Vault Events
import { eventDownloadVaultItem } from './download-vault-item';
import { eventGetFileByHash } from './files';
import { eventSetConcurrent } from './set-concurrent';
import { eventSortLoraFiles } from './sort-lora-files';
import { eventFullRescan } from './full-rescan';
import { eventRescanResourceType } from './rescan-resource-type';
import {
  eventFetchVaultMeta,
  eventFetchVaultModels,
  eventToggleVaultItem,
} from './vault';

export function eventsListeners() {
  const mainWindow = getWindow();

  // App events
  ipcMain.on('init', () => {
    mainWindow.setMinimumSize(1060, 600);
    mainWindow.setSize(1060, 600, true);
    eventInit();
  });
  ipcMain.on('restart-app', () => {
    app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
    app.exit(0);
  });
  ipcMain.on('clear-settings', () => {
    mainWindow.setMinimumSize(400, 600);
    mainWindow.setSize(400, 600, true);
    eventClearSettings();
  });
  ipcMain.on('close-app', eventCloseApp);

  // Set data
  ipcMain.on('set-key', eventSetKey);
  ipcMain.on('set-root-path', eventSetRootPath);
  ipcMain.on('set-path', eventSetPath);
  ipcMain.on('set-nsfw', eventSetNSFW);
  ipcMain.on('set-concurrent', eventSetConcurrent);
  ipcMain.on('set-base-model-subfolders', eventSetBaseModelSubfolders);
  ipcMain.on('set-always-on-top', (_, alwaysOnTop) => {
    mainWindow.setAlwaysOnTop(alwaysOnTop);

    eventSetAlwaysOnTop(alwaysOnTop);
  });
  ipcMain.on('set-api-key', eventSetApiKey);
  ipcMain.on('set-stable-diffusion', eventSetStableDiffusion);
  ipcMain.on('save-file-notes', eventSaveFileNotes);
  ipcMain.on('set-scan-on-startup', eventSetScanOnStartup);

  // Misc
  ipcMain.on('resource-remove', (_, resource) =>
    eventResourceRemove(resource, mainWindow),
  );
  ipcMain.on('open-root-model-folder', eventOpenRootModelFolder);
  ipcMain.on('open-model-file-folder', (_, filePath) =>
    eventOpenModelFileFolder(filePath),
  );
  ipcMain.handle('toggle-vault-item', eventToggleVaultItem);
  ipcMain.on('search-file', eventSearchFile);

  // Fetch data
  ipcMain.on('fetch-vault-meta', eventFetchVaultMeta);
  ipcMain.on('fetch-vault-models', eventFetchVaultModels);
  ipcMain.handle('fetch-metadata', eventFetchMetadata);
  ipcMain.handle('fetch-file-notes', eventFetchFileNotes);
  ipcMain.on('download-vault-item', eventDownloadVaultItem);
  ipcMain.handle('get-file-by-hash', eventGetFileByHash);
  ipcMain.handle('refresh-metadata-from-civitai', (_, hash: string) =>
    eventRefreshMetadataFromCivitai(_, hash),
  );
  ipcMain.handle(
    'link-to-civitai',
    (
      _,
      { hash, modelVersionIdOrUrl }: { hash: string; modelVersionIdOrUrl: string },
    ) => eventLinkToCivitai(_, { hash, modelVersionIdOrUrl }),
  );
  ipcMain.handle('sort-lora-files', eventSortLoraFiles);
  ipcMain.handle('full-rescan', eventFullRescan);
  ipcMain.handle('rescan-resource-type', eventRescanResourceType);
  ipcMain.handle('discover-new-resource-type', eventDiscoverNewResourceType);
}
