import fs from 'fs';
import path from 'path';
import { getRootResourcePath } from '../store/store';

export function clearTempFolders() {
  const tempDirPath = path.resolve(getRootResourcePath(), 'tmp');

  if (fs.existsSync(tempDirPath)) {
    fs.rmSync(tempDirPath, { recursive: true });
  }
}
