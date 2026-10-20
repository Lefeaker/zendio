import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE,
  DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE,
  disambiguateResolvedVideoScreenshotAttachmentTemplate,
  renderAttachmentMarkdownUrl,
  resolveVideoScreenshotAttachmentTemplate
} from '../../../src/shared/attachments/videoScreenshotAttachmentTemplates';

const BASE_CONTEXT = {
  noteFilePath: 'Videos/My Clip.md',
  originalAttachmentFileName: 'file-20260606112233444.jpg',
  capturedAt: new Date(2026, 5, 6, 11, 22, 33, 444).getTime(),
  attachmentIndex: 1
} as const;

describe('resolveVideoScreenshotAttachmentTemplate', () => {
  it('preserves current default behavior for plugin-compatible templates', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE,
        fileNameTemplate: DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE,
        markdownUrlFormat: ''
      },
      BASE_CONTEXT
    );

    expect(result).toMatchObject({
      generatedFileName: 'file-20260606112233444.jpg',
      markdownPath: 'assets/My Clip/file-20260606112233444.jpg',
      outputPath: 'Videos/assets/My Clip/file-20260606112233444.jpg',
      generatedAttachmentFilePath: 'Videos/assets/My Clip/file-20260606112233444.jpg',
      markdownUrl: 'assets/My%20Clip/file-20260606112233444.jpg',
      usedFallback: false,
      warnings: []
    });
  });

  it('resolves root-relative locations from the vault root', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: 'Media/Video/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      },
      BASE_CONTEXT
    );

    expect(result.outputPath).toBe('Media/Video/My Clip/file-20260606112233444.jpg');
    expect(result.markdownPath).toBe('../Media/Video/My Clip/file-20260606112233444.jpg');
    expect(result.markdownUrl).toBe('../Media/Video/My%20Clip/file-20260606112233444.jpg');
  });

  it('renders note folder, note name, and note path tokens case-insensitively', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './${NOTEFOLDERNAME}/${notefilename}/${notefolderpath}/${notefilepath}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      },
      {
        ...BASE_CONTEXT,
        noteFilePath: 'Videos/Sub Folder/My Clip.md'
      }
    );

    expect(result.outputPath).toBe(
      'Videos/Sub Folder/Sub Folder/My Clip/Videos/Sub Folder/Videos/Sub Folder/My Clip.md/file-20260606112233444.jpg'
    );
    expect(result.markdownPath).toBe(
      'Sub Folder/My Clip/Videos/Sub Folder/Videos/Sub Folder/My Clip.md/file-20260606112233444.jpg'
    );
  });

  it('renders original attachment filename and extension tokens', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets',
        fileNameTemplate: '${originalAttachmentFileName}-${ORIGINALATTACHMENTFILEEXTENSION}',
        markdownUrlFormat: ''
      },
      {
        ...BASE_CONTEXT,
        originalAttachmentFileName: 'clip-shot.final.png'
      }
    );

    expect(result.generatedFileName).toBe('clip-shot.final-png.jpg');
    expect(result.outputPath).toBe('Videos/assets/clip-shot.final-png.jpg');
  });

  it('renders generated attachment tokens inside markdownUrlFormat', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat:
          'obsidian://vault/${generatedAttachmentFilePath}?file=${generatedAttachmentFileName}'
      },
      BASE_CONTEXT
    );

    expect(result.markdownUrl).toBe(
      'obsidian://vault/Videos/assets/My Clip/file-20260606112233444.jpg?file=file-20260606112233444.jpg'
    );
  });

  it('falls back to markdownPath when markdownUrlFormat uses an unsupported token', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: '${unknownToken}'
      },
      BASE_CONTEXT
    );

    expect(result.markdownPath).toBe('assets/My Clip/file-20260606112233444.jpg');
    expect(result.markdownUrl).toBe('assets/My%20Clip/file-20260606112233444.jpg');
    expect(result.usedFallback).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('markdownUrlFormat'),
        expect.stringContaining('unknownToken')
      ])
    );
  });

  it('falls back to markdownPath when markdownUrlFormat resolves to a full embed', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: '![Screenshot](${generatedAttachmentFilePath})'
      },
      BASE_CONTEXT
    );

    expect(result.markdownPath).toBe('assets/My Clip/file-20260606112233444.jpg');
    expect(result.markdownUrl).toBe('assets/My%20Clip/file-20260606112233444.jpg');
    expect(result.usedFallback).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('markdownUrlFormat'),
        expect.stringContaining('full embed')
      ])
    );
  });

  it('supports padded and unpadded moment-like date tokens with single or double quotes', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets',
        fileNameTemplate:
          '${date:{momentJsFormat:\'YYYYMMDDHHmmssSSS\'}}-${date:{momentJsFormat:"M-D-H-m-s"}}',
        markdownUrlFormat: ''
      },
      {
        ...BASE_CONTEXT,
        capturedAt: new Date(2026, 5, 7, 8, 9, 4, 5).getTime()
      }
    );

    expect(result.generatedFileName).toBe('20260607080904005-6-7-8-9-4.jpg');
  });

  it('falls back and records a warning for unsupported tokens', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets/${unknownToken}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat: ''
      },
      BASE_CONTEXT
    );

    expect(result.outputPath).toBe('Videos/assets/My Clip/file-20260606112233444.jpg');
    expect(result.usedFallback).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('locationTemplate'),
        expect.stringContaining('unknownToken')
      ])
    );
  });

  it('falls back and records a warning for malformed date objects', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets',
        fileNameTemplate: "file-${date:{format:'YYYYMMDD'}}.jpg",
        markdownUrlFormat: ''
      },
      BASE_CONTEXT
    );

    expect(result.generatedFileName).toBe('file-20260606112233444.jpg');
    expect(result.usedFallback).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fileNameTemplate'),
        expect.stringContaining('momentJsFormat')
      ])
    );
  });

  it.each(['./assets/../escape', '/absolute/path', 'C:/absolute/path'])(
    'rejects unsafe rendered locations and falls back to defaults: %s',
    (locationTemplate) => {
      const result = resolveVideoScreenshotAttachmentTemplate(
        {
          locationTemplate,
          fileNameTemplate: '${originalAttachmentFileName}',
          markdownUrlFormat: ''
        },
        BASE_CONTEXT
      );

      expect(result.outputPath).toBe('Videos/assets/My Clip/file-20260606112233444.jpg');
      expect(result.usedFallback).toBe(true);
    }
  );

  it('sanitizes separators in generated file names and appends .jpg when missing', () => {
    const result = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets',
        fileNameTemplate: 'nested/${noteFileName}',
        markdownUrlFormat: ''
      },
      BASE_CONTEXT
    );

    expect(result.generatedFileName).toBe('nested_My Clip.jpg');
  });
});

