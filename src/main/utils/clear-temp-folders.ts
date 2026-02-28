import fs from 'fs';
import path from 'path';
import { getRootResourcePath } from '../store/store';

export function clearTempFolders() {
  const rootPath = getRootResourcePath();
  if (!rootPath || typeof rootPath !== 'string') return;

  const tempDirPath = path.resolve(rootPath, 'tmp');

  if (fs.existsSync(tempDirPath)) {
    fs.rmSync(tempDirPath, { recursive: true });
  }
}
