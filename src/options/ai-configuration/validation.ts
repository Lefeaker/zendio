import type { CompleteOptions } from '@shared/types/options';
import { normalizeVaultRelativePath } from '@shared/paths/vaultRelativePath';
import { resolveVideoScreenshotAttachmentTemplate } from '@shared/attachments/videoScreenshotAttachmentTemplates';
import { AiConfigInputError } from './types';

export const NOTE_TEMPLATE_TOKENS = [
  'domain',
  'platform',
  'yyyy',
  'mm',
  'dd',
  'HH',
  'HHmmss',
  'HHmm',
  'ss',
  'title',
  'slug'
];

export function validateAiNoteTemplate(template: string, field: string) {
  const tokens = [...template.matchAll(/\{([^{}]*)\}/g)];
  const remainder = template.replace(/\{[^{}]*\}/g, 'note');
  if (
    !template.trim() ||
    /[{}$]/.test(remainder) ||
    tokens.some((match) => !NOTE_TEMPLATE_TOKENS.includes(match[1] ?? ''))
  )
    throw new AiConfigInputError('aiConfigInvalidField', field);
  try {
    normalizeVaultRelativePath(remainder);
  } catch {
    throw new AiConfigInputError('aiConfigInvalidField', field);
  }
}

export function validateAiScreenshotTemplates(options: CompleteOptions) {
  const result = resolveVideoScreenshotAttachmentTemplate(options.video.screenshotAttachment, {
    noteFilePath: 'Notes/example.md',
    originalAttachmentFileName: 'screenshot.jpg',
    capturedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    attachmentIndex: 0
  });
  if (result.usedFallback || result.warnings.length)
    throw new AiConfigInputError('aiConfigInvalidField', 'video.screenshotAttachment');
}
