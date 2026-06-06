import type { ConnectionTestResult } from '../../shared/types/connection';
import type { VaultConfig } from '../../shared/types';
import type { RestOptions } from '../../shared/types/options';
import type { IMessagingRepository } from '../../shared/repositories';
import {
  createTrackUsageEventMessage,
  type FailureCategory,
  type StorageTarget
} from '../../shared/types/analytics';
import { bucketDurationMs } from '../../shared/analytics/featureTimer';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import { errorHandler, isAppError, optionsErrors } from '../../shared/errors';
import { validateChannelResult } from './connectionChannelResponseValidation';

type TestState = 'idle' | 'pending';
type TestKey = string;

const DEFAULT_KEY = '__default__';
const states = new Map<TestKey, TestState>();

type ConnectionContext = Parameters<typeof optionsErrors.connectionInProgress>[0];

interface ConnectionTestMessage {
  type: 'TEST_CONNECTION';
  rest?: Partial<RestOptions>;
}

interface VaultConnectionTestMessage {
  type: 'TEST_VAULT_CONNECTION';
  vaultId: string;
  vault: VaultConfig;
}

type RuntimeConnectionMessage = ConnectionTestMessage | VaultConnectionTestMessage;
type PermissionPromptSource = 'clip' | 'options';
type PermissionPromptOutcome = 'completed' | 'failed' | 'cancelled';
type ConnectionTestOutcome = 'completed' | 'failed';
type TrackUsageMessage = ReturnType<typeof createTrackUsageEventMessage>;
interface AnalyticsMessagingRepository {
  send(message: TrackUsageMessage): void;
}
interface ConnectionMessagingRepository {
  send(
    message: RuntimeConnectionMessage
  ): Promise<Partial<ConnectionTestResult> | null | undefined>;
}

let overrideMessagingRepo: IMessagingRepository | null = null;

export function setConnectionTesterMessagingRepository(repo: IMessagingRepository | null): void {
  overrideMessagingRepo = repo;
}

function resolveMessagingRepository(
  provided?: ConnectionMessagingRepository
): ConnectionMessagingRepository {
  if (provided) {
    return provided;
  }
  const repo =
    overrideMessagingRepo ??
    resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  return {
    send: (message) => repo.send<Partial<ConnectionTestResult> | null | undefined>(message)
  };
}

export function isConnectionTestRunning(): boolean {
  return isTestRunning(DEFAULT_KEY);
}

export function isVaultConnectionTestRunning(vaultId: string): boolean {
  return isTestRunning(buildKey(vaultId));
}

export async function requestConnectionTest(
  restDraft?: Partial<RestOptions>,
  messagingRepo?: ConnectionMessagingRepository
): Promise<ConnectionTestResult> {
  const message: ConnectionTestMessage = { type: 'TEST_CONNECTION' };

  if (restDraft && Object.keys(restDraft).length > 0) {
    message.rest = sanitizeRestDraft(restDraft);
  }

  return requestTest(
    message,
    DEFAULT_KEY,
    {
      scope: 'global',
      messageType: 'TEST_CONNECTION'
    },
    messagingRepo
  );
}

export async function requestVaultConnectionTest(
  vault: VaultConfig,
  messagingRepo?: ConnectionMessagingRepository
): Promise<ConnectionTestResult> {
  if (!vault?.id) {
    const error = optionsErrors.invalidVaultConfig({
      scope: 'vault',
      vaultId: vault?.id
    });
    await errorHandler.handle(error, { suppressNotifications: true });
    throw error;
  }
  const message: VaultConnectionTestMessage = {
    type: 'TEST_VAULT_CONNECTION',
    vaultId: vault.id,
    vault
  };
  return requestTest(
    message,
    buildKey(vault.id),
    {
      scope: 'vault',
      vaultId: vault.id,
      messageType: 'TEST_VAULT_CONNECTION'
    },
    messagingRepo
  );
}

function buildKey(vaultId?: string): TestKey {
  return vaultId ?? DEFAULT_KEY;
}

function isTestRunning(key: TestKey): boolean {
  return states.get(key) === 'pending';
}

function setState(key: TestKey, state: TestState): void {
  states.set(key, state);
}

async function requestTest(
  message: RuntimeConnectionMessage,
  key: TestKey,
  context: ConnectionContext,
  messagingRepo?: ConnectionMessagingRepository
): Promise<ConnectionTestResult> {
  if (isTestRunning(key)) {
    const error = optionsErrors.connectionInProgress(context);
    await errorHandler.handle(error, { suppressNotifications: true });
    throw error;
  }

  setState(key, 'pending');

  try {
    const repo = resolveMessagingRepository(messagingRepo);
    const response = await repo.send(message);
    return validateResponse(response, context);
  } catch (error) {
    const appError = isAppError(error)
      ? error
      : optionsErrors.requestDispatchFailed(error, {
          ...context,
          originalError: error
        });
    await errorHandler.handle(appError, { suppressNotifications: true });
    throw appError;
  } finally {
    setState(key, 'idle');
  }
}

