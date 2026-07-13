import fs from 'fs';

const HEADER_SIZE_BYTES = 8;
// Safetensors headers are a small JSON blob; anything larger signals a
// corrupt file or a non-safetensors file whose leading bytes happened to
// decode into a large length.
const MAX_METADATA_BYTES = 100 * 1024 * 1024;

export async function readMetadata(
  filePath: string,
): Promise<Record<string, any> | string> {
  const fileHandle = await fs.promises.open(filePath, 'r');

  try {
    const headerBuffer = Buffer.alloc(HEADER_SIZE_BYTES);
    const { bytesRead: headerBytesRead } = await fileHandle.read(
      headerBuffer,
      0,
      HEADER_SIZE_BYTES,
      0,
    );
    if (headerBytesRead < HEADER_SIZE_BYTES) {
      throw new Error(`${filePath} is not a safetensors file`);
    }

    const metadataLen = new DataView(
      headerBuffer.buffer,
      headerBuffer.byteOffset,
      headerBuffer.byteLength,
    ).getUint32(0, true);

    if (metadataLen <= 2 || metadataLen > MAX_METADATA_BYTES) {
      throw new Error(`${filePath} is not a safetensors file`);
    }

    const metadataBuffer = Buffer.alloc(metadataLen);
    const { bytesRead } = await fileHandle.read(
      metadataBuffer,
      0,
      metadataLen,
      HEADER_SIZE_BYTES,
    );
    if (bytesRead < metadataLen) {
      throw new Error(`${filePath} is not a safetensors file`);
    }

    const jsonStartStr = metadataBuffer.toString('utf8', 0, 2);
    if (!["{'", '{"'].includes(jsonStartStr)) {
      throw new Error(`${filePath} is not a safetensors file`);
    }

    let jsonObj;
    try {
      jsonObj = JSON.parse(metadataBuffer.toString('utf8'));
    } catch {
      throw new Error('Failed to parse metadata JSON');
    }

    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(jsonObj['__metadata__'] || {})) {
      res[k] = v;
      if (typeof v === 'string' && v.startsWith('{')) {
        try {
          res[k] = JSON.parse(v);
        } catch {
          // Ignore the error and use the original string
        }
      }
    }

    return res;
  } finally {
    await fileHandle.close();
  }
}