describe('disambiguateResolvedVideoScreenshotAttachmentTemplate', () => {
  it('appends a deterministic numeric suffix before .jpg and updates derived paths', () => {
    const resolved = resolveVideoScreenshotAttachmentTemplate(
      {
        locationTemplate: './assets/${noteFileName}',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat:
          'obsidian://vault/${generatedAttachmentFilePath}?file=${generatedAttachmentFileName}'
      },
      BASE_CONTEXT
    );

    const duplicate = disambiguateResolvedVideoScreenshotAttachmentTemplate(resolved, 2);

    expect(duplicate.generatedFileName).toBe('file-20260606112233444-2.jpg');
    expect(duplicate.outputPath).toBe('Videos/assets/My Clip/file-20260606112233444-2.jpg');
    expect(duplicate.markdownPath).toBe('assets/My Clip/file-20260606112233444-2.jpg');
    expect(duplicate.generatedAttachmentFilePath).toBe(
      'Videos/assets/My Clip/file-20260606112233444-2.jpg'
    );
    expect(duplicate.markdownUrl).toBe(
      'obsidian://vault/Videos/assets/My Clip/file-20260606112233444-2.jpg?file=file-20260606112233444-2.jpg'
    );
  });
});

it('disambiguates default encoded URLs while preserving raw paths', () => {
  const resolved = resolveVideoScreenshotAttachmentTemplate(
    {
      locationTemplate: './assets/${noteFileName}',
      fileNameTemplate: '${originalAttachmentFileName}',
      markdownUrlFormat: ''
    },
    {
      ...BASE_CONTEXT,
      noteFilePath: 'Videos/Note #50% (中文).md',
      originalAttachmentFileName: 'frame #50% (截图).jpg'
    }
  );
  const duplicate = disambiguateResolvedVideoScreenshotAttachmentTemplate(resolved, 2);
  expect(duplicate.outputPath).toBe('Videos/assets/Note #50% (中文)/frame #50% (截图)-2.jpg');
  expect(duplicate.markdownUrl).toBe(
    'assets/Note%20%2350%25%20%28%E4%B8%AD%E6%96%87%29/frame%20%2350%25%20%28%E6%88%AA%E5%9B%BE%29-2.jpg'
  );
  expect(decodeURIComponent(duplicate.markdownUrl)).toBe(duplicate.markdownPath);
});

