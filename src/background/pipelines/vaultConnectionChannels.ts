import type { ConnectionChannelResult, ConnectionTestResult } from '../../shared/types/connection';
import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';
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
    await executeRestChannelTest('https', config.httpsUrl, config),
    await executeRestChannelTest('http', config.httpUrl, config)
  ];
  const configuredChannels = channels.filter((channel) => channel.configured);
  if (configuredChannels.length === 0) {
    const errorDescriptor = createDescriptor('connectionNoUsableAddress');
    return {
      success: false,
      message: '',
      messageDescriptor: createDescriptor('connectionResultHeaderFailure'),
      error: 'no_usable_address',
      errorDescriptor,
      channels
    };
  }

  const success = configuredChannels.every((channel) => channel.success);
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
  const errorDescriptor = !success ? selectPrimaryErrorDescriptor(channels) : undefined;

  return {
    success,
    ...(firstRestSuccess?.status !== undefined ? { status: firstRestSuccess.status } : {}),
    message: '',
    messageDescriptor: createDescriptor(
      success ? 'connectionResultHeaderSuccess' : 'connectionResultHeaderFailure'
    ),
    ...(firstRestResponse?.response !== undefined ? { response: firstRestResponse.response } : {}),
    ...(errors.length ? { error: errors.join('\n') } : {}),
    ...(errorDescriptor ? { errorDescriptor } : {}),
    channels
  };
}

async function executeRestChannelTest(
  channel: 'https' | 'http',
  url: string | undefined,
  config: ConnectionTestConfig
): Promise<ConnectionChannelResult> {
  const protocolLabel = channel.toUpperCase();
  const labelDescriptor = createDescriptor('connectionChannelRestLabel');
  if (!url) {
    return {
      channel,
      label: 'rest',
      labelDescriptor: createDescriptor('connectionChannelRestLabel'),
      configured: false,
      success: false,
      message: '',
      messageDescriptor: createDescriptor('connectionRestUrlMissing', { label: protocolLabel })
    };
  }

  const vaultName = (config.vault ?? '').trim();
  if (!vaultName) {
    return buildRestChannelFailure(channel, url, 'config error', 'Vault Name is missing');
  }
  if (!config.apiKey || config.apiKey.trim() === '') {
    return buildRestChannelFailure(channel, url, 'config error', 'API Key is missing');
  }

  const testUrl = normalizeRootEndpoint(url);
  try {
    console.log(`[connectionTest] Testing URL (${protocolLabel}):`, testUrl);
    const { response, text } = await testConnection(testUrl, config.apiKey);
    if (!response.ok) {
      const detail = sanitizeSnippet(text);
      const statusLine = `HTTP ${response.status}`;
      const message = detail ? `${statusLine} - ${detail}` : statusLine;
      return buildRestChannelFailure(
        channel,
        url,
        'HTTP error',
        normalizeFailureDetail('HTTP error', message),
        response.status
      );
    }
    return {
      channel,
      label: 'rest',
      labelDescriptor,
      configured: true,
      success: true,
      url,
      status: response.status,
      message: '',
      messageDescriptor: createDescriptor('connectionRestSuccess', { status: response.status }),
      response: text.slice(0, 200)
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const category = deriveExternalCategory(error);
    return buildRestChannelFailure(
      channel,
      url,
      category,
      normalizeFailureDetail(category, detail)
    );
  }
}

function buildRestChannelFailure(
  channel: 'https' | 'http',
  url: string,
  category: FailureCategory,
  detail?: string,
  status?: number
): ConnectionChannelResult {
  const message = resolveRestFailureFallback(category, detail);
  const descriptor = createRestFailureDescriptor(category, detail);
  const certificateUrl = buildCertificateUrlForFailure(channel, url, category, detail);
  return {
    channel,
    label: 'rest',
    labelDescriptor: createDescriptor('connectionChannelRestLabel'),
    configured: true,
    success: false,
    url,
    message: '',
    messageDescriptor: descriptor,
    error: message,
    errorDescriptor: descriptor,
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
    normalizedDetail.includes('err_cert');
  if (!looksLikeCertificateFailure || !isLocalAddress(url)) {
    return undefined;
  }

  try {
    return new URL('/obsidian-local-rest-api.crt', normalizeRootEndpoint(url)).toString();
  } catch {
    return undefined;
  }
}

function createRestFailureDescriptor(
  category: FailureCategory,
  detail?: string
): UserVisibleMessageDescriptor {
  if (detail === 'API Key is missing') {
    return createDescriptor('connectionRestApiKeyMissing');
  }
  if (detail === 'Vault Name is missing') {
    return createDescriptor('connectionRestVaultNameMissing');
  }

  const reason = formatCategoryMessage(category, detail);
  return createDescriptor('connectionRestFailure', { reason });
}

function resolveRestFailureFallback(category: FailureCategory, detail?: string): string {
  if (category === 'config error' && detail) {
    return `config error: ${detail}`;
  }

  return formatCategoryMessage(category, detail);
}

function selectPrimaryErrorDescriptor(
  channels: ConnectionChannelResult[]
): UserVisibleMessageDescriptor | undefined {
  return channels.find((channel) => channel.configured && !channel.success)?.errorDescriptor;
}

function createDescriptor<Key extends string>(
  key: Key,
  values?: Record<string, string | number | boolean>
): UserVisibleMessageDescriptor<Key> {
  return {
    key,
    ...(values ? { values } : {})
  };
}
