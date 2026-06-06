import type { StoredOptions, VideoOptions, VideoScreenshotAttachmentOptions } from '../types';
import { DEFAULT_OPTIONS } from './defaultOptions';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTemplateValue(
  value: unknown,
  fallback: string,
  options: { allowBlank: boolean } = { allowBlank: false }
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  return options.allowBlank ? '' : fallback;
}

function mergeScreenshotAttachmentOptions(
  source: unknown,
  defaults: VideoScreenshotAttachmentOptions
): VideoScreenshotAttachmentOptions {
  const base = isPlainObject(source) ? source : {};

  return {
    locationTemplate: normalizeTemplateValue(base.locationTemplate, defaults.locationTemplate),
    fileNameTemplate: normalizeTemplateValue(base.fileNameTemplate, defaults.fileNameTemplate),
    markdownUrlFormat: normalizeTemplateValue(base.markdownUrlFormat, defaults.markdownUrlFormat, {
      allowBlank: true
    })
  };
}

export function mergeVideoOptions(source?: StoredOptions['video']): VideoOptions | undefined {
  const defaults = DEFAULT_OPTIONS.video;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const legacy = base as typeof base & {
    controlBarAutoPauseEnabled?: boolean;
    controlBarCaptureScreenshotEnabled?: boolean;
  };
  const merged: VideoOptions = {
    floatingPromptEnabled: base.floatingPromptEnabled ?? defaults?.floatingPromptEnabled ?? true,
    promptButtonLabel:
      (base.promptButtonLabel ?? defaults?.promptButtonLabel ?? '').trim() ||
      defaults?.promptButtonLabel ||
      '开启视频笔记',
    promptShortcut:
      (base.promptShortcut ?? defaults?.promptShortcut ?? '').trim() ||
      defaults?.promptShortcut ||
      'Alt+V',
    controlBarAutoPause:
      base.controlBarAutoPause ??
      legacy.controlBarAutoPauseEnabled ??
      defaults?.controlBarAutoPause ??
      true,
    controlBarScreenshot:
      base.controlBarScreenshot ??
      legacy.controlBarCaptureScreenshotEnabled ??
      defaults?.controlBarScreenshot ??
      true,
    commentEditorAutoPause:
      base.commentEditorAutoPause ?? defaults?.commentEditorAutoPause ?? false,
    screenshotAttachment: mergeScreenshotAttachmentOptions(base.screenshotAttachment, {
      locationTemplate:
        defaults?.screenshotAttachment.locationTemplate ?? './assets/${noteFileName}',
      fileNameTemplate:
        defaults?.screenshotAttachment.fileNameTemplate ??
        "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg",
      markdownUrlFormat: defaults?.screenshotAttachment.markdownUrlFormat ?? ''
    })
  };
  const promptPosition = base.promptPosition ?? defaults?.promptPosition;
  if (promptPosition) {
    merged.promptPosition = {
      x: Number(promptPosition.x) || 0,
      y: Number(promptPosition.y) || 0
    };
  }
  return merged;
}
