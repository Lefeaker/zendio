import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chromeApiErrors,
  classifierErrors,
  contentErrors,
  extractionErrors,
  i18nErrors,
  notificationErrors,
  optionsErrors,
  restErrors
} from '@shared/errors';

describe('shared AppError factories', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1779110300000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits descriptor-backed user messages for the full P18 factory set', () => {
    const cause = new Error('boom');
    const cases = [
      {
        error: chromeApiErrors.runtimeError('Tabs query failed', { api: 'tabs' }, cause),
        key: 'errorChromeApiRuntimeError'
      },
      {
        error: chromeApiErrors.unsupportedEnvironment('downloads'),
        key: 'errorChromeApiUnsupportedEnvironment'
      },
      {
        error: classifierErrors.transportFailure('network down', { provider: 'openai' }, { cause }),
        key: 'errorClassifierTransportFailure'
      },
      {
        error: classifierErrors.invalidPayload(
          'payload invalid',
          { provider: 'openai' },
          { cause }
        ),
        key: 'errorClassifierInvalidPayload'
      },
      {
        error: classifierErrors.timeout({ provider: 'openai' }, { cause }),
        key: 'errorClassifierTimeout'
      },
      {
        error: contentErrors.storageOperationFailed('set', 'clipper-position', {}, { cause }),
        key: 'errorContentStorageOperationFailed'
      },
      {
        error: contentErrors.shortcutUsageTrackingFailed({}, { cause }),
        key: 'errorContentShortcutUsageTrackingFailed'
      },
      {
        error: contentErrors.componentInitializationFailed('SupportPrompt', {}, { cause }),
        key: 'errorContentComponentInitializationFailed'
      },
      {
        error: contentErrors.messagingFailed('OPEN_OPTIONS', {}, { cause }),
        key: 'errorContentMessagingFailed'
      },
      {
        error: extractionErrors.noSelection(),
        key: 'errorExtractionNoSelection'
      },
      {
        error: extractionErrors.noMarkdown(),
        key: 'errorExtractionNoMarkdown'
      },
      {
        error: extractionErrors.unsupportedContent(),
        key: 'errorExtractionUnsupportedContent'
      },
      {
        error: extractionErrors.dispatchFailure('bridge down'),
        key: 'errorExtractionDispatchFailure'
      },
      {
        error: i18nErrors.languageLoadFailed(cause),
        key: 'errorI18nLanguageLoadFailed'
      },
      {
        error: i18nErrors.languagePersistFailed('fr', cause),
        key: 'errorI18nLanguageSaveFailed'
      },
      {
        error: notificationErrors.dispatchFailed('dispatch exploded', {}, { cause }),
        key: 'errorNotificationDispatchFailed'
      },
      {
        error: optionsErrors.connectionInProgress({ scope: 'global' }),
        key: 'errorOptionsConnectionInProgress'
      },
      {
        error: optionsErrors.invalidVaultConfig({ scope: 'vault', vaultId: 'main' }),
        key: 'errorOptionsVaultConfigInvalid'
      },
      {
        error: optionsErrors.requestDispatchFailed(new Error('network timeout'), {
          scope: 'global'
        }),
        key: 'errorOptionsConnectionRequestFailed'
      },
      {
        error: optionsErrors.responseInvalid('shape mismatch', {
          scope: 'vault',
          vaultId: 'main'
        }),
        key: 'errorOptionsConnectionResponseInvalid'
      },
      {
        error: restErrors.requestFailed('Failed to fetch', {}, { cause }),
        key: 'errorRestRequestFailed'
      },
      {
        error: restErrors.unexpectedResponse('Invalid JSON', {}, { cause }),
        key: 'errorRestUnexpectedResponse'
      },
      {
        error: restErrors.vaultUnavailable({}, { cause }),
        key: 'errorRestVaultUnavailable'
      }
    ] as const;

    for (const { error, key } of cases) {
      expect(error.userMessage).toBeUndefined();
      expect(error.userMessageDescriptor).toEqual({ key });
    }
  });

  it('keeps the current P06 shared error messages on technical codes when a descriptor exists', () => {
    const cause = new Error('boom');
    const cases = [
      {
        error: classifierErrors.timeout({ provider: 'openai' }, { cause }),
        message: 'CLASSIFIER_TIMEOUT'
      },
      {
        error: contentErrors.shortcutUsageTrackingFailed({}, { cause }),
        message: 'CONTENT_SHORTCUT_USAGE_TRACKING_FAILED'
      },
      {
        error: extractionErrors.noSelection(),
        message: 'EXTRACTION_SELECTION_NO_SELECTION'
      },
      {
        error: extractionErrors.noMarkdown(),
        message: 'EXTRACTION_CONTENT_NO_MARKDOWN'
      },
      {
        error: extractionErrors.unsupportedContent(),
        message: 'EXTRACTION_CONTENT_UNSUPPORTED'
      },
      {
        error: i18nErrors.languageLoadFailed(cause),
        message: 'I18N_LANGUAGE_LOAD_FAILED'
      },
      {
        error: optionsErrors.connectionInProgress({ scope: 'global' }),
        message: 'OPTIONS_CONNECTION_IN_PROGRESS'
      },
      {
        error: optionsErrors.invalidVaultConfig({ scope: 'vault', vaultId: 'main' }),
        message: 'OPTIONS_VAULT_CONFIG_INVALID'
      },
      {
        error: restErrors.vaultUnavailable({}, { cause }),
        message: 'REST_VAULT_UNAVAILABLE'
      }
    ] as const;

    for (const { error, message } of cases) {
      expect(error.message).toBe(message);
    }
  });
});