it('renames generated URL tokens without changing identical folder and literal text', () => {
  const resolved = resolveVideoScreenshotAttachmentTemplate(
    {
      locationTemplate: 'shot.jpg',
      fileNameTemplate: '${originalAttachmentFileName}',
      markdownUrlFormat:
        'obsidian://vault/${generatedAttachmentFilePath}?file=pre-${generatedAttachmentFileName}.cache&keep=shot.jpg&original=${originalAttachmentFileName}&note=${noteFileName}'
    },
    { ...BASE_CONTEXT, noteFilePath: 'shot.jpg.md', originalAttachmentFileName: 'shot.jpg' }
  );
  const duplicate = disambiguateResolvedVideoScreenshotAttachmentTemplate(resolved, 2);
  expect(duplicate.outputPath).toBe('shot.jpg/shot-2.jpg');
  expect(duplicate.markdownUrl).toBe(
    'obsidian://vault/shot.jpg/shot-2.jpg?file=pre-shot-2.jpg.cache&keep=shot.jpg&original=shot&note=shot.jpg'
  );
});

it('renders native URL-safe values only into generated tokens, including embedded and repeated tokens', () => {
  const resolved = resolveVideoScreenshotAttachmentTemplate(
    {
      locationTemplate: 'Raw Folder/shot.jpg',
      fileNameTemplate: '${originalAttachmentFileName}',
      markdownUrlFormat:
        'obsidian://vault/${GeneratedAttachmentFilePath}?file=pre-${generatedAttachmentFileName}.cache&keep=shot.jpg#${generatedAttachmentFileName}/${date:{momentJsFormat:"YYYY"}}'
    },
    { ...BASE_CONTEXT, originalAttachmentFileName: 'shot.jpg' }
  );
  expect(
    renderAttachmentMarkdownUrl(resolved, {
      generatedFileName: 'shot%20%281%29.jpg',
      generatedAttachmentFilePath: 'Raw Folder/shot.jpg/shot%20%281%29.jpg',
      markdownPath: '../Raw Folder/shot.jpg/shot (1).jpg'
    })
  ).toBe(
    'obsidian://vault/Raw Folder/shot.jpg/shot%20%281%29.jpg?file=pre-shot%20%281%29.jpg.cache&keep=shot.jpg#shot%20%281%29.jpg/2026'
  );
});

it('preserves an explicit custom literal even when it equals the generated default path', () => {
  const resolved = resolveVideoScreenshotAttachmentTemplate(
    {
      locationTemplate: './assets',
      fileNameTemplate: '${originalAttachmentFileName}',
      markdownUrlFormat: 'assets/shot.jpg'
    },
    { ...BASE_CONTEXT, noteFilePath: 'note.md', originalAttachmentFileName: 'shot.jpg' }
  );
  expect(disambiguateResolvedVideoScreenshotAttachmentTemplate(resolved, 2)).toMatchObject({
    outputPath: 'assets/shot-2.jpg',
    markdownPath: 'assets/shot-2.jpg',
    markdownUrl: 'assets/shot.jpg'
  });
});

it.each(['assets/My Clip/shot.jpg', 'assets/My%20Clip/shot.jpg'])(
  'keeps a default URL without optional provenance compatible: %s',
  (markdownUrl) => {
    expect(
      renderAttachmentMarkdownUrl(
        { markdownUrl, markdownPath: 'assets/My Clip/shot.jpg' },
        {
          generatedFileName: 'shot%20%281%29.jpg',
          generatedAttachmentFilePath: 'assets/My Clip/shot%20%281%29.jpg',
          markdownPath: 'assets/My Clip/shot (1).jpg'
        }
      )
    ).toBe('assets/My%20Clip/shot%20%281%29.jpg');
  }
);

it('leaves an unknown manual custom URL without provenance unchanged', () => {
  expect(
    renderAttachmentMarkdownUrl(
      { markdownUrl: 'https://example.invalid/static-shot.jpg', markdownPath: 'assets/shot.jpg' },
      {
        generatedFileName: 'shot-2.jpg',
        generatedAttachmentFilePath: 'assets/shot-2.jpg',
        markdownPath: 'assets/shot-2.jpg'
      }
    )
  ).toBe('https://example.invalid/static-shot.jpg');
});
