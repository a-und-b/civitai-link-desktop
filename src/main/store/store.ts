import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import path from 'path';
import { fetchMember } from '../civitai-api';
import { initFolderCheck } from '../folder-watcher';

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  KICKED = 'kicked',
}

export enum Resources {
  CHECKPOINT = 'Checkpoint',
  CONTROLNET = 'ControlNet',
  UPSCALER = 'Upscaler',
  HYPERNETWORK = 'Hypernetwork',
  TEXTUALINVERSION = 'TextualInversion',
  LORA = 'Lora',
  LOCON = 'LoCon',
  VAE = 'VAE',
  DORA = 'DoRA',
}

// Base model to folder name mappings for organizing LoRAs, LoCons, and DoRAs
// Updated from Civitai API /api/v1/enums
export const BASE_MODEL_FOLDERS: Record<string, string> = {
  // Flux models
  'Flux.1 D': 'F1D',
  'Flux.1 S': 'F1S',
  'Flux.1 Krea': 'F1Krea',
  'Flux.1 Kontext': 'F1Kontext',
  'Flux.2 D': 'F2D',
  'Flux.2 Klein 9B': 'F2K9B',
  'Flux.2 Klein 9B-base': 'F2K9B-base',
  'Flux.2 Klein 4B': 'F2K4B',
  'Flux.2 Klein 4B-base': 'F2K4B-base',

  // Stable Diffusion 1.x
  'SD 1.4': 'SD14',
  'SD 1.5': 'SD15',
  'SD 1.5 LCM': 'SD15LCM',
  'SD 1.5 Hyper': 'SD15Hyper',

  // Stable Diffusion 2.x
  'SD 2.0': 'SD20',
  'SD 2.0 768': 'SD20-768',
  'SD 2.1': 'SD21',
  'SD 2.1 768': 'SD21-768',
  'SD 2.1 Unclip': 'SD21Unclip',

  // Stable Diffusion 3.x
  'SD 3': 'SD3',
  'SD 3.5': 'SD35',
  'SD 3.5 Large': 'SD35L',
  'SD 3.5 Large Turbo': 'SD35LT',
  'SD 3.5 Medium': 'SD35M',

  // SDXL variants
  'SDXL 0.9': 'SDXL09',
  'SDXL 1.0': 'SDXL',
  'SDXL 1.0 LCM': 'SDXL-LCM',
  'SDXL Turbo': 'SDXLT',
  'SDXL Lightning': 'SDXLL',
  'SDXL Hyper': 'SDXLH',
  'SDXL Distilled': 'SDXL-Dist',

  // Pony and derivatives
  'Pony': 'Pony',
  'Pony V7': 'PonyV7',

  // Illustrious and NoobAI
  'Illustrious': 'Illus',
  'NoobAI': 'NoobAI',

  // Asian models
  'Hunyuan 1': 'HY1',
  'Hunyuan Video': 'HYVideo',
  'Kolors': 'Kolors',

  // Video models
  'CogVideoX': 'CogVideo',
  'LTXV': 'LTXV',
  'Mochi': 'Mochi',
  'SVD': 'SVD',
  'SVD XT': 'SVDXT',
  'Wan Video': 'WanVideo',
  'Wan Video 1.3B t2v': 'WanV-1.3B',
  'Wan Video 14B t2v': 'WanV-14B-t2v',
  'Wan Video 14B i2v 480p': 'WanV-14B-i2v-480',
  'Wan Video 14B i2v 720p': 'WanV-14B-i2v-720',
  'Wan Video 2.2 TI2V-5B': 'WanV-2.2-TI2V',
  'Wan Video 2.2 I2V-A14B': 'WanV-2.2-I2V',
  'Wan Video 2.2 T2V-A14B': 'WanV-2.2-T2V',
  'Wan Video 2.5 T2V': 'WanV-2.5-T2V',
  'Wan Video 2.5 I2V': 'WanV-2.5-I2V',
  'Veo 3': 'Veo3',
  'Sora 2': 'Sora2',

  // Other generative models
  'AuraFlow': 'Aura',
  'Chroma': 'Chroma',
  'HiDream': 'HiDream',
  'Lumina': 'Lumina',
  'PixArt a': 'PixArt-a',
  'PixArt E': 'PixArt-E',
  'Playground v2': 'PlayGnd',
  'Qwen': 'Qwen',
  'Stable Cascade': 'SC',
  'Seedream': 'Seedream',
  'ZImageTurbo': 'ZIT',

  // Proprietary/closed models
  'Imagen4': 'Imagen4',
  'OpenAI': 'OpenAI',
  'Nano Banana': 'NanoBanana',
  'ODOR': 'ODOR',

  // Other
  'Other': 'Other',
};

