import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { OptionsMutationError } from '../../shared/types/optionsMutationMessages';
import {
  clearAutoSaveFailure,
  showAutoSaveFailure,
  showStatusMessage
} from '../components/messages';
import type { OptionsController } from './optionsController';
import type { OptionsControllerCallbacks } from './optionsControllerTypes';
import { consumePendingAutoSaveSource } from './optionsControllerContext';
import { getOptionsMessages } from './i18nContext';

type AutoSaveNotificationCallbacks = Pick<
  OptionsControllerCallbacks,
  'onSaveError' | 'onSaveSuccess' | 'onAutoSaveRecovered'
>;

export function createOptionsAutoSaveNotificationCallbacks(
  getController: () => OptionsController | null
): AutoSaveNotificationCallbacks {
  let latestFailureGeneration = 0;
  return {
    onSaveError(reason, error, identity) {
      if (reason !== 'auto') return;
      console.error('[options] Auto-save failed:', error);
      if (!identity) return;
      latestFailureGeneration = Math.max(latestFailureGeneration, identity.admissionGeneration);
      const generation = identity.admissionGeneration;
      void showFailure(
        error instanceof OptionsMutationError && error.code === 'OPTIONS_QUOTA_EXCEEDED',
        () => latestFailureGeneration === generation,
        () => getController()?.flushPendingAutoSave() ?? Promise.resolve()
      );
    },
    onSaveSuccess(reason) {
      if (reason !== 'auto') return;
      const source = consumePendingAutoSaveSource();
      if (source) void showAutoSaveNotice(source);
    },
    onAutoSaveRecovered(identity) {
      if (identity.admissionGeneration < latestFailureGeneration) return;
      latestFailureGeneration = 0;
      clearAutoSaveFailure();
    }
  };
}

export async function showAutoSaveNotice(source: string): Promise<void> {
  const msgs = await getOptionsMessages();
  if (source === 'yamlConfig') {
    const text = msgs.yamlConfigAutoSaved ?? DEFAULT_RUNTIME_MESSAGES.yamlConfigAutoSaved;
    showStatusMessage('success', { key: 'yamlConfigAutoSaved', text });
  } else if (source === 'templates') {
    const text = msgs.templatesAutoSaved ?? DEFAULT_RUNTIME_MESSAGES.templatesAutoSaved;
    showStatusMessage('success', { key: 'templatesAutoSaved', text });
  }
}

async function showFailure(
  quotaExceeded: boolean,
  isCurrent: () => boolean,
  retry: () => Promise<void>
): Promise<void> {
  const msgs = await getOptionsMessages();
  if (!isCurrent()) return;
  showAutoSaveFailure({
    message: { key: 'saveFailed', text: msgs.saveFailed ?? DEFAULT_RUNTIME_MESSAGES.saveFailed },
    ...(quotaExceeded
      ? {
          guidance: {
            key: 'autosaveQuotaGuidance',
            text: msgs.autosaveQuotaGuidance ?? DEFAULT_RUNTIME_MESSAGES.autosaveQuotaGuidance
          }
        }
      : {}),
    retryLabel: { key: 'saveButton', text: msgs.saveButton ?? DEFAULT_RUNTIME_MESSAGES.saveButton },
    retry
  });
}
