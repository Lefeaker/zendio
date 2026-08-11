import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createClipperSurfaceContent,
  createReaderSurfaceContent,
  createTaskSuccessSurfaceContent,
  createVideoSurfaceContent
} from '@content/stitch/runtimeSurfaceContent';

const readerTexts = {
  title: 'Reader',
  status: 'Ready',
  counter: '{count}',
  counterZero: 'None',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Hint',
  highlightEditLabel: 'Edit',
  highlightDeleteLabel: 'Delete',
  highlightNoComment: 'No note',
  highlightSaveLabel: 'Save',
  highlightCancelLabel: 'Cancel edit',
  highlightEditPlaceholder: 'Note',
  highlightFocusLabel: 'Focus'
};

const videoTexts = {
  title: 'Video',
  status: 'Ready',
  counter: '{count}',
  counterZero: 'None',
  add: 'Add',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Hint',
  captureEditLabel: 'Edit',
  captureDeleteLabel: 'Delete',
  captureNoComment: 'No note',
  captureSaveLabel: 'Save',
  captureCancelLabel: 'Cancel edit',
  captureEditPlaceholder: 'Note',
  captureFocusLabel: 'Focus'
};

describe('runtimeSurfaceContent', () => {
  it('preserves the explicit Clipper, Reader, and Video icon URLs', () => {
    const clipper = createClipperSurfaceContent({
      selectedText: 'Selection',
      commentPlaceholder: 'Comment',
      labels: { title: 'Clipper', selectionPreview: 'Preview', commentLabel: 'Comment' },
      source: { title: 'Source', host: 'example.com', initials: 'EX', verifiedLabel: 'Verified' },
      actions: [],
      iconUrl: 'clipper-explicit.png'
    });
    const reader = createReaderSurfaceContent({
      texts: readerTexts,
      highlights: [],
      counter: '0',
      actions: [],
      iconUrl: 'reader-explicit.png'
    });
    const video = createVideoSurfaceContent({
      texts: videoTexts,
      captures: [],
      counter: '0',
      actions: [],
      iconUrl: 'video-explicit.png'
    });

    expect(clipper.clipper.iconUrl).toBe('clipper-explicit.png');
    expect(reader.reader.iconUrl).toBe('reader-explicit.png');
    expect(video.video.iconUrl).toBe('video-explicit.png');
  });

  it('creates only the compact six-surface runtime payload', () => {
    const content = createTaskSuccessSurfaceContent();

    expect(Object.keys(content)).toEqual([
      'clipper',
      'reader',
      'video',
      'videoControlBarPopover',
      'videoFloatingPrompt',
      'taskSuccess'
    ]);
    expect(content.taskSuccess.supportChannels).not.toHaveLength(0);
    expect(content).not.toHaveProperty('brand');
    expect(content).not.toHaveProperty('resources');
    expect(content).not.toHaveProperty('storage');
  });

  it('does not restore optional icon inputs or fallback expressions', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/stitch/runtimeSurfaceContent.ts'),
      'utf8'
    );

    expect(source).not.toContain('iconUrl?:');
    expect(source).not.toContain('input.iconUrl ??');
  });
});
