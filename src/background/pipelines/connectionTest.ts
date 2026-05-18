import { getOptions } from '../store';
import type { ConnectionTestResult } from '../../shared/types/connection';
import type { TestVaultConnectionMessage, VaultConfig } from '../../shared/types';
import type { RestOptions } from '../../shared/types/options';
import { createRestCandidates, type RestConfig } from '../utils/restCandidates';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { LocalVaultPermissionState } from '../../platform/interfaces/fileSystemAccess';

type FailureCategory = 'HTTP error' | 'network error' | 'config error';

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

interface ConnectionTestConfig {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  apiKey: string;
  vault: string;
  label?: string;
  localFolderId?: string;
  localFolderName?: string;
}

export async function handleConnectionTest(
  restDraft?: Partial<RestOptions>
): Promise<ConnectionTestResult> {
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

      return await executeStorageTargetTest(config);
    } catch (error) {
      return buildFailureResult(error, rest.vault);
    }
  } catch (error) {
    return buildFailureResult(error);
  }
}

export async function handleVaultConnectionTest(
  message: TestVaultConnectionMessage
): Promise<ConnectionTestResult> {
  try {
    const options = await getOptions();
    const activeVaults = (options.vaultRouter?.vaults ?? []).filter((v) => v.enabled !== false);
    const vault = resolveVaultConfig(message, activeVaults);
    const httpsUrl = sanitizeUrl(vault.httpsUrl);
    const httpUrl = sanitizeUrl(vault.httpUrl);
    if (!httpsUrl && !httpUrl) {
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

      return await executeStorageTargetTest(config);
    } catch (error) {
      return buildFailureResult(error, label);
    }
  } catch (error) {
    return buildFailureResult(error);
  }
}

async function executeStorageTargetTest(
  config: ConnectionTestConfig
): Promise<ConnectionTestResult> {
  const restResult = await executeConnectionTest(config);
  const localResult = await executeLocalFolderTest(config);

  if (!localResult) {
    return {
      ...restResult,
      message: `${formatRestMessage(restResult)}\n本地目录：未配置，已跳过。`
    };
  }

  const success = restResult.success && localResult.success;
  const messages = [formatRestMessage(restResult), localResult.message];
  const errors = [restResult.error, localResult.error].filter(
    (message): message is string => typeof message === 'string' && message.length > 0
  );

  return {
    success,
    ...(restResult.status !== undefined && { status: restResult.status }),
    message: messages.join('\n'),
    ...(restResult.response !== undefined && { response: restResult.response }),
    ...(errors.length ? { error: errors.join('\n') } : {})
  };
}

function formatRestMessage(result: ConnectionTestResult): string {
  return `REST API：${result.message || result.error || (result.success ? '连接成功。' : '连接失败。')}`;
}

async function executeLocalFolderTest(
  config: ConnectionTestConfig
): Promise<ConnectionTestResult | null> {
  if (!config.localFolderId) {
    return null;
  }

  const folderName = config.localFolderName || config.label || config.vault;
  try {
    const permission = await getService<PlatformServices>(
      TOKENS.platformServices
    ).fileSystemAccess.queryPermission(config.localFolderId);
    if (permission === 'granted') {
      return {
        success: true,
        message: `本地目录可用：${folderName}`
      };
    }
    return {
      success: false,
      message: formatLocalFolderFailure(permission, folderName),
      error: formatLocalFolderFailure(permission, folderName)
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const message = `本地目录测试失败：${folderName}${detail ? ` - ${detail}` : ''}`;
    return {
      success: false,
      message,
      error: message
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

async function executeConnectionTest(config: ConnectionTestConfig): Promise<ConnectionTestResult> {
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
        success: true,
        status: response.status,
        message: `${prefix}✅ 通过 ${candidate.protocol} 连接成功！状态码: ${response.status}`,
        response: text.slice(0, 200)
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
    success: false,
    error: errors.join('\n'),
    message: `${prefix}连接失败，已尝试：\n${errors.join('\n')}`
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

function buildFailureResult(error: unknown, label?: string): ConnectionTestResult {
  const category = deriveExternalCategory(error);
  const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
  const formatted = formatCategoryMessage(category, normalizeFailureDetail(category, detail));
  const prefix = label ? `[${label}] ` : '';
  console.error(`[connectionTest] unexpected error${label ? ` (${label})` : ''}:`, error);
  return {
    success: false,
    error: formatted,
    message: `${prefix}连接失败: ${formatted}`
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
