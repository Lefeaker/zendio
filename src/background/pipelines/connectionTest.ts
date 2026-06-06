import { getOptions } from '../store';
import type { ConnectionTestResult } from '../../shared/types/connection';
import type { TestVaultConnectionMessage, VaultConfig } from '../../shared/types';
import type { RestOptions } from '../../shared/types/options';
import { createRestCandidates, type RestConfig } from '../utils/restCandidates';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { LocalVaultPermissionState } from '../../platform/interfaces/fileSystemAccess';
import { trackUsageEvent } from '../services/analyticsEvents';
import type {
  DurationBucket,
  FailureCategory as AnalyticsFailureCategory,
  StorageTarget
} from '../../shared/types/analytics';
import {
  executeVaultStorageTargetTest,
  type ConnectionTestConfig
} from './vaultConnectionChannels';

type FailureCategory = 'HTTP error' | 'network error' | 'config error';
type ConnectionTestSummary = {
  result: ConnectionTestResult;
  storageTarget: StorageTarget;
  failureCategory?: AnalyticsFailureCategory;
};
type ConnectionResultSummary = {
  result: ConnectionTestResult;
  failureCategory?: AnalyticsFailureCategory;
};
type LocalConnectionResultSummary = {
  result: ConnectionTestResult | null;
  failureCategory?: AnalyticsFailureCategory;
};

const RESPONSE_SNIPPET_LIMIT = 120;
const NETWORK_FAILURE_DETAIL = 'request failed';
const HTTP_FAILURE_DETAIL = 'response unavailable';
const CONFIG_FAILURE_DETAIL = 'configuration invalid';

