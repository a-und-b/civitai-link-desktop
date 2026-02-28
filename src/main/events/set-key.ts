import { getWindow } from '../browser-window';
import { socketEmit } from '../socket';
import { setKey } from '../store/store';

export function eventSetKey(_, key: string) {
  console.log('Setting key', key);
  setKey(key);
  getWindow()?.webContents.send('key-update', key);
  socketEmit({
    eventName: 'join',
    payload: key,
    cb: () => {
      console.log(`Joined room ${key}`);
    },
  });
}
