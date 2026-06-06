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
type AnalyticsMessagingRepository = Pick<IMessagingRepository, 'send'>;

let overrideMessagingRepo: IMessagingRepository | null = null;

export function setConnectionTesterMessagingRepository(repo: IMessagingRepository | null): void {
  overrideMessagingRepo = repo;
}

function resolveMessagingRepository(provided?: IMessagingRepository): IMessagingRepository {
  if (provided) {
    return provided;
  }
  if (overrideMessagingRepo) {
    return overrideMessagingRepo;
  }
  return resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
}

export function isConnectionTestRunning(): boolean {
  return isTestRunning(DEFAULT_KEY);
}

export function isVaultConnectionTestRunning(vaultId: string): boolean {
  return isTestRunning(buildKey(vaultId));
}

export async function requestConnectionTest(
  restDraft?: Partial<RestOptions>,
  messagingRepo?: IMessagingRepository
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
  messagingRepo?: IMessagingRepository
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
  messagingRepo?: IMessagingRepository
): Promise<ConnectionTestResult> {
  if (isTestRunning(key)) {
    const error = optionsErrors.connectionInProgress(context);
    await errorHandler.handle(error, { suppressNotifications: true });
    throw error;
  }

  setState(key, 'pending');

  try {
    const repo = resolveMessagingRepository(messagingRepo);
    const response = await repo.send<ConnectionTestResult>(message);
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

function validateResponse(response: unknown, context: ConnectionContext): ConnectionTestResult {
  if (!response || typeof response !== 'object') {
    throw optionsErrors.responseInvalid('Response payload is not an object.', {
      ...context,
      response
    });
  }

  const candidate = response as Partial<ConnectionTestResult>;
  if (typeof candidate.success !== 'boolean' || typeof candidate.message !== 'string') {
    throw optionsErrors.responseInvalid('Missing required fields.', {
      ...context,
      response
    });
  }

  if (candidate.status !== undefined && typeof candidate.status !== 'number') {
    throw optionsErrors.responseInvalid('Field "status" must be a number.', {
      ...context,
      response
    });
  }
  if (candidate.response !== undefined && typeof candidate.response !== 'string') {
    throw optionsErrors.responseInvalid('Field "response" must be a string.', {
      ...context,
      response
    });
  }
  if (candidate.error !== undefined && typeof candidate.error !== 'string') {
    throw optionsErrors.responseInvalid('Field "error" must be a string.', {
      ...context,
      response
    });
  }
  if (candidate.channels !== undefined && !Array.isArray(candidate.channels)) {
    throw optionsErrors.responseInvalid('Field "channels" must be an array.', {
      ...context,
      response
    });
  }

  const result: ConnectionTestResult = {
    success: candidate.success,
    message: candidate.message
  };

  if (candidate.status !== undefined) {
    result.status = candidate.status;
  }
  if (candidate.response !== undefined) {
    result.response = candidate.response;
  }
  if (candidate.error !== undefined) {
    result.error = candidate.error;
  }
  if (candidate.channels !== undefined) {
    result.channels = candidate.channels.map((channel, index) =>
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
  message: ReturnType<typeof createTrackUsageEventMessage>
): void {
  void Promise.resolve(messagingRepository.send(message)).catch((error) => {
    console.warn('[Options] Failed to send storage analytics event:', error);
  });
}
