import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import type { ConnectionTestResult } from '@shared/types/connection';
import { formatUserVisibleMessage } from '../../i18n/userVisibleMessageFormatter';
import type {
  ProductionStitchStorageControllerOptions,
  ProductionStitchStorageLoad
} from './productionStitchStorageTypes';
import { runVaultListConnectionTest as runVaultListConnectionTestHelper } from './vaultConnectionTests';

export interface ProductionStitchStorageFeedback {
  applyConnectionNotice(result: ConnectionTestResult): void;
  runVaultListConnectionTest(): Promise<ConnectionTestResult>;
}

export function createProductionStitchStorageFeedback(
  options: ProductionStitchStorageControllerOptions,
  load: ProductionStitchStorageLoad
): ProductionStitchStorageFeedback {
  let resolvedMessages: Messages | null = null;

  function resolveCurrentMessages(): Messages {
    return options.getMessages?.() ?? resolvedMessages ?? DEFAULT_RUNTIME_MESSAGES;
  }

  function getMessage(messages: Messages | null, key: keyof Messages, fallback: string): string {
    const value = messages?.[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  function applyConnectionNotice(result: ConnectionTestResult): void {
    const notice = buildConnectionNotice(result, resolveCurrentMessages(), getMessage);
    options.setConnectionNotice({
      title: '',
      body: notice.body,
      ...(notice.html ? { html: notice.html } : {}),
      variant: notice.variant
    });
    options.refreshAppData();
  }

  async function runVaultListConnectionTest(): Promise<ConnectionTestResult> {
    const messages = await import('@i18n').then(({ getMessagesForLanguage }) =>
      getMessagesForLanguage(options.getState().previewLanguage)
    );
    resolvedMessages = messages;
    return runVaultListConnectionTestHelper(
      load.ensureVaultRouter(),
      options.getMessagingRepository(),
      messages
    );
  }

  return {
    applyConnectionNotice,
    runVaultListConnectionTest
  };
}

function buildConnectionNotice(
  result: ConnectionTestResult,
  messages: Messages | null,
  getMessage: (messages: Messages | null, key: keyof Messages, fallback: string) => string
): {
  body: string;
  html?: string;
  variant: 'success' | 'warning' | 'danger';
} {
  const body = resolveResultText(result, messages);
  const html = result.vaults?.length
    ? renderVaultConnectionResults(result, messages, getMessage)
    : undefined;
  return {
    body,
    ...(html ? { html } : {}),
    variant: result.success ? 'success' : hasAnyChannelSuccess(result) ? 'warning' : 'danger'
  };
}

function hasAnyChannelSuccess(result: ConnectionTestResult): boolean {
  return Boolean(
    result.vaults?.some((vault) => vault.channels.some((channel) => channel.success)) ||
    result.channels?.some((channel) => channel.success)
  );
}

function renderVaultConnectionResults(
  result: ConnectionTestResult,
  messages: Messages | null,
  getMessage: (messages: Messages | null, key: keyof Messages, fallback: string) => string
): string {
  const certificateLinkLabel = getMessage(
    messages,
    'schemaStorageCertificateDownloadTrustLink',
    ''
  );
  return `<div class="vault-connection-results">${(result.vaults ?? [])
    .map((vault) => {
      const channelRows = vault.channels.map((channel) => {
        const emoji = channel.success ? '✅' : '❌';
        const label = resolveChannelLabel(channel, messages);
        const message = resolveChannelMessage(channel, messages);
        const certificateLink =
          channel.certificateUrl && certificateLinkLabel.trim().length > 0
            ? ` <a href="${escapeAttribute(channel.certificateUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                certificateLinkLabel
              )}</a>`
            : '';
        return `<li><span class="vault-connection-channel">${emoji} ${escapeHtml(
          label
        )}</span><span>${escapeHtml(message)}${certificateLink}</span></li>`;
      });
      return `<section class="vault-connection-result"><strong>${escapeHtml(
        vault.vaultName
      )}</strong><ul>${channelRows.join('')}</ul></section>`;
    })
    .join('')}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function resolveResultText(result: ConnectionTestResult, messages: Messages | null): string {
  if (result.messageDescriptor) {
    return resolveDescriptorText(result.messageDescriptor, messages, '');
  }

  if (result.error?.trim()) {
    return result.error.trim();
  }

  return result.success
    ? (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionSuccessShort
    : (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionFailed;
}

function resolveDescriptorText(
  descriptor: ConnectionTestResult['messageDescriptor'],
  messages: Messages | null,
  fallback: string
): string {
  return formatUserVisibleMessage(descriptor, messages ?? DEFAULT_RUNTIME_MESSAGES, fallback);
}

function resolveChannelLabel(
  channel: NonNullable<ConnectionTestResult['channels']>[number],
  messages: Messages | null
): string {
  if (channel.labelDescriptor) {
    const resolved = resolveDescriptorText(channel.labelDescriptor, messages, '').trim();
    if (resolved) {
      if (channel.channel === 'localFolder') {
        return resolved;
      }
      return `${resolved} (${channel.channel.toUpperCase()})`;
    }
  }

  if (channel.channel === 'localFolder') {
    return (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionChannelLocalFolderLabel;
  }

  return `${(messages ?? DEFAULT_RUNTIME_MESSAGES).connectionChannelRestLabel} (${channel.channel.toUpperCase()})`;
}

function resolveChannelMessage(
  channel: NonNullable<ConnectionTestResult['channels']>[number],
  messages: Messages | null
): string {
  if (channel.messageDescriptor) {
    const resolved = resolveDescriptorText(channel.messageDescriptor, messages, '').trim();
    if (resolved) {
      return resolved;
    }
  }

  if (channel.error?.trim()) {
    return channel.error.trim();
  }

  if (!channel.configured && channel.channel === 'localFolder') {
    return (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionLocalFolderSkipped;
  }

  return channel.success
    ? (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionSuccessShort
    : (messages ?? DEFAULT_RUNTIME_MESSAGES).connectionFailed;
}
