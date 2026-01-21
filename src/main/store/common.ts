import { app } from 'electron';
import Store, { Schema } from 'electron-store';
import { fetchEnums } from '../civitai-api';

const schema: Schema<{ enums: ApiEnums }> = {
  enums: {
    type: 'object',
    properties: {
      ModelType: {
        type: 'array',
        default: [],
      },
      ModelFileType: {
        type: 'array',
        default: [],
      },
      ActiveBaseModel: {
        type: 'array',
        default: [],
      },
      BaseModel: {
        type: 'array',
        default: [],
      },
      BaseModelType: {
        type: 'array',
        default: [],
      },
    },
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
