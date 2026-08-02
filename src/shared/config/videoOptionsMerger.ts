import type {
  StoredOptions,
  StoredVideoOptions,
  VideoOptions,
  VideoScreenshotAttachmentOptions
} from '../types';
import type { StoredOptions as SchemaStoredOptions } from '../schemas/options.schema';
import { DEFAULT_OPTIONS } from './defaultOptions';

function normalizeTemplateValue(
  value: string | undefined,
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
  source:
    | StoredVideoOptions['screenshotAttachment']
    | NonNullable<SchemaStoredOptions['video']>['screenshotAttachment'],
  defaults: VideoScreenshotAttachmentOptions
): VideoScreenshotAttachmentOptions {
  const base = source ?? {};

  return {
    locationTemplate: normalizeTemplateValue(base.locationTemplate, defaults.locationTemplate),
    fileNameTemplate: normalizeTemplateValue(base.fileNameTemplate, defaults.fileNameTemplate),
    markdownUrlFormat: normalizeTemplateValue(base.markdownUrlFormat, defaults.markdownUrlFormat, {
      allowBlank: true
    })
  };
}

export function mergeVideoOptions(
  source?: StoredOptions['video'] | SchemaStoredOptions['video']
): VideoOptions | undefined {
  const defaults = DEFAULT_OPTIONS.video;
  if (!defaults && !source) {
    return undefined;
  }

  const base = source ?? {};
  const merged: VideoOptions = {
    floatingPromptEnabled: base.floatingPromptEnabled ?? defaults?.floatingPromptEnabled ?? true,
    promptButtonLabel:
      (base.promptButtonLabel ?? defaults?.promptButtonLabel ?? '').trim() ||
      defaults?.promptButtonLabel ||
      'Clip video',
    promptShortcut:
      (base.promptShortcut ?? defaults?.promptShortcut ?? '').trim() ||
      defaults?.promptShortcut ||
      'Alt+V',
    controlBarAutoPause: base.controlBarAutoPause ?? defaults?.controlBarAutoPause ?? true,
    controlBarScreenshot: base.controlBarScreenshot ?? defaults?.controlBarScreenshot ?? true,
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
