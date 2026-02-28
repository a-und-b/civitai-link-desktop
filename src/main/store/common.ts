import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import { fetchEnums } from '../civitai-api';

const schema: Schema<{ enums: ApiEnums | null }> = {
  enums: {
    type: ['object', 'null'],
    default: {
      ModelType: [],
      ModelFileType: [],
      ActiveBaseModel: [],
      BaseModel: [],
      BaseModelType: [],
    },
  },
};

const storeName = app.isPackaged ? undefined : 'experimental';

export const store = new Store({ schema, name: storeName });

export async function setupCommons() {
  const enums = await fetchEnums();
  store.set('enums', enums);

  return {
    enums,
  };
}

export function getEnums() {
  return store.get('enums') as ApiEnums;
}
