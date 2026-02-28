import { setRootResourcePath } from '../store/store';

export function eventSetRootPath(_, directory) {
  if (directory['path'] !== '') {
    setRootResourcePath(directory['path']);
  }
}
