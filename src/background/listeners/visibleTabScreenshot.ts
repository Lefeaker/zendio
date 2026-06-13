import type { TabsService } from '../../platform/interfaces/tabs';
import type { CaptureVisibleTabScreenshotResponse } from '../../shared/types/videoScreenshotMessages';

export type VisibleTabScreenshotSender = {
  tabId?: number;
  windowId?: number;
};

export async function captureVisibleTabScreenshotForSender(
  tabs: Pick<TabsService, 'get' | 'captureVisibleTab'>,
  sender: VisibleTabScreenshotSender
): Promise<CaptureVisibleTabScreenshotResponse> {
  let windowId = typeof sender.windowId === 'number' ? sender.windowId : undefined;
  if (windowId === undefined && typeof sender.tabId === 'number') {
    try {
      windowId = (await tabs.get(sender.tabId))?.windowId;
    } catch {
      windowId = undefined;
    }
  }
  if (windowId === undefined) {
    return { success: false, error: 'Missing sender window for visible tab screenshot.' };
  }
  if (typeof tabs.captureVisibleTab !== 'function') {
    return { success: false, error: 'Visible tab screenshot capture is unsupported.' };
  }
  try {
    const dataUrl = await tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 88 });
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return { success: false, error: 'Visible tab screenshot capture returned no image.' };
    }
    return { success: true, dataUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
