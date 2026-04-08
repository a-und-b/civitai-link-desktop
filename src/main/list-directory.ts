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

export async function listDirectoryAsync(
  directory: string,
  options?: { yieldEvery?: number },
) {
  if (!fs.existsSync(directory)) return [];

  const yieldEvery = options?.yieldEvery ?? 25;
  const files: { pathname: string; filename: string }[] = [];
  const directoriesToScan = [''];
  let processedDirectories = 0;

  while (directoriesToScan.length > 0) {
    const relativeDirectory = directoriesToScan.shift();
    if (relativeDirectory === undefined) break;

    const absoluteDirectory = relativeDirectory
      ? path.join(directory, relativeDirectory)
      : directory;
    const entries = await fs.promises.readdir(absoluteDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        directoriesToScan.push(relativePath);
        continue;
      }

      if (entry.isFile() && filterFileTypes(relativePath)) {
        files.push(mapFiles(relativePath, directory));
      }
    }

    processedDirectories++;
    if (processedDirectories % yieldEvery === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  return files;
}

function filterFileTypes(file: string | Buffer) {
  const normalizedPath = file.toString().replace(/\\/g, '/');

  // Exclude files containing any exclude pattern
  if (EXCLUDE_TYPES.some((x) => normalizedPath.includes(x))) {
    return false;
  }
  
  // Include only valid model file types
  return FILE_TYPES.some((x) => normalizedPath.includes(x));
}

function mapFiles(file: string | Buffer, directory: string) {
  return {
    pathname: path.join(directory, file.toString()),
    filename: file.toString(),
  };
}
