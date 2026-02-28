import fs from 'fs';
import path from 'path';
import { IpcMainInvokeEvent } from 'electron';
import { getWindow } from '../browser-window';
import { hash } from '../hash';
import { getModelByHash } from '../civitai-api';
import { BASE_MODEL_FOLDERS, getResourcePath, Resources } from '../store/store';
import { limitConcurrency, sleep } from '../utils/concurrency-helpers';
import { findOrCreateFolder } from '../utils/find-or-create-folder';
import { searchFile, updateFile } from '../store/files';
import { createPreviewImage } from '../utils/create-preview-image';
import { createModelJson } from '../utils/create-model-json';

const FILE_TYPES = ['.pt', '.safetensors', '.ckpt', '.bin'];

type SortResult = {
  total: number;
  moved: number;
  unknown: number;
  errors: number;
  errorDetails: string[];
};

export async function eventSortLoraFiles(
  _event: IpcMainInvokeEvent,
): Promise<SortResult> {
  const result: SortResult = {
    total: 0,
    moved: 0,
    unknown: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    const loraPath = getResourcePath(Resources.LORA);

    // Check if lora directory exists
    if (!fs.existsSync(loraPath)) {
      throw new Error(`LoRA directory does not exist: ${loraPath}`);
    }

    // Get only root-level files (not in subfolders)
    const allItems = fs.readdirSync(loraPath);
    const rootFiles = allItems.filter((item) => {
      const fullPath = path.join(loraPath, item);
      try {
        const isFile = fs.statSync(fullPath).isFile();
        const isModelFile = FILE_TYPES.some((ext) => item.endsWith(ext));
        return isFile && isModelFile;
      } catch (error) {
        // File might have been moved already or doesn't exist, skip it
        return false;
      }
    });

    result.total = rootFiles.length;

    if (rootFiles.length === 0) {
      getWindow().webContents.send('lora-sort-progress', {
        message: 'No files to sort',
        current: 0,
        total: 0,
      });
      return result;
    }

    // Create tasks for processing
    const tasks = rootFiles.map((filename) => async () => {
      const filePath = path.join(loraPath, filename);

      try {
        // Check if file still exists (might have been moved already)
        if (!fs.existsSync(filePath)) {
          console.log(`Skipping ${filename} - file no longer exists at root`);
          return;
        }

        // Send progress update
        getWindow().webContents.send('lora-sort-progress', {
          message: `Processing ${filename}...`,
          current: result.moved + result.unknown + result.errors,
          total: result.total,
        });

        // Compute hash
        const fileHash = await hash(filePath);

        // Try to get model info from Civitai
        let targetSubfolder = 'Unknown';
        let modelInfo: Resource | undefined;
        try {
          modelInfo = await getModelByHash(fileHash);
          const baseModel = modelInfo.baseModel;

          if (baseModel && BASE_MODEL_FOLDERS[baseModel]) {
            targetSubfolder = BASE_MODEL_FOLDERS[baseModel];
          } else {
            targetSubfolder = 'Unknown';
          }
        } catch (error) {
          // Model not found on Civitai, use Unknown folder
          targetSubfolder = 'Unknown';
        }

        // Create target directory
        const targetDir = path.join(loraPath, targetSubfolder);
        findOrCreateFolder(targetDir);

        // Move the model file
        const targetPath = path.join(targetDir, filename);
        await fs.promises.rename(filePath, targetPath);

        // Move associated files (.json and preview images/videos)
        const baseName = path.parse(filename).name;
        const associatedFiles = [
          `${baseName}.json`,
          `${baseName}.png`,
          `${baseName}.jpg`,
          `${baseName}.jpeg`,
          `${baseName}.preview.png`,
          `${baseName}.preview.jpg`,
          `${baseName}.preview.jpeg`,
          `${baseName}.preview.gif`,
          `${baseName}.preview.webp`,
          `${baseName}.preview.mp4`,
          `${baseName}.preview.webm`,
        ];

        for (const assocFile of associatedFiles) {
          const assocPath = path.join(loraPath, assocFile);
          if (fs.existsSync(assocPath)) {
            const assocTargetPath = path.join(targetDir, assocFile);
            try {
              await fs.promises.rename(assocPath, assocTargetPath);
            } catch (err) {
              console.warn(
                `Could not move associated file ${assocFile}:`,
                err,
              );
            }
          }
        }

        // Update file store with new path
        const fileResource = searchFile(fileHash);
        if (fileResource) {
          fileResource.localPath = targetPath;
          updateFile(fileResource);
        }

        // Create missing preview/JSON if we have model info from Civitai
        if (modelInfo) {
          const resourceWithPath = { ...modelInfo, localPath: targetPath };
          await createPreviewImage(resourceWithPath);
          createModelJson(resourceWithPath);
        }

        // Update counters
        if (targetSubfolder === 'Unknown') {
          result.unknown++;
        } else {
          result.moved++;
        }
      } catch (error) {
        result.errors++;
        const errorMsg = `Error processing ${filename}: ${error instanceof Error ? error.message : String(error)}`;
        result.errorDetails.push(errorMsg);
        console.error(errorMsg);
      }
    });

    // Process with rate limiting (3 concurrent, 100ms delay between API calls)
    await limitConcurrency(tasks, {
      limit: 3,
      betweenTasksFn: () => sleep(100),
    });

    // Send completion event
    getWindow().webContents.send('lora-sort-complete', result);

    return result;
  } catch (error) {
    const errorMsg = `Fatal error during sorting: ${error instanceof Error ? error.message : String(error)}`;
    result.errorDetails.push(errorMsg);
    console.error(errorMsg);
    throw error;
  }
}
