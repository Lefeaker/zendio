import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { FormSectionHandlers } from '../formSections/formSectionManager';
import { createConnectionTester, type ConnectionTester } from '../controls/connectionTest';
import type { ConnectionResultType } from '../../services/connectionTestRunner';
import { requestConnectionTest, requestVaultConnectionTest } from '../../services/connectionTester';
import {
  applyRestSectionSnapshot,
  collectAdditionalVaultConfigsForTest,
  collectRestDraftForTest,
  type RestSectionDefaultInputs
} from './restSectionState';
import {
  renderRestConnectionTestResult,
  resetRestConnectionTestResult
} from '@options/app/rest-settings/restSectionConnectionResult';
import { getVaultRouterConfig, initializeVaultRouterStore } from '../../state/vaultRouterStore';
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

export function applyRestSectionRepositorySnapshot(options: {
  snapshot: StoredOptions | CompleteOptions;
  defaultInputs: RestSectionDefaultInputs;
  defaultVaultId: string | null;
  defaults: RestOptions;
  setApplyingSnapshot: (isApplying: boolean) => void;
  updateDefaultVaultField: (
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey' | 'localFolder',
    value: string | { id?: string | undefined; name?: string | undefined }
  ) => void;
}): void {
  initializeVaultRouterStore(options.snapshot.vaultRouter ?? null);
  options.setApplyingSnapshot(true);
  try {
    const resolved = applyRestSectionSnapshot({
      options: options.snapshot,
      defaultInputs: options.defaultInputs,
      defaultVaultId: options.defaultVaultId,
      vaultRouterSnapshot: getVaultRouterConfig() ?? null,
      defaults: options.defaults
    });
    if (options.defaultVaultId) {
      options.updateDefaultVaultField('name', resolved.name);
      options.updateDefaultVaultField('localFolder', {
        id: resolved.localFolderId || undefined,
        name: resolved.localFolderName || undefined
      });
      options.updateDefaultVaultField('httpsUrl', resolved.httpsUrl);
      options.updateDefaultVaultField('httpUrl', resolved.httpUrl);
      options.updateDefaultVaultField('apiKey', resolved.apiKey);
    }
  } finally {
    options.setApplyingSnapshot(false);
  }
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
