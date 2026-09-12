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

const HAN_REGEX = /[\u3400-\u9fff\uf900-\ufaff]/u;

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

  it('keeps runtime compatibility fallback labels empty and free of Chinese synthesized copy', () => {
    const content = createTaskSuccessSurfaceContent();
    const videoControlBarPopover = content.videoControlBarPopover;
    if (!videoControlBarPopover) {
      throw new Error('Missing runtime compatibility video control-bar popover defaults');
    }
    const clipperLabels = content.clipper.labels;
    const clipperSource = content.clipper.source;
    const readerLabels = content.reader.labels;
    const videoLabels = content.video.labels;
    const videoControlTexts = videoControlBarPopover.texts;
    const videoFloatingPrompt = content.videoFloatingPrompt;
    const userVisibleFallbackLabels = [
      clipperLabels.title,
      clipperLabels.selectionPreview,
      clipperLabels.commentLabel,
      clipperSource.title,
      clipperSource.host,
      clipperSource.initials,
      clipperSource.verifiedLabel,
      content.clipper.commentPlaceholder,
      content.clipper.helper,
      readerLabels.title,
      readerLabels.subtitle,
      readerLabels.exitTriggerLabel,
      readerLabels.exitTitle,
      readerLabels.exitCancelLabel,
      readerLabels.exitConfirmLabel,
      readerLabels.notePlaceholder,
      readerLabels.fragmentNotePlaceholder,
      readerLabels.saveLabel,
      readerLabels.deleteLabel,
      content.reader.hint,
      content.reader.counter,
      content.reader.overlaySummary,
      videoLabels.title,
      videoLabels.subtitle,
      videoLabels.exitTriggerLabel,
      videoLabels.exitTitle,
      videoLabels.exitCancelLabel,
      videoLabels.exitConfirmLabel,
      videoLabels.notePlaceholder,
      videoLabels.fragmentNotePlaceholder,
      videoLabels.saveLabel,
      videoLabels.deleteLabel,
      videoLabels.addLabel,
      videoLabels.emptyCapturePlaceholder,
      content.video.status,
      content.video.hint,
      content.video.counter,
      videoControlTexts.notePlaceholder,
      videoControlTexts.noteAriaLabel,
      videoControlTexts.autoPauseLabel,
      videoControlTexts.screenshotLabel,
      videoFloatingPrompt.label,
      videoFloatingPrompt.shortcut,
      videoFloatingPrompt.dismissLabel,
      content.taskSuccess.statusMessage,
      content.taskSuccess.feedbackLabel,
      content.taskSuccess.likeLabel,
      content.taskSuccess.dislikeLabel,
      content.taskSuccess.dismissLabel,
      content.taskSuccess.likeToast.title,
      content.taskSuccess.likeToast.detail,
      content.taskSuccess.dislikeToast.title,
      content.taskSuccess.dislikeToast.detail
    ];

    expect(userVisibleFallbackLabels).not.toHaveLength(0);
    expect(userVisibleFallbackLabels.every((label) => label === '')).toBe(true);
    expect(content.reader.labels.fragmentNotePlaceholder).toBe('');
    expect(JSON.stringify(content)).not.toMatch(HAN_REGEX);
    expect([
      content.clipper.hero.title,
      content.reader.hero.title,
      content.video.hero.title,
      content.taskSuccess.hero.title
    ]).toEqual(['Clipper Dialog', 'Reader Mode', 'Video Mode', 'Task Success']);
    expect(content.taskSuccess.supportChannels).toEqual([
      expect.objectContaining({ title: 'GitHub', subtitle: '' })
    ]);
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
