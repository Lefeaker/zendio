export const CAPTURE_VISIBLE_TAB_SCREENSHOT_MESSAGE = 'AIIOB_CAPTURE_VISIBLE_TAB_SCREENSHOT';

export interface CaptureVisibleTabScreenshotMessage {
  type: typeof CAPTURE_VISIBLE_TAB_SCREENSHOT_MESSAGE;
}

export type CaptureVisibleTabScreenshotResponse =
  | {
      success: true;
      dataUrl: string;
    }
  | {
      success: false;
      error: string;
    };

export function createCaptureVisibleTabScreenshotMessage(): CaptureVisibleTabScreenshotMessage {
  return { type: CAPTURE_VISIBLE_TAB_SCREENSHOT_MESSAGE };
}
