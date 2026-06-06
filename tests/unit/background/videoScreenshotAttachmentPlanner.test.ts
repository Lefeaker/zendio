import { describe, expect, it } from 'vitest';

import type { VideoScreenshotAttachmentOptions } from '../../../src/shared/types/options';

const screenshotAttachmentDefaults: VideoScreenshotAttachmentOptions = {
  locationTemplate: './assets/${noteFileName}',
  fileNameTemplate: "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg",
  markdownUrlFormat: ''
};

const baseAttachment = {
  id: 'shot-1',
  fileName: 'file-20260606112233444.jpg',
  mimeType: 'image/jpeg',
  dataUrl: 'data:image/jpeg;base64,aaa'
} as const;

function createPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    markdown: '# video\n![Screenshot](aiob-attachment:shot-1)',
    title: 'Video Note',
    type: 'video',
    meta: {
      url: 'https://youtube.com/watch?v=1',
      attachments: [baseAttachment]
    },
    ...overrides
  };
}

describe('prepareVideoClipAttachments', () => {
  it('preserves current default vault behavior for video screenshots', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: screenshotAttachmentDefaults
    });

    expect(result).toEqual({
      markdown: '# video\n![Screenshot](assets/Test/file-20260606112233444.jpg)',
      attachments: [
        {
          ...baseAttachment,
          fileName: 'file-20260606112233444.jpg',
          outputPath: 'Videos/assets/Test/file-20260606112233444.jpg',
          markdownPath: 'assets/Test/file-20260606112233444.jpg',
          markdownUrl: 'assets/Test/file-20260606112233444.jpg'
        }
      ]
    });
  });

  it('supports custom vault-relative screenshot locations', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './attachments/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe(
      '# video\n![Screenshot](attachments/Test/file-20260606112233444.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/attachments/Test/file-20260606112233444.jpg',
        markdownPath: 'attachments/Test/file-20260606112233444.jpg',
        markdownUrl: 'attachments/Test/file-20260606112233444.jpg'
      })
    ]);
  });

  it('supports custom root-relative screenshot locations from the vault root', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: 'attachments/video/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe(
      '# video\n![Screenshot](../attachments/video/Test/file-20260606112233444.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'attachments/video/Test/file-20260606112233444.jpg',
        markdownPath: '../attachments/video/Test/file-20260606112233444.jpg',
        markdownUrl: '../attachments/video/Test/file-20260606112233444.jpg'
      })
    ]);
  });

  it('uses markdownUrlFormat only for placeholder replacement', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat:
          'obsidian://vault/${generatedAttachmentFilePath}?file=${generatedAttachmentFileName}'
      }
    });

    expect(result.markdown).toBe(
      '# video\n![Screenshot](obsidian://vault/Videos/assets/Test/file-20260606112233444.jpg?file=file-20260606112233444.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/assets/Test/file-20260606112233444.jpg',
        markdownPath: 'assets/Test/file-20260606112233444.jpg',
        markdownUrl:
          'obsidian://vault/Videos/assets/Test/file-20260606112233444.jpg?file=file-20260606112233444.jpg'
      })
    ]);
  });

  it('falls back to the computed markdown path when markdownUrlFormat resolves to a full embed', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './attachments/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: '![Screenshot](${generatedAttachmentFilePath})'
      }
    });

    expect(result.markdown).toBe(
      '# video\n![Screenshot](attachments/Test/file-20260606112233444.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/attachments/Test/file-20260606112233444.jpg',
        markdownPath: 'attachments/Test/file-20260606112233444.jpg',
        markdownUrl: 'attachments/Test/file-20260606112233444.jpg'
      })
    ]);
  });

  it('falls back to the legacy-compatible default when the template is malformed', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: "file-${date:{format:'YYYYMMDD'}}.jpg",
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe('# video\n![Screenshot](assets/Test/file-20260606112233444.jpg)');
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/assets/Test/file-20260606112233444.jpg',
        markdownPath: 'assets/Test/file-20260606112233444.jpg'
      })
    ]);
  });

  it('falls back to the legacy-compatible default when the template uses an unsupported token', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './assets/${unknownToken}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe('# video\n![Screenshot](assets/Test/file-20260606112233444.jpg)');
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/assets/Test/file-20260606112233444.jpg',
        markdownPath: 'assets/Test/file-20260606112233444.jpg'
      })
    ]);
  });

  it('disambiguates duplicate generated attachment names', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload({
        markdown: '# video\n![First](aiob-attachment:shot-1)\n![Second](aiob-attachment:shot-2)',
        meta: {
          url: 'https://youtube.com/watch?v=1',
          attachments: [
            {
              ...baseAttachment,
              fileName: 'capture.jpg'
            },
            {
              ...baseAttachment,
              id: 'shot-2',
              fileName: 'capture.jpg',
              dataUrl: 'data:image/jpeg;base64,bbb'
            }
          ]
        }
      }),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe(
      '# video\n![First](assets/Test/capture.jpg)\n![Second](assets/Test/capture-2.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Videos/assets/Test/capture.jpg',
        markdownPath: 'assets/Test/capture.jpg'
      }),
      expect.objectContaining({
        outputPath: 'Videos/assets/Test/capture-2.jpg',
        markdownPath: 'assets/Test/capture-2.jpg'
      })
    ]);
  });

  it('keeps non-video attachments on the legacy path logic and no-ops when attachments are missing', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const nonVideoResult = prepareVideoClipAttachments({
      payload: createPayload({
        type: 'article'
      }),
      notePath: 'Articles/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: {
        locationTemplate: './attachments/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: 'obsidian://vault/${generatedAttachmentFilePath}'
      }
    });

    expect(nonVideoResult.markdown).toBe(
      '# video\n![Screenshot](assets/Test/file-20260606112233444.jpg)'
    );
    expect(nonVideoResult.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'Articles/assets/Test/file-20260606112233444.jpg',
        markdownPath: 'assets/Test/file-20260606112233444.jpg',
        markdownUrl: 'assets/Test/file-20260606112233444.jpg'
      })
    ]);

    const noAttachmentResult = prepareVideoClipAttachments({
      payload: createPayload({
        markdown: '# video\nNo screenshot markers here.',
        meta: {
          url: 'https://youtube.com/watch?v=1'
        }
      }),
      notePath: 'Videos/Test.md',
      destination: 'vault',
      screenshotAttachmentOptions: screenshotAttachmentDefaults
    });

    expect(noAttachmentResult).toEqual({
      markdown: '# video\nNo screenshot markers here.',
      attachments: []
    });
  });

  it('keeps download filenames safe while applying configured markdown paths', async () => {
    const { prepareVideoClipAttachments } =
      await import('../../../src/background/application/videoScreenshotAttachmentPlanner');

    const result = prepareVideoClipAttachments({
      payload: createPayload(),
      notePath: 'video-note.md',
      destination: 'downloads',
      screenshotAttachmentOptions: {
        locationTemplate: 'attachments/video/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      }
    });

    expect(result.markdown).toBe(
      '# video\n![Screenshot](attachments/video/video-note/file-20260606112233444.jpg)'
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        outputPath: 'file-20260606112233444.jpg',
        markdownPath: 'attachments/video/video-note/file-20260606112233444.jpg',
        markdownUrl: 'attachments/video/video-note/file-20260606112233444.jpg'
      })
    ]);
  });
});
