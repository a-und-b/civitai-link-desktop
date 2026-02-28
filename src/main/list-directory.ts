import fs from 'fs';
import path from 'path';
import uniqBy from 'lodash/uniqBy';
import { getAllPaths } from './store/store';

const FILE_TYPES = ['.pt', '.safetensors', '.ckpt', '.bin'];
const EXCLUDE_TYPES = ['/temp/', '.json', '.png'];

export function listDirectories() {
  const modelDirectories = getAllPaths();

  const filesInDirs = modelDirectories
    .map((directory) => {
      if (!fs.existsSync(directory)) {
        console.log(`[List Directories] Directory not found: ${directory}`);
        return [];
      }
      
      console.log(`[List Directories] Scanning: ${directory}`);
      return fs
        .readdirSync(directory, { recursive: true })
        .filter(filterFileTypes)
        .map((file) => mapFiles(file, directory));
    })
    .flat();

  return uniqBy(filesInDirs, 'pathname');
}

export function listDirectory(directory: string) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { recursive: true })
    .filter(filterFileTypes)
    .map((file) => mapFiles(file, directory));
}

function filterFileTypes(file: string | Buffer) {
  // Exclude files containing any exclude pattern
  if (EXCLUDE_TYPES.some((x) => file.includes(x))) {
    return false;
  }
  
  // Include only valid model file types
  return FILE_TYPES.some((x) => file.includes(x));
}

function mapFiles(file: string | Buffer, directory: string) {
  return {
    pathname: path.join(directory, file.toString()),
    filename: file.toString(),
  };
}