const schema: Schema<Record<string, unknown>> = {
  key: {
    type: ['string', 'null'],
    default: null,
  },
  upgradekey: {
    type: ['string', 'null'],
    default: null,
  },
  connectionStatus: {
    type: 'string',
    default: ConnectionStatus.DISCONNECTED,
  },
  sdType: {
    type: 'string',
    default: '',
  },
  // DEPRECATED: Must stick around during migration
  rootResourcePath: {
    type: ['string', 'null'],
    default: null,
  },
  // DEPRECATED: Must stick around during migration
  resourcePaths: {
    type: 'object',
    default: {
      [Resources.CHECKPOINT]: '',
      [Resources.CONTROLNET]: '',
      [Resources.UPSCALER]: '',
      [Resources.HYPERNETWORK]: '',
      [Resources.TEXTUALINVERSION]: '',
      [Resources.LORA]: '',
      [Resources.LOCON]: '',
      [Resources.VAE]: '',
      [Resources.DORA]: '',
    },
  },
  settings: {
    type: 'object',
    default: {
      nsfw: false,
      concurrent: 10,
      alwaysOnTop: false,
      baseModelSubfolders: false,
      scanOnStartup: false,
    },
  },
  apiKey: {
    type: ['string', 'null'],
    default: null,
  },
  user: {
    type: ['object', 'null'],
    default: null,
  },
};

const storeName = app.isPackaged ? undefined : 'experimental';

export const store = new Store({ schema, name: storeName });

export function setKey(key: string | null) {
  store.set('key', key);
}

export function setUpgradeKey(key: string | null) {
  store.set('upgradekey', key);
}

export function setConnectionStatus(status: ConnectionStatus) {
  store.set('connectionStatus', status);
}

export function getKey() {
  return store.get('key');
}

export function getUpgradeKey() {
  return store.get('upgradekey');
}

export function setApiKey(key: string | null) {
  return store.set('apiKey', key);
}

export function watchApiKey({
  mainWindow,
}: {
  mainWindow: Electron.BrowserWindow;
}) {
  store.onDidChange('apiKey', (newValue) => {
    mainWindow.webContents.send('update-api-key', newValue);
  });
}

export function getApiKey() {
  return store.get('apiKey');
}

export function getConnectionStatus() {
  return store.get('connectionStatus');
}

type Settings = {
  nsfw?: boolean;
  alwaysOnTop?: boolean;
  concurrent?: number;
  baseModelSubfolders?: boolean;
  scanOnStartup?: boolean;
};

export function getSettings() {
  const defaults = {
    nsfw: false,
    concurrent: 10,
    alwaysOnTop: false,
    baseModelSubfolders: false,
    scanOnStartup: false,
  };
  const stored = store.get('settings') as Settings;
  return { ...defaults, ...stored };
}

export function setSettings(settings: Settings) {
  const currentSettings = getSettings();

  return store.set('settings', { ...currentSettings, ...settings });
}

export function clearSettings() {
  // TODO: I dont think this works from the store
  store.set('settings', { nsfw: false, alwaysOnTop: false, concurrent: 10, baseModelSubfolders: false, scanOnStartup: false });
  store.set('apiKey', null);
  store.set('user', null);
  store.set('apiKey', null);
  store.clear();
}

export async function setUser() {
  try {
    const user = await fetchMember();

    return store.set('user', user);
  } catch (e) {
    console.log('Error fetching user', e);
    return;
  }
}

export function getUser() {
  return store.get('user');
}

export function watcherUser({
  mainWindow,
}: {
  mainWindow: Electron.BrowserWindow;
}) {
  store.onDidChange('user', (newValue) => {
    mainWindow.webContents.send('fetch-user', newValue);
  });
}

export function getUIStore() {
  return {
    key: store.get('key'),
    rootResourcePath: store.get('rootResourcePath'),
    connectionStatus: store.get('connectionStatus'),
    settings: store.get('settings') as Settings,
    apiKey: store.get('apiKey'),
    user: store.get('user'),
  };
}

export function getRootResourcePath(): string {
  return store.get('rootResourcePath') as string;
}

export function setRootResourcePath(path: string) {
  store.set('rootResourcePath', path);
}

/**
 * Normalize resource type to the canonical store key (Resources enum value).
 * The store uses enum values like 'Lora', 'Checkpoint' as keys - not 'LORA'.
 * This ensures consistent key casing for case-sensitive filesystems.
 */
