import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import { mergeVideoOptions } from '@shared/config/videoOptionsMerger';

describe('videoOptionsMerger', () => {
  it('projects canonical sparse values over defaults', () => {
    const result = mergeVideoOptions({
      floatingPromptEnabled: false,
      controlBarAutoPause: false,
      controlBarScreenshot: false,
      commentEditorAutoPause: true,
      promptButtonLabel: '  Capture  ',
      promptShortcut: '  Alt+C  ',
      screenshotAttachment: {
        locationTemplate: ' ./captures/${noteFileName} ',
        markdownUrlFormat: ' ![[${path}]] '
      }
    });

    expect(result).toEqual({
      floatingPromptEnabled: false,
      controlBarAutoPause: false,
      controlBarScreenshot: false,
      commentEditorAutoPause: true,
      promptButtonLabel: 'Capture',
      promptShortcut: 'Alt+C',
      screenshotAttachment: {
        locationTemplate: './captures/${noteFileName}',
        fileNameTemplate: DEFAULT_OPTIONS.video.screenshotAttachment.fileNameTemplate,
        markdownUrlFormat: '![[${path}]]'
      }
    });
  });

  it('uses canonical defaults for missing and blank fields', () => {
    expect(mergeVideoOptions()).toEqual(DEFAULT_OPTIONS.video);
    expect(
      mergeVideoOptions({
        promptButtonLabel: ' ',
        promptShortcut: '',
        screenshotAttachment: {
          locationTemplate: ' ',
          fileNameTemplate: ' ',
          markdownUrlFormat: ' '
        }
      })
    ).toEqual(DEFAULT_OPTIONS.video);
  });

  it('does not consume retired aliases after the raw migration stage', () => {
    const legacy = {
      promptButtonLabel: 'Clip video',
      controlBarAutoPauseEnabled: false,
      controlBarCaptureScreenshotEnabled: false
    };
    const result = mergeVideoOptions(legacy);

    expect(result?.controlBarAutoPause).toBe(DEFAULT_OPTIONS.video.controlBarAutoPause);
    expect(result?.controlBarScreenshot).toBe(DEFAULT_OPTIONS.video.controlBarScreenshot);
  });
});
