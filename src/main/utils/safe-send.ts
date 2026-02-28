import { getWindow } from '../browser-window';

/**
 * Safely send an IPC event to the renderer process
 * Returns true if the event was sent successfully, false otherwise
 */
export function safeSend(channel: string, ...args: unknown[]): boolean {
  const window = getWindow();
  if (!window || window.isDestroyed()) {
    console.warn(`Cannot send ${channel}: Window not available`);
    return false;
  }

  const { webContents } = window;
  if (!webContents || webContents.isDestroyed()) {
    console.warn(`Cannot send ${channel}: WebContents not available`);
    return false;
  }

  // Don't send if renderer isn't ready yet
  if (webContents.isLoading()) {
    console.warn(`Cannot send ${channel}: Renderer still loading`);
    return false;
  }

  try {
    webContents.send(channel, ...args);
    return true;
  } catch (error) {
    console.error(`Error sending IPC event ${channel}:`, error);
    return false;
  }
}