function sanitizeSnippet(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= RESPONSE_SNIPPET_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, RESPONSE_SNIPPET_LIMIT)}...`;
}

function normalizeFailureDetail(category: FailureCategory, detail?: string): string | undefined {
  const normalized = detail?.toLowerCase().trim();
  if (!normalized) {
    return defaultFailureDetail(category);
  }

  if (normalized.includes('body is unusable')) {
    return HTTP_FAILURE_DETAIL;
  }

  if (
    normalized.includes('cannot read properties of undefined') ||
    normalized.includes('illegal invocation') ||
    normalized.includes('missing response from rest endpoint')
  ) {
    return CONFIG_FAILURE_DETAIL;
  }

  if (category === 'network error' && isKnownNetworkFailure(normalized)) {
    return NETWORK_FAILURE_DETAIL;
  }

  return detail;
}

function defaultFailureDetail(category: FailureCategory): string {
  if (category === 'HTTP error') {
    return HTTP_FAILURE_DETAIL;
  }
  if (category === 'network error') {
    return NETWORK_FAILURE_DETAIL;
  }
  return CONFIG_FAILURE_DETAIL;
}

function isKnownNetworkFailure(message: string): boolean {
  return message.includes('failed to fetch') || message.includes('networkerror');
}

interface UrlCandidate {
  url: string;
  protocol: string;
}

export async function handleConnectionTest(
  restDraft?: Partial<RestOptions>
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const options = await getOptions();
    const rest = mergeRestOptions(options.rest, restDraft);
    try {
      const config: ConnectionTestConfig = {
        baseUrl: rest.baseUrl,
        apiKey: rest.apiKey,
        vault: rest.vault,
        label: rest.vault,
        ...(rest.httpsUrl ? { httpsUrl: rest.httpsUrl } : {}),
        ...(rest.httpUrl ? { httpUrl: rest.httpUrl } : {}),
        ...(rest.localFolderId ? { localFolderId: rest.localFolderId } : {}),
        ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {})
      };

      const summary = await executeStorageTargetTest(config);
      trackConnectionTestCompleted(summary, startedAt);
      return summary.result;
    } catch (error) {
      const summary = buildFailureSummary(
        error,
        rest.vault,
        rest.localFolderId ? 'local_folder' : 'rest_api'
      );
      trackConnectionTestCompleted(summary, startedAt);
      return summary.result;
    }
  } catch (error) {
    const summary = buildFailureSummary(error, undefined, 'unknown');
    trackConnectionTestCompleted(summary, startedAt);
    return summary.result;
  }
}

export async function handleVaultConnectionTest(
  message: TestVaultConnectionMessage
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const options = await getOptions();
    const activeVaults = (options.vaultRouter?.vaults ?? []).filter((v) => v.enabled !== false);
    const vault = resolveVaultConfig(message, activeVaults);
    const httpsUrl = sanitizeUrl(vault.httpsUrl);
    const httpUrl = sanitizeUrl(vault.httpUrl);
    if (!httpsUrl && !httpUrl && !vault.localFolderId) {
      throw new Error('未配置可用的地址');
    }

    const baseUrl = httpsUrl ?? httpUrl ?? options.rest.baseUrl;
    const label = vault.name || vault.vault;
    const apiKey = (vault.apiKey ?? '').trim();

    try {
      const config: ConnectionTestConfig = {
        baseUrl,
        apiKey,
        vault: vault.vault,
        label,
        ...(httpsUrl ? { httpsUrl } : {}),
        ...(httpUrl ? { httpUrl } : {}),
        ...(vault.localFolderId ? { localFolderId: vault.localFolderId } : {}),
        ...(vault.localFolderName ? { localFolderName: vault.localFolderName } : {})
      };

      const result = await executeVaultStorageTargetTest(config);
      trackConnectionTestCompleted(
        summarizeVaultStorageTargetTest(
          result,
          vault.localFolderId ? 'local_folder' : 'rest_api'
        ),
        startedAt
      );
      return result;
    } catch (error) {
      const summary = buildFailureSummary(
        error,
        label,
        vault.localFolderId ? 'local_folder' : 'rest_api'
      );
      trackConnectionTestCompleted(summary, startedAt);
      return summary.result;
    }
  } catch (error) {
    const summary = buildFailureSummary(
      error,
      undefined,
      message.vault?.localFolderId ? 'local_folder' : 'unknown'
    );
    trackConnectionTestCompleted(summary, startedAt);
    return summary.result;
  }
}

async function executeStorageTargetTest(
  config: ConnectionTestConfig
): Promise<ConnectionTestSummary> {
  const restResult = await executeConnectionTest(config);
  const localResult = await executeLocalFolderTest(config);
  const storageTarget: StorageTarget = config.localFolderId ? 'local_folder' : 'rest_api';

  if (!localResult.result) {
    return {
      result: {
        ...restResult.result,
        message: `${formatRestMessage(restResult.result)}\n本地目录：未配置，已跳过。`
      },
      storageTarget,
      ...(restResult.failureCategory ? { failureCategory: restResult.failureCategory } : {})
    };
  }

  const success = restResult.result.success && localResult.result.success;
  const messages = [formatRestMessage(restResult.result), localResult.result.message];
  const errors = [restResult.result.error, localResult.result.error].filter(
    (message): message is string => typeof message === 'string' && message.length > 0
  );

  const failureCategory = !success
    ? (localResult.failureCategory ?? restResult.failureCategory)
    : undefined;

  return {
    result: {
      success,
      ...(restResult.result.status !== undefined && { status: restResult.result.status }),
      message: messages.join('\n'),
      ...(restResult.result.response !== undefined ? { response: restResult.result.response } : {}),
      ...(errors.length ? { error: errors.join('\n') } : {})
    },
    storageTarget,
    ...(failureCategory ? { failureCategory } : {})
  };
}

function formatRestMessage(result: ConnectionTestResult): string {
  return `REST API：${result.message || result.error || (result.success ? '连接成功。' : '连接失败。')}`;
}

async function executeLocalFolderTest(
  config: ConnectionTestConfig
): Promise<LocalConnectionResultSummary> {
  if (!config.localFolderId) {
    return { result: null };
  }

  const folderName = config.localFolderName || config.label || config.vault;
  try {
    const permission = await getService<PlatformServices>(
      TOKENS.platformServices
    ).fileSystemAccess.queryPermission(config.localFolderId);
    if (permission === 'granted') {
      return {
        result: {
          success: true,
          message: `本地目录可用：${folderName}`
        }
      };
    }
    return {
      result: {
        success: false,
        message: formatLocalFolderFailure(permission, folderName),
        error: formatLocalFolderFailure(permission, folderName)
      },
      failureCategory: permission === 'unsupported' ? 'unsupported' : 'permission'
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const message = `本地目录测试失败：${folderName}${detail ? ` - ${detail}` : ''}`;
    return {
      result: {
        success: false,
        message,
        error: message
      },
      failureCategory: 'unknown'
    };
  }
}

function formatLocalFolderFailure(
  permission: LocalVaultPermissionState,
  folderName: string
): string {
  if (permission === 'prompt') {
    return `本地目录需要重新授权：${folderName}`;
  }
  if (permission === 'denied') {
    return `本地目录权限被拒绝：${folderName}`;
  }
  if (permission === 'missing') {
    return `本地目录记录不存在，请重新选择：${folderName}`;
  }
  if (permission === 'unsupported') {
    return '当前浏览器不支持本地目录测试。';
  }
  return `本地目录不可用：${folderName}`;
}

async function executeConnectionTest(
  config: ConnectionTestConfig
): Promise<ConnectionResultSummary> {
  const trimmedBase = config.baseUrl.trim();
  const httpsUrl = sanitizeUrl(config.httpsUrl);
  const httpUrl = sanitizeUrl(config.httpUrl);
  const baseForConfig = trimmedBase || httpsUrl || httpUrl;
  if (!baseForConfig) {
    throw new Error('未配置可用的基础地址');
  }

  const vaultName = (config.vault ?? '').trim();
  if (!vaultName) {
    throw new Error('未配置 Vault 名称');
  }

  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('未配置 API Key');
  }

  const restConfig: RestConfig = {
    baseUrl: baseForConfig,
    vault: vaultName,
    apiKey: config.apiKey
  };

  if (httpsUrl !== undefined) {
    restConfig.httpsUrl = httpsUrl;
  }

  if (httpUrl !== undefined) {
    restConfig.httpUrl = httpUrl;
  }

  const urlsToTry = createConnectionCandidates(restConfig);
  const prefix = config.label ? `[${config.label}] ` : '';
  const errors: string[] = [];

  for (const candidate of urlsToTry) {
    try {
      // createConnectionCandidates 已经返回正确格式的URL，直接使用
      console.log(`[connectionTest] Testing URL (${candidate.protocol}):`, candidate.url);
      const { response, text } = await testConnection(candidate.url, config.apiKey);
      if (!response.ok) {
        const detail = sanitizeSnippet(text);
        const statusLine = `HTTP ${response.status}`;
        const message = detail ? `${statusLine} - ${detail}` : statusLine;
        const formatted = `${candidate.protocol}: ${formatCategoryMessage(
          'HTTP error',
          normalizeFailureDetail('HTTP error', message)
        )}`;
        console.warn(
          `[connectionTest] candidate responded with error${config.label ? ` (${config.label})` : ''}:`,
          formatted
        );
        errors.push(formatted);
        continue;
      }
      return {
        result: {
          success: true,
          status: response.status,
          message: `${prefix}✅ 通过 ${candidate.protocol} 连接成功！状态码: ${response.status}`,
          response: text.slice(0, 200)
        }
      };
    } catch (error) {
      const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
      const category = deriveExternalCategory(error);
      const formatted = `${candidate.protocol}: ${formatCategoryMessage(
        category,
        normalizeFailureDetail(category, detail)
      )}`;
      console.warn(
        `[connectionTest] candidate failed${config.label ? ` (${config.label})` : ''}:`,
        formatted
      );
      errors.push(formatted);

      if (!isRecoverableNetworkError(error)) {
        throw error;
      }
    }
  }

  return {
    result: {
      success: false,
      error: errors.join('\n'),
      message: `${prefix}连接失败，已尝试：\n${errors.join('\n')}`
    },
    failureCategory: 'connection'
  };
}

async function testConnection(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const text = await readResponseTextSafely(response);
  return { response, text };
}

async function readResponseTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return response.statusText || '';
  }
}

function mergeRestOptions(rest: RestOptions, draft?: Partial<RestOptions>): RestOptions {
  if (!draft) {
    return { ...rest };
  }

  const httpsUrl = sanitizeUrl(draft.httpsUrl) ?? rest.httpsUrl;
  const httpUrl = sanitizeUrl(draft.httpUrl) ?? rest.httpUrl;
  const vault = draft.vault !== undefined ? draft.vault.trim() : rest.vault;
  const apiKey = draft.apiKey !== undefined ? draft.apiKey.trim() : rest.apiKey;
  const baseUrl =
    sanitizeUrl(draft.baseUrl) ?? httpsUrl ?? httpUrl ?? sanitizeUrl(rest.baseUrl) ?? rest.baseUrl;

  return {
    baseUrl,
    vault,
    apiKey,
    ...(httpsUrl !== undefined && { httpsUrl }),
    ...(httpUrl !== undefined && { httpUrl }),
    ...(rest.rootDir !== undefined && { rootDir: rest.rootDir }),
    ...(rest.localFolderId !== undefined && { localFolderId: rest.localFolderId }),
    ...(rest.localFolderName !== undefined && { localFolderName: rest.localFolderName })
  };
}

function createConnectionCandidates(config: RestConfig): UrlCandidate[] {
  // ===== 修复:连接测试应该测试根端点,不拼接 vault 路径 =====
  // 传入 null 作为特殊标记,让 createRestCandidates 跳过 vault 路径拼接
  const candidates = createRestCandidates(config, '', null);
  if (candidates.length > 0) {
    return candidates.map((candidate) => ({
      url: candidate.url,
      protocol: candidate.protocol
    }));
  }

  // Fallback:直接使用 baseUrl,不拼接 vault
  const trimmed = config.baseUrl.trim();
  const fallbackUrl = trimmed.replace(/\/+$/, '') + '/';
  return [
    {
      url: fallbackUrl,
      protocol: config.baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
    }
  ];
}

function isRecoverableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return isKnownNetworkFailure(error.message.toLowerCase());
}

function deriveExternalCategory(error: unknown): FailureCategory {
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
      return 'network error';
    }
    if (normalized.includes('http') || normalized.includes('status')) {
      return 'HTTP error';
    }
  }
  return 'config error';
}

function formatCategoryMessage(category: FailureCategory, detail?: string): string {
  if (detail) {
    return `${category}: ${detail}`;
  }
  return category;
}

function summarizeVaultStorageTargetTest(
  result: ConnectionTestResult,
  storageTarget: StorageTarget
): ConnectionTestSummary {
  return {
    result,
    storageTarget,
    ...(!result.success ? { failureCategory: inferChannelFailureCategory(result) } : {})
  };
}

function inferChannelFailureCategory(result: ConnectionTestResult): AnalyticsFailureCategory {
  const channels = result.channels ?? [];
  const failedConfiguredChannels = channels.filter(
    (channel) => channel.configured && !channel.success
  );
  const failedLocalFolder = failedConfiguredChannels.find(
    (channel) => channel.channel === 'localFolder'
  );
  const failureText = [
    result.error,
    result.message,
    ...failedConfiguredChannels.flatMap((channel) => [channel.error, channel.message])
  ]
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
    .join('\n')
    .toLowerCase();

  if (failedLocalFolder) {
    return failureText.includes('unsupported') || failureText.includes('不支持')
      ? 'unsupported'
      : 'permission';
  }
  if (failureText.includes('未配置') || failureText.includes('config error')) {
    return 'validation';
  }
  if (failureText.includes('timeout')) {
    return 'timeout';
  }
  return 'connection';
}

function buildFailureSummary(
  error: unknown,
  label: string | undefined,
  storageTarget: StorageTarget
): ConnectionTestSummary {
  const category = deriveExternalCategory(error);
  const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
  const formatted = formatCategoryMessage(category, normalizeFailureDetail(category, detail));
  const prefix = label ? `[${label}] ` : '';
  console.error(`[connectionTest] unexpected error${label ? ` (${label})` : ''}:`, error);
  return {
    result: {
      success: false,
      error: formatted,
      message: `${prefix}连接失败: ${formatted}`
    },
    storageTarget,
    failureCategory: toAnalyticsFailureCategory(category)
  };
}

function findVaultConfig(vaults: VaultConfig[], vaultId: string): VaultConfig {
  const vault = vaults.find((item) => item.id === vaultId);
  if (!vault) {
    throw new Error('未找到对应的额外仓库配置');
  }
  return vault;
}

function resolveVaultConfig(
  message: TestVaultConnectionMessage,
  storedVaults: VaultConfig[]
): VaultConfig {
  if (message.vault) {
    return { ...message.vault };
  }

  return findVaultConfig(storedVaults, message.vaultId);
}

function sanitizeUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed ? trimmed : undefined;
}

function trackConnectionTestCompleted(summary: ConnectionTestSummary, startedAt: number): void {
  void trackUsageEvent('connection_test_completed', {
    storage_target: summary.storageTarget,
    outcome: summary.result.success ? 'completed' : 'failed',
    duration_bucket: toDurationBucket(Date.now() - startedAt),
    ...(summary.failureCategory ? { failure_category: summary.failureCategory } : {})
  });
}

function toAnalyticsFailureCategory(category: FailureCategory): AnalyticsFailureCategory {
  if (category === 'config error') {
    return 'validation';
  }
  return 'connection';
}

function toDurationBucket(durationMs: number): DurationBucket {
  if (durationMs < 100) {
    return 'under_100ms';
  }
  if (durationMs < 500) {
    return '100ms_to_499ms';
  }
  if (durationMs < 1000) {
    return '500ms_to_999ms';
  }
  if (durationMs < 3000) {
    return '1s_to_2s';
  }
  if (durationMs < 10000) {
    return '3s_to_9s';
  }
  if (durationMs < 30000) {
    return '10s_to_29s';
  }
  if (durationMs < 120000) {
    return '30s_to_119s';
  }
  return '2m_plus';
}
