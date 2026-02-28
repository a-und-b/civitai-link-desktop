import { setSettings } from '../store/store';

export function eventSetScanOnStartup(_: Electron.IpcMainEvent, value: boolean) {
  setSettings({ scanOnStartup: value });
}