import { IpcMainInvokeEvent } from 'electron';
import { getModelByHash } from '../civitai-api';
import { createPreviewImage } from '../utils/create-preview-image';
import { searchFile, updateFile } from '../store/files';

export async function eventRefreshMetadataFromCivitai(
  _event: IpcMainInvokeEvent,
  hash: string,
): Promise<Resource | null> {
  console.log('[Refresh] Refreshing metadata from Civitai for hash:', hash);

  const existingFile = searchFile(hash);
  if (!existingFile) {
    console.log('[Refresh] File not found in store:', hash);
    return null;
  }

  try {
    const model = await getModelByHash(hash, { includeDescription: true });
    console.log('[Refresh] Fetched model from Civitai:', model.modelName, 'previewImageUrl:', !!model.previewImageUrl);
    const updatedFile: Resource = {
      ...existingFile,
      ...model,
      localPath: existingFile.localPath,
      metadata: existingFile.metadata,
      name: existingFile.name,
      fileSize: existingFile.fileSize,
      downloadDate: existingFile.downloadDate,
      vaultId: existingFile.vaultId,
      notes: existingFile.notes,
    };

    updateFile(updatedFile);
    createPreviewImage(updatedFile);

    console.log('[Refresh] Successfully updated metadata for:', updatedFile.modelName);
    return updatedFile;
  } catch (err) {
    console.error('[Refresh] Error refreshing metadata from Civitai:', err);
    throw err;
  }
}
