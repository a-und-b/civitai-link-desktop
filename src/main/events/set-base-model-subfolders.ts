import { setSettings } from '../store/store';

export function eventSetBaseModelSubfolders(_, baseModelSubfolders: boolean) {
  setSettings({ baseModelSubfolders });
}
