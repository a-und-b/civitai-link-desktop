import path from 'path';

/**
 * Infer model type from file extension or path.
 */
function inferType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();

  if (ext === '.safetensors' || ext === '.ckpt' || ext === '.pt') {
    if (dirname.includes('lora') || basename.includes('lora')) return 'LoRA';
    if (dirname.includes('embedding') || basename.includes('embedding'))
      return 'Embeddings';
    if (dirname.includes('controlnet') || basename.includes('controlnet'))
      return 'ControlNet';
    if (dirname.includes('vae') || basename.includes('vae')) return 'VAE';
    if (dirname.includes('upscaler') || basename.includes('upscaler'))
      return 'Upscaler';
    return 'Checkpoint';
  }
  if (ext === '.bin') return 'Embeddings';

  return 'Unknown';
}

/**
 * Extract display-friendly name from filename (strip extension, clean underscores).
 */
function filenameToDisplayName(filePath: string): string {
  const basename = path.basename(filePath);
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
  return nameWithoutExt.replace(/_/g, ' ').trim() || basename;
}

/**
 * Extract trained words from safetensors metadata if present.
 */
function extractTrainedWords(metadata: Record<string, unknown> | null): string[] | undefined {
  if (!metadata) return undefined;

  const tagFreq = metadata.ss_tag_frequency as Record<string, number> | undefined;
  if (tagFreq && typeof tagFreq === 'object') {
    return Object.keys(tagFreq);
  }

  const activation = metadata.ss_activation_text as string | undefined;
  if (typeof activation === 'string') {
    return activation.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return undefined;
}

/**
 * Extract base model hint from safetensors metadata.
 */
function extractBaseModel(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined;
  const base = metadata.ss_base_model as string | undefined;
  return typeof base === 'string' ? base : undefined;
}

export type NormalizeLocalResourceInput = {
  hash: string;
  localPath: string;
  metadata?: Record<string, unknown> | null;
  fileSize?: number;
  downloadDate?: string;
};

/**
 * Create a valid local Resource from hash/path/metadata when Civitai has no match.
 */
export function normalizeLocalResource(input: NormalizeLocalResourceInput): Resource {
  const displayName = filenameToDisplayName(input.localPath);
  const metadata = input.metadata || null;

  return {
    hash: input.hash.toLowerCase(),
    name: path.basename(input.localPath),
    displayName,
    modelName: displayName,
    modelVersionName: 'Local file',
    type: inferType(input.localPath),
    localPath: input.localPath,
    metadata: metadata as Record<string, any> | undefined,
    localOnlyMetadata: metadata || undefined,
    fileSize: input.fileSize,
    downloadDate: input.downloadDate,
    trainedWords: extractTrainedWords(metadata),
    baseModel: extractBaseModel(metadata),
    source: 'unknown',
    matchStatus: 'unmatched',
  };
}

/**
 * Get effective display title for a resource.
 * Fallback order: displayName -> modelName -> name
 */
export function getResourceDisplayName(resource: Resource): string {
  return (
    resource.displayName ||
    resource.modelName ||
    resource.name ||
    'Unknown'
  );
}
