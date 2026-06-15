import {
  initializeConnectionTestElements,
  type ConnectionResultType
} from '../../services/connectionTestRunner';
import type { RestOptions } from '@shared/types/options';
import type { VaultConfig } from '@shared/types/vault';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { Messages } from '@i18n';
import { isAppError } from '@shared/errors';
import { formatUserVisibleMessage } from '../../../i18n/userVisibleMessageFormatter';

export interface ConnectionTesterConfig {
  button: HTMLButtonElement;
  resultHost: HTMLDivElement;
  getMessages: () => Promise<Messages>;
  getRestDraft: () => Partial<RestOptions>;
  getAdditionalVaultConfigs: () => VaultConfig[];
  renderResult?: (host: HTMLDivElement, type: ConnectionResultType, text: string) => void;
  resetResult?: (host: HTMLDivElement) => void;
  runDefaultTest?: (draft?: Partial<RestOptions>) => Promise<ConnectionTestResult>;
  runVaultTest?: (vault: VaultConfig) => Promise<ConnectionTestResult>;
}

export interface ConnectionTester {
  trigger: () => Promise<void>;
  dispose: () => void;
}

interface TestEntry {
  success: boolean;
  entry: string;
}
type ConnectionControlError = Error | object | string | number | boolean | null | undefined;

let connectionRuntimeModulePromise: Promise<
  typeof import('../../services/connectionTestRuntime')
> | null = null;

function loadConnectionRuntimeModule(): Promise<
  typeof import('../../services/connectionTestRuntime')
> {
  if (!connectionRuntimeModulePromise) {
    connectionRuntimeModulePromise = import('../../services/connectionTestRuntime');
  }
  return connectionRuntimeModulePromise;
}

export function createConnectionTester(config: ConnectionTesterConfig): ConnectionTester {
  const { button, resultHost } = config;

  initializeConnectionTestElements({ button, result: resultHost }, config.resetResult);

  const handleClick = () => {
    void trigger();
  };

  button.addEventListener('click', handleClick);

  async function trigger(): Promise<void> {
    const { runConnectionTest } = await loadConnectionRuntimeModule();
    await runConnectionTest(
      {
        exec: () => runCompositeConnectionTest(config),
        getMessages: config.getMessages,
        ...(config.renderResult !== undefined && { renderResult: config.renderResult }),
        ...(config.resetResult !== undefined && { resetResult: config.resetResult })
      },
      { button, result: resultHost }
    );
  }

  return {
    trigger,
    dispose: () => {
      button.removeEventListener('click', handleClick);
    }
  };
}

async function runCompositeConnectionTest(
  config: ConnectionTesterConfig
): Promise<ConnectionTestResult> {
  const msgs = await config.getMessages();
  const entries: string[] = [];

  const defaultResult = await testDefaultVault(config.getRestDraft, msgs, config.runDefaultTest);
  let overallSuccess = defaultResult.success;
  entries.push(defaultResult.entry);

  const additionalResults = await testAdditionalVaults(
    config.getAdditionalVaultConfigs,
    msgs,
    config.runVaultTest
  );
  for (const item of additionalResults) {
    entries.push(item.entry);
    overallSuccess = overallSuccess && item.success;
  }

  const summary = entries.join('；');
  if (overallSuccess) {
    return {
      success: true,
      message: summary,
      response: summary
    };
  }

  return {
    success: false,
    message: summary,
    error: summary,
    response: summary
  };
}

async function testDefaultVault(
  getRestDraft: () => Partial<RestOptions>,
  msgs: Messages,
  runTest?: (draft?: Partial<RestOptions>) => Promise<ConnectionTestResult>
): Promise<TestEntry> {
  const label = msgs.defaultVaultBadge ?? 'default';
  try {
    const restDraft = getRestDraft();
    const requester = runTest ?? (await loadConnectionRuntimeModule()).requestConnectionTest;
    const result = await requester(restDraft);
    const detail = extractResultMessage(result, msgs);
    return { success: result.success, entry: formatEntry(label, result.success, detail, msgs) };
  } catch (error) {
    const errorInput: ConnectionControlError =
      error instanceof Error ||
      typeof error === 'string' ||
      typeof error === 'number' ||
      typeof error === 'boolean' ||
      error === null ||
      error === undefined ||
      typeof error === 'object'
        ? error
        : undefined;
    const detail = extractErrorMessage(errorInput, msgs);
    return { success: false, entry: formatEntry(label, false, detail, msgs) };
  }
}

async function testAdditionalVaults(
  getConfigs: () => VaultConfig[],
  msgs: Messages,
  runTest?: (vault: VaultConfig) => Promise<ConnectionTestResult>
): Promise<TestEntry[]> {
  const configs = getConfigs();
  const results: TestEntry[] = [];
  const requester = runTest ?? (await loadConnectionRuntimeModule()).requestVaultConnectionTest;

  for (const config of configs) {
    const label =
      ((config.name || config.vault || '').trim() ||
        msgs.additionalVaultsTitle ||
        msgs.vaultNameLabel) ??
      'vault';
    try {
      const response = await requester(config);
      const detail = extractResultMessage(response, msgs);
      results.push({
        success: response.success,
        entry: formatEntry(label, response.success, detail, msgs)
      });
    } catch (error) {
      const errorInput: ConnectionControlError =
        error instanceof Error ||
        typeof error === 'string' ||
        typeof error === 'number' ||
        typeof error === 'boolean' ||
        error === null ||
        error === undefined ||
        typeof error === 'object'
          ? error
          : undefined;
      const detail = extractErrorMessage(errorInput, msgs);
      results.push({
        success: false,
        entry: formatEntry(label, false, detail, msgs)
      });
    }
  }

  return results;
}

function extractResultMessage(result: ConnectionTestResult, msgs: Messages): string {
  if (result.success) {
    const text = result.messageDescriptor
      ? formatUserVisibleMessage(result.messageDescriptor, msgs, '').trim()
      : '';
    return text || msgs.connectionSuccessShort;
  }

  const errorText = result.errorDescriptor
    ? formatUserVisibleMessage(result.errorDescriptor, msgs, '').trim()
    : '';
  if (errorText) {
    return errorText;
  }

  const technicalDetail = (result.error ?? '').trim();
  if (technicalDetail) {
    return technicalDetail;
  }

  return msgs.connectionFailed;
}

function extractErrorMessage(error: ConnectionControlError, msgs: Messages): string {
  if (isAppError(error)) {
    return error.userMessage ?? error.message ?? msgs.connectionFailed;
  }

  if (error instanceof Error) {
    return error.message || msgs.connectionFailed;
  }

  return String(error);
}

function formatEntry(label: string, success: boolean, detail: string, msgs: Messages): string {
  const normalizedDetail =
    detail.trim() || (success ? msgs.connectionSuccessShort : msgs.connectionFailed);
  return `${label}: ${normalizedDetail}`;
}