function getResourceStoreKey(resource: string): string {
  const resourceUpper = resource.toUpperCase();
  const resourceKey = Object.keys(Resources).find(
    (k) => k === resourceUpper,
  ) as keyof typeof Resources | undefined;
  return resourceKey ? Resources[resourceKey] : resource;
}

export function setResourcePath(resource: string, path: string) {
  const storeKey = getResourceStoreKey(resource);
  store.set(`resourcePaths.${storeKey}`, path);
  initFolderCheck();

  return;
}

const SYMLINK: { [key in Resources]?: string } = {
  [Resources.CHECKPOINT]: 'Checkpoints',
  [Resources.CONTROLNET]: 'ControlNet',
  [Resources.UPSCALER]: 'Upscaler',
  [Resources.HYPERNETWORK]: 'Hypernetwork',
  [Resources.TEXTUALINVERSION]: 'embeddings',
  [Resources.LORA]: 'Lora',
  [Resources.LOCON]: 'LoCon',
  [Resources.VAE]: 'VAE',
  [Resources.DORA]: 'DoRA',
};

const A1111_PATHS: { [key in Resources]?: string } = {
  [Resources.CHECKPOINT]: 'Stable-diffusion',
  [Resources.VAE]: 'VAE',
  [Resources.TEXTUALINVERSION]: '../embeddings',
  [Resources.LOCON]: 'LyCORIS',
  [Resources.DORA]: 'DoRA',
};

const COMFY_UI_PATHS: { [key in Resources]?: string } = {
  [Resources.CHECKPOINT]: 'checkpoints',
  [Resources.CONTROLNET]: 'controlnet',
  [Resources.UPSCALER]: 'upscale_models',
  [Resources.HYPERNETWORK]: 'hypernetworks',
  [Resources.TEXTUALINVERSION]: 'embeddings',
  [Resources.LORA]: 'loras',
  [Resources.VAE]: 'vae',
  [Resources.DORA]: 'DoRA',
};

export function setSDType(sdType: string) {
  store.set('sdType', sdType);
}

export function getResourcePath(resourcePath: string) {
  // Try to find the resource type - handle both enum keys (CHECKPOINT) and values (Checkpoint)
  const resource = resourcePath.toUpperCase();

  // Find the corresponding Resources enum value
  const resourceKey = Object.keys(Resources).find(
    (k) => k === resource,
  ) as keyof typeof Resources | undefined;
  const resourceValue = resourceKey ? Resources[resourceKey] : resourcePath;

  const resourcePaths = store.get('resourcePaths') as {
    [k: string]: string;
  };

  // Check canonical key first, then uppercase (for backwards compatibility with old data)
  const storedPath =
    resourcePaths[resourceValue] || resourcePaths[resourcePath.toUpperCase()];

  if (!storedPath || storedPath === '') {
    const rootResourcePath = getRootResourcePath();
    const sdType = store.get('sdType') as string;

    const PATHS = {
      ...SYMLINK,
      ...(sdType === 'a1111'
        ? A1111_PATHS
        : sdType === 'comfyui'
          ? COMFY_UI_PATHS
          : {}),
    };

    const subfolder = PATHS[resourceValue as Resources];
    if (!subfolder) {
      // Return root path for unmapped types, or throw if no root path
      return rootResourcePath || app.getPath('home');
    }

    return path.join(rootResourcePath || app.getPath('home'), subfolder);
  }

  return storedPath;
}

export function getAllPaths() {
  // Use getResourcePath for each resource type to ensure consistent key handling
  const resourceKeys = Object.keys(Resources) as Array<keyof typeof Resources>;
  return resourceKeys.map((key) => getResourcePath(key)).filter((p) => p !== '');
}

/**
 * Get the resource path with optional base model subfolder
 * When baseModelSubfolders setting is enabled, LoRAs, LoCons, and DoRAs
 * will be organized into subfolders based on their base model
 */
export function getResourcePathWithBaseModel(
  resourceType: string,
  baseModel?: string,
) {
  const resource = resourceType.toUpperCase();
  const settings = getSettings();

  // Get the base resource path
  const basePath = getResourcePath(resourceType);

  // Check if base model subfolders feature is enabled
  if (!settings.baseModelSubfolders) {
    return basePath;
  }

  // Only apply to LORA, LOCON, and DORA
  const applicableTypes = [Resources.LORA, Resources.LOCON, Resources.DORA];
  if (!applicableTypes.includes(resource as Resources)) {
    return basePath;
  }

  // If no base model provided or not in mapping, use base path
  if (!baseModel || !BASE_MODEL_FOLDERS[baseModel]) {
    return basePath;
  }

  // Return path with base model subfolder
  const subfolderName = BASE_MODEL_FOLDERS[baseModel];
  return path.join(basePath, subfolderName);
}
