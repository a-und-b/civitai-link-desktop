import { Socket } from 'socket.io-client';
// import { downloadFile } from '../download-file';
import { BrowserWindow } from 'electron';
import { getModelByHash } from '../civitai-api';
import { downloadFile } from '../download-file';
import { updateActivity } from '../store/activities';
import { getResourcePathWithBaseModel } from '../store/store';

type ResourcesAddParams = {
  id: string;
  payload: Resource;
  socket: Socket;
  mainWindow: BrowserWindow;
};

export async function resourcesAdd(params: ResourcesAddParams) {
  const payload = params.payload;
  const hashLowercase = payload.hash.toLowerCase();
  const modelInfo = await getModelByHash(hashLowercase);
  const {
    previewImageUrl,
    civitaiUrl,
    modelVersionId,
    baseModel,
    trainedWords,
    description,
  } = modelInfo;
  const resourcePath = getResourcePathWithBaseModel(
    payload.type ?? 'Checkpoint',
    baseModel,
  );
  const timestamp = new Date().toISOString();

  params.socket.emit('commandStatus', {
    status: 'processing',
    id: params.id,
    resource: payload,
    type: 'resources:add',
  });

  params.mainWindow.webContents.send('activity-add', {
    id: params.id,
    downloadDate: timestamp,
    ...payload,
    hash: hashLowercase,
    previewImageUrl,
    civitaiUrl,
    downloading: true,
    modelVersionId,
  });

  const activity: ActivityItem = {
    name: payload.modelName ?? payload.name ?? 'Unknown',
    date: timestamp,
    type: 'downloading' as ActivityType,
    civitaiUrl,
  };

  updateActivity(activity);

  const downloadUrl = payload.url;
  if (!downloadUrl) {
    throw new Error('Download URL is required');
  }
  await downloadFile({
    resource: {
      id: params.id,
      name: payload.name,
      url: downloadUrl,
      type: payload.type,
      hash: hashLowercase,
      modelName: payload.modelName ?? payload.name,
      modelVersionName: payload.modelVersionName ?? 'Unknown',
      modelVersionId,
      previewImageUrl,
      civitaiUrl,
      baseModel,
      trainedWords,
      description,
    },
    downloadPath: resourcePath,
    socket: params.socket,
    mainWindow: params.mainWindow,
  });
}
