import type { ConnectionChannelResult, ConnectionTestResult } from '../../shared/types/connection';
import { isLocalAddress } from '../utils/restCandidates';
import type { ConnectionTestConfig } from './vaultConnectionTypes';
import {
  deriveExternalCategory,
  formatCategoryMessage,
  normalizeFailureDetail,
  normalizeRootEndpoint,
  sanitizeSnippet,
  testConnection,
  type FailureCategory
} from './vaultConnectionChannelUtils';
import { executeLocalFolderChannelTest } from './vaultLocalFolderChannel';

export async function executeVaultStorageTargetTest(
  config: ConnectionTestConfig
): Promise<ConnectionTestResult> {
  const channels: ConnectionChannelResult[] = [
    await executeLocalFolderChannelTest(config),
    await executeRestChannelTest('https', 'HTTPS', config.httpsUrl, config),
    await executeRestChannelTest('http', 'HTTP', config.httpUrl, config)
  ];
  const configuredChannels = channels.filter((channel) => channel.configured);
  const success =
    configuredChannels.length > 0 && configuredChannels.every((channel) => channel.success);
  const errors = configuredChannels
    .filter((channel) => !channel.success)
    .map((channel) => channel.error || channel.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0);
  const firstRestSuccess = channels.find(
    (channel) =>
      channel.channel !== 'localFolder' && channel.success && channel.status !== undefined
  );
  const firstRestResponse = channels.find(
    (channel) => channel.channel !== 'localFolder' && channel.response !== undefined
  );

  return {
    success,
    ...(firstRestSuccess?.status !== undefined ? { status: firstRestSuccess.status } : {}),
    message: formatVaultChannelSummary(config, success, channels),
    ...(firstRestResponse?.response !== undefined ? { response: firstRestResponse.response } : {}),
    ...(errors.length ? { error: errors.join('\n') } : {}),
    channels
  };
}

async function executeRestChannelTest(
  channel: 'https' | 'http',
  label: 'HTTPS' | 'HTTP',
  url: string | undefined,
  config: ConnectionTestConfig
): Promise<ConnectionChannelResult> {
  if (!url) {
    return {
      channel,
      label,
      configured: false,
      success: false,
      message: `未配置 ${label} URL`
    };
  }

  const vaultName = (config.vault ?? '').trim();
  if (!vaultName) {
    return buildRestChannelFailure(channel, label, url, 'config error', '未配置 Vault 名称');
  }
  if (!config.apiKey || config.apiKey.trim() === '') {
    return buildRestChannelFailure(channel, label, url, 'config error', '未配置 API Key');
  }

  const testUrl = normalizeRootEndpoint(url);
  try {
    console.log(`[connectionTest] Testing URL (${label}):`, testUrl);
    const { response, text } = await testConnection(testUrl, config.apiKey);
    if (!response.ok) {
      const detail = sanitizeSnippet(text);
      const statusLine = `HTTP ${response.status}`;
      const message = detail ? `${statusLine} - ${detail}` : statusLine;
      return buildRestChannelFailure(
        channel,
        label,
        url,
        'HTTP error',
        normalizeFailureDetail('HTTP error', message),
        response.status
      );
    }
    return {
      channel,
      label,
      configured: true,
      success: true,
      url,
      status: response.status,
      message: `REST API ${label} 连接成功，状态码: ${response.status}`,
      response: text.slice(0, 200)
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const category = deriveExternalCategory(error);
    return buildRestChannelFailure(
      channel,
      label,
      url,
      category,
      normalizeFailureDetail(category, detail)
    );
  }
}

function buildRestChannelFailure(
  channel: 'https' | 'http',
  label: 'HTTPS' | 'HTTP',
  url: string,
  category: FailureCategory,
  detail?: string,
  status?: number
): ConnectionChannelResult {
  const message = formatCategoryMessage(category, detail);
  const certificateUrl = buildCertificateUrlForFailure(channel, url, category, detail);
  return {
    channel,
    label,
    configured: true,
    success: false,
    url,
    message,
    error: message,
    ...(status !== undefined ? { status } : {}),
    ...(certificateUrl ? { certificateUrl } : {})
  };
}

function buildCertificateUrlForFailure(
  channel: 'https' | 'http',
  url: string,
  category: FailureCategory,
  detail?: string
): string | undefined {
  if (channel !== 'https') {
    return undefined;
  }

  const normalizedDetail = detail?.toLowerCase() ?? '';
  const looksLikeCertificateFailure =
    category === 'network error' ||
    normalizedDetail.includes('cert') ||
    normalizedDetail.includes('certificate') ||
    normalizedDetail.includes('err_cert') ||
    normalizedDetail.includes('证书');
  if (!looksLikeCertificateFailure || !isLocalAddress(url)) {
    return undefined;
  }

  try {
    return new URL('/obsidian-local-rest-api.crt', normalizeRootEndpoint(url)).toString();
  } catch {
    return undefined;
  }
}

function formatVaultChannelSummary(
  config: ConnectionTestConfig,
  success: boolean,
  channels: ConnectionChannelResult[]
): string {
  const label = config.label || config.vault;
  const header = label ? `[${label}] ${success ? '连接测试成功' : '连接失败'}` : '连接测试结果';
  return [header, ...channels.map(formatChannelLine)].join('\n');
}

function formatChannelLine(channel: ConnectionChannelResult): string {
  const emoji = channel.success ? '✅' : '❌';
  return `${emoji} ${channel.label}：${channel.message}`;
}
