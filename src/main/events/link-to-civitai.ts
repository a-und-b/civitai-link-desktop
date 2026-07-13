import { IpcMainInvokeEvent } from 'electron';
import { getModelByVersionId } from '../civitai-api';
import { searchFile, updateFile } from '../store/files';
import { createPreviewImage } from '../utils/create-preview-image';
import { createModelJson } from '../utils/create-model-json';

/**
 * Parse modelVersionId from Civitai URL or numeric string.
 * Supports: https://civitai.com/models/123?modelVersionId=456, https://civitai.com/models/123/456, or plain "456"
 */
function parseModelVersionId(input: string): number | null {
  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num > 0) return num;

  try {
    const url = new URL(trimmed);
    const versionParam = url.searchParams.get('modelVersionId');
    if (versionParam) {
      const v = parseInt(versionParam, 10);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    const modelsIndex = pathParts.indexOf('models');
    if (modelsIndex >= 0 && pathParts[modelsIndex + 2]) {
      const v = parseInt(pathParts[modelsIndex + 2], 10);
      if (!Number.isNaN(v) && v > 0) return v;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

export async function eventLinkToCivitai(
  _event: IpcMainInvokeEvent,
  { hash, modelVersionIdOrUrl }: { hash: string; modelVersionIdOrUrl: string },
): Promise<Resource | null> {
  const existingFile = searchFile(hash);
  if (!existingFile) {
    console.log('[Link] File not found in store:', hash);
    return null;
  }

  const modelVersionId =
    typeof modelVersionIdOrUrl === 'number'
      ? modelVersionIdOrUrl
      : parseModelVersionId(modelVersionIdOrUrl);

  if (!modelVersionId) {
    throw new Error(
      'Invalid Civitai URL or model version ID. Use a URL like https://civitai.com/models/123?modelVersionId=456 or a version ID number.',
    );
  }

  const civitaiData = await getModelByVersionId(modelVersionId);

  const updatedFile: Resource = {
    ...existingFile,
    ...civitaiData,
    hash: existingFile.hash,
    localPath: existingFile.localPath,
    metadata: existingFile.metadata,
    notes: existingFile.notes,
    fileSize: existingFile.fileSize,
    downloadDate: existingFile.downloadDate,
    name: existingFile.name,
    matchStatus: 'user-linked',
    source: 'civitai',
  };

  updateFile(updatedFile);
  createPreviewImage(updatedFile);
  createModelJson(updatedFile);

  console.log('[Link] Successfully linked to Civitai:', updatedFile.modelName);
  return updatedFile;
}
