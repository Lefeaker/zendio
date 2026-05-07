import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { VaultConfig } from '@shared/types/vault';
import type { FormSectionHandlers } from '../formSections/formSectionManager';
import { createConnectionTester, type ConnectionTester } from '../controls/connectionTest';
import type { ConnectionResultType } from '../../services/connectionTestRunner';
import { requestConnectionTest, requestVaultConnectionTest } from '../../services/connectionTester';
import { collectAdditionalVaultConfigsForTest, collectRestDraftForTest } from './restSectionState';
import {
  renderRestConnectionTestResult,
  resetRestConnectionTestResult
} from './restSectionConnectionResult';
import { getVaultRouterConfig } from '../../state/vaultRouterStore';
import { getOptionsMessages } from '../../app/i18nContext';

interface RestDefaultInputs {
  nameInput: HTMLInputElement | null;
  httpsInput: HTMLInputElement | null;
  httpInput: HTMLInputElement | null;
  apiKeyInput: HTMLInputElement | null;
}

export function registerRestSectionFormBinding(options: {
  registerManagedFormSection: (sectionId: string, binding: FormSectionHandlers) => void;
  applySnapshot: (options: StoredOptions | CompleteOptions) => void;
  collectChanges: (previous: StoredOptions | null) => Partial<CompleteOptions>;
}): void {
  options.registerManagedFormSection('rest', {
    applySnapshot: (snapshot) => {
      options.applySnapshot(snapshot);
    },
    collectChanges: (previous) => options.collectChanges(previous)
  });
}

export function subscribeRestSectionRepository(
  optionsRepo: IOptionsRepository,
  onSnapshot: (options: CompleteOptions) => void
): () => void {
  return optionsRepo.onChange((options) => {
    onSnapshot(options);
  });
}

export function createRestSectionConnectionTester(options: {
  button: HTMLButtonElement | null;
  resultHost: HTMLDivElement | null;
  defaultInputs: RestDefaultInputs;
  additionalRowsHost: HTMLElement | null;
  defaultVaultId: string | null;
  messagingRepo: IMessagingRepository;
}): ConnectionTester | null {
  if (!options.button || !options.resultHost) {
    return null;
  }

  return createConnectionTester({
    button: options.button,
    resultHost: options.resultHost,
    getMessages: getOptionsMessages,
    getRestDraft: () =>
      collectRestDraftForTest({
        nameInput: options.defaultInputs.nameInput,
        httpsInput: options.defaultInputs.httpsInput,
        httpInput: options.defaultInputs.httpInput,
        apiKeyInput: options.defaultInputs.apiKeyInput
      }),
    getAdditionalVaultConfigs: () =>
      collectAdditionalVaultConfigsForTest({
        additionalRowsHost: options.additionalRowsHost,
        vaultRouterSnapshot: getVaultRouterConfig() ?? null,
        defaultVaultId: options.defaultVaultId
      }),
    renderResult: (_host, type, text) =>
      renderRestConnectionTestResult({
        connectionResultHost: options.resultHost,
        type: type as ConnectionResultType,
        text
      }),
    resetResult: () => {
      resetRestConnectionTestResult(options.resultHost);
    },
    runDefaultTest: (draft) => requestConnectionTest(draft, options.messagingRepo),
    runVaultTest: (vault) => requestVaultConnectionTest(vault, options.messagingRepo)
  });
}
