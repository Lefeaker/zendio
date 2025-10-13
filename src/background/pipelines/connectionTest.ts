import { getOptions } from '../store';
import type { ConnectionTestResult } from '../../shared/types/connection';
import type { TestVaultConnectionMessage, VaultConfig } from '../../shared/types';
import { createRestCandidates, buildVaultUrl } from '../utils/restCandidates';

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

export async function handleConnectionTest(): Promise<ConnectionTestResult> {
  try {
    const options = await getOptions();
    const rest = options.rest;
    try {
      return await executeConnectionTest({
        baseUrl: rest.baseUrl,
        httpsUrl: rest.httpsUrl,
        httpUrl: rest.httpUrl,
        apiKey: rest.apiKey,
        vault: rest.vault,
        label: rest.vault
      });
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
    const vault = resolveVaultConfig(message, options.vaultRouter?.vaults ?? []);
    const httpsUrl = sanitizeUrl(vault.httpsUrl);
    const httpUrl = sanitizeUrl(vault.httpUrl);
    if (!httpsUrl && !httpUrl) {
      throw new Error('未配置可用的地址');
    }

    const baseUrl = httpsUrl ?? httpUrl ?? options.rest.baseUrl;
    const label = vault.name || vault.vault;
    const apiKey = (vault.apiKey ?? '').trim();

    try {
      return await executeConnectionTest({
        baseUrl,
        httpsUrl,
        httpUrl,
        apiKey,
        vault: vault.vault,
        label
      });
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

  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('未配置 API Key');
  }

  const restConfig = {
    baseUrl: baseForConfig,
    httpsUrl,
    httpUrl,
    vault: config.vault,
    apiKey: config.apiKey
  };

  const urlsToTry = createConnectionCandidates(restConfig);
  const prefix = config.label ? `[${config.label}] ` : '';
  const errors: string[] = [];

  for (const candidate of urlsToTry) {
    try {
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

function createConnectionCandidates(config: {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
}): UrlCandidate[] {
  const candidates = createRestCandidates(config, '');
  if (candidates.length > 0) {
    return candidates.map(candidate => ({
      url: candidate.url,
      protocol: candidate.protocol
    }));
  }

  const fallbackUrl = buildVaultUrl(config.baseUrl, config.vault, '');
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
