import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import type { ConnectionTestResult } from '@shared/types/connection';
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
  function resolveCurrentMessages(): Messages {
    return options.getMessages?.() ?? DEFAULT_RUNTIME_MESSAGES;
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
  const body = result.message || result.error || '';
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
    'Download and trust this certificate'
  );
  return `<div class="vault-connection-results">${(result.vaults ?? [])
    .map((vault) => {
      const channelRows = vault.channels.map((channel) => {
        const emoji = channel.success ? '✅' : '❌';
        const certificateLink = channel.certificateUrl
          ? ` <a href="${escapeAttribute(channel.certificateUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              certificateLinkLabel
            )}</a>`
          : '';
        return `<li><span class="vault-connection-channel">${emoji} ${escapeHtml(
          channel.label
        )}</span><span>${escapeHtml(channel.message)}${certificateLink}</span></li>`;
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
