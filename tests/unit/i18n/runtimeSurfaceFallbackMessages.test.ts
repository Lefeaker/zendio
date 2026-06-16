import { describe, expect, it } from 'vitest';

import { schemaShellMessagesEnglish } from '../../../src/i18n/generated/schemaMessages.generated';
import { DEFAULT_RUNTIME_MESSAGES } from '../../../src/i18n/locales';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '../../../src/i18n/catalog/runtimeSurfaceFallbackMessages';
import type { Messages } from '../../../src/i18n/messages';

describe('RUNTIME_SURFACE_FALLBACK_MESSAGES', () => {
  it('stays aligned with generated English catalog defaults', () => {
    const catalogMessages: Messages = {
      ...DEFAULT_RUNTIME_MESSAGES,
      ...schemaShellMessagesEnglish
    };

    for (const key of Object.keys(RUNTIME_SURFACE_FALLBACK_MESSAGES) as Array<
      keyof typeof RUNTIME_SURFACE_FALLBACK_MESSAGES
    >) {
      expect(RUNTIME_SURFACE_FALLBACK_MESSAGES[key], key).toBe(catalogMessages[key]);
    }
  });
});
