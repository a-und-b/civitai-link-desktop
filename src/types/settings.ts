// Auto-generated type definitions for Settings
// based on the schema in src/main/store/paths.ts

export type Settings = {
  sdType: string;
  resourcePaths: Record<string, string>;
  resources: Record<string, unknown>;
  scanOnStartup: boolean;
  nsfw: boolean;
  alwaysOnTop: boolean;
  concurrent: number;
  baseModelSubfolders: boolean;
};