function validateResponse(
  response: Partial<ConnectionTestResult> | null | undefined,
  context: ConnectionContext
): ConnectionTestResult {
  if (!response || typeof response !== 'object') {
    throw optionsErrors.responseInvalid('Response payload is not an object.', {
      ...context,
      response
    });
  }

  if (typeof response.success !== 'boolean' || typeof response.message !== 'string') {
    throw optionsErrors.responseInvalid('Missing required fields.', {
      ...context,
      response
    });
  }

  if (response.status !== undefined && typeof response.status !== 'number') {
    throw optionsErrors.responseInvalid('Field "status" must be a number.', {
      ...context,
      response
    });
  }
  if (response.response !== undefined && typeof response.response !== 'string') {
    throw optionsErrors.responseInvalid('Field "response" must be a string.', {
      ...context,
      response
    });
  }
  if (response.error !== undefined && typeof response.error !== 'string') {
    throw optionsErrors.responseInvalid('Field "error" must be a string.', {
      ...context,
      response
    });
  }
  if (response.channels !== undefined && !Array.isArray(response.channels)) {
    throw optionsErrors.responseInvalid('Field "channels" must be an array.', {
      ...context,
      response
    });
  }

  const result: ConnectionTestResult = {
    success: response.success,
    message: response.message
  };

  if (response.status !== undefined) {
    result.status = response.status;
  }
  if (response.response !== undefined) {
    result.response = response.response;
  }
  if (response.error !== undefined) {
    result.error = response.error;
  }
  if (response.channels !== undefined) {
    result.channels = response.channels.map((channel, index) =>
      validateChannelResult(channel, context, index)
    );
  }

  return result;
}

/** @internal */
export function __resetConnectionTesterStateForTests(): void {
  states.clear();
  overrideMessagingRepo = null;
}

export function emitLocalVaultPermissionPrompted(
  messagingRepository: AnalyticsMessagingRepository,
  source: PermissionPromptSource
): void {
  sendUsageEvent(
    messagingRepository,
    createTrackUsageEventMessage('local_vault_permission_prompted', { source })
  );
}

export function emitLocalVaultPermissionResolved(
  messagingRepository: AnalyticsMessagingRepository,
  outcome: PermissionPromptOutcome
): void {
  sendUsageEvent(
    messagingRepository,
    createTrackUsageEventMessage('local_vault_permission_resolved', { outcome })
  );
}

export function emitConnectionTestCompleted(
  messagingRepository: AnalyticsMessagingRepository,
  args: {
    storageTarget: StorageTarget;
    outcome: ConnectionTestOutcome;
    startedAt: number;
    failureCategory?: FailureCategory;
  }
): void {
  const durationBucket = bucketDurationMs(Date.now() - args.startedAt);
  sendUsageEvent(
    messagingRepository,
    createTrackUsageEventMessage('connection_test_completed', {
      storage_target: args.storageTarget,
      outcome: args.outcome,
      duration_bucket: durationBucket,
      ...(args.failureCategory ? { failure_category: args.failureCategory } : {})
    })
  );
}

export function classifyPermissionPromptErrorOutcome(error: unknown): 'failed' | 'cancelled' {
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const normalized = detail.toLowerCase();
  if (normalized.includes('abort') || normalized.includes('cancel')) {
    return 'cancelled';
  }
  return 'failed';
}

function sanitizeRestDraft(draft: Partial<RestOptions>): Partial<RestOptions> {
  const sanitized: Partial<RestOptions> = {};

  if (draft.baseUrl?.trim()) {
    sanitized.baseUrl = draft.baseUrl.trim();
  }
  if (draft.httpsUrl?.trim()) {
    sanitized.httpsUrl = draft.httpsUrl.trim();
  }
  if (draft.httpUrl?.trim()) {
    sanitized.httpUrl = draft.httpUrl.trim();
  }
  if (draft.vault?.trim()) {
    sanitized.vault = draft.vault.trim();
  }
  if (draft.apiKey?.trim()) {
    sanitized.apiKey = draft.apiKey.trim();
  }
  if (draft.localFolderId?.trim()) {
    sanitized.localFolderId = draft.localFolderId.trim();
  }
  if (draft.localFolderName?.trim()) {
    sanitized.localFolderName = draft.localFolderName.trim();
  }

  return sanitized;
}

function sendUsageEvent(
  messagingRepository: AnalyticsMessagingRepository,
  message: TrackUsageMessage
): void {
  void Promise.resolve(messagingRepository.send(message)).catch((error) => {
    console.warn('[Options] Failed to send storage analytics event:', error);
  });
}
