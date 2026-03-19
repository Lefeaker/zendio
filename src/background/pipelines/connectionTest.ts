import { getOptions } from '../store';
import type { ConnectionTestResult } from '../../shared/types/connection';
import type { TestVaultConnectionMessage, VaultConfig } from '../../shared/types';
import type { RestOptions } from '../../shared/types/options';
import { createRestCandidates, type RestConfig } from '../utils/restCandidates';

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
}

export async function handleConnectionTest(restDraft?: Partial<RestOptions>): Promise<ConnectionTestResult> {
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
        ...(rest.httpUrl ? { httpUrl: rest.httpUrl } : {})
      };

      return await executeConnectionTest(config);
    } catch (error) {
      return buildFailureResult(error, rest.vault);
    }
  } catch (error) {
    return buildFailureResult(error);
  }
}

export async function handleVaultConnectionTest(message: TestVaultConnectionMessage): Promise<ConnectionTestResult> {
  try {
    const options = await getOptions();
    const activeVaults = (options.vaultRouter?.vaults ?? []).filter(v => v.enabled !== false);
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
        ...(httpUrl ? { httpUrl } : {})
      };

      return await executeConnectionTest(config);
    } catch (error) {
      return buildFailureResult(error, label);
    }
  } catch (error) {
    return buildFailureResult(error);
  }
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
        const snippet = text.slice(0, 200).trim();
        const statusLine = `HTTP ${response.status}`;
        const message = snippet ? `${statusLine} - ${snippet}` : statusLine;
        const errorMsg = `${candidate.protocol}: ${message}`;
        console.warn(`[connectionTest] candidate responded with error${config.label ? ` (${config.label})` : ''}:`, errorMsg);
        errors.push(errorMsg);
        continue;
      }
      return {
        success: true,
        status: response.status,
        message: `${prefix}✅ 通过 ${candidate.protocol} 连接成功！状态码: ${response.status}`,
        response: text.slice(0, 200)
      };
    } catch (error) {
      const errorMsg = `${candidate.protocol}: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[connectionTest] candidate failed${config.label ? ` (${config.label})` : ''}:`, errorMsg);
      errors.push(errorMsg);

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
  const text = await response.text();
  return { response, text };
}

function mergeRestOptions(rest: RestOptions, draft?: Partial<RestOptions>): RestOptions {
  if (!draft) {
    return { ...rest };
  }

  const httpsUrl = sanitizeUrl(draft.httpsUrl) ?? rest.httpsUrl;
  const httpUrl = sanitizeUrl(draft.httpUrl) ?? rest.httpUrl;
  const vault =
    draft.vault !== undefined
      ? draft.vault.trim()
      : rest.vault;
  const apiKey =
    draft.apiKey !== undefined
      ? draft.apiKey.trim()
      : rest.apiKey;
  const baseUrl =
    sanitizeUrl(draft.baseUrl) ??
    httpsUrl ??
    httpUrl ??
    sanitizeUrl(rest.baseUrl) ??
    rest.baseUrl;

  return {
    baseUrl,
    vault,
    apiKey,
    ...(httpsUrl !== undefined && { httpsUrl }),
    ...(httpUrl !== undefined && { httpUrl }),
    ...(rest.rootDir !== undefined && { rootDir: rest.rootDir })
  };
}

function createConnectionCandidates(config: RestConfig): UrlCandidate[] {
  // ===== 修复:连接测试应该测试根端点,不拼接 vault 路径 =====
  // 传入 null 作为特殊标记,让 createRestCandidates 跳过 vault 路径拼接
  const candidates = createRestCandidates(config, '', null);
  if (candidates.length > 0) {
    return candidates.map(candidate => ({
      url: candidate.url,
      protocol: candidate.protocol
    }));
  }

  // Fallback:直接使用 baseUrl,不拼接 vault
  const trimmed = config.baseUrl.trim();
  const fallbackUrl = trimmed.replace(/\/+$/, '') + '/';
  return [{
    url: fallbackUrl,
    protocol: config.baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
  }];
}

function isRecoverableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('Failed to fetch') || error.message.includes('NetworkError');
}

function buildFailureResult(error: unknown, label?: string): ConnectionTestResult {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = label ? `[${label}] ` : '';
  console.error(`[connectionTest] unexpected error${label ? ` (${label})` : ''}:`, error);
  return {
    success: false,
    error: message,
    message: `${prefix}连接失败: ${message}`
  };
}

function findVaultConfig(vaults: VaultConfig[], vaultId: string): VaultConfig {
  const vault = vaults.find(item => item.id === vaultId);
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
