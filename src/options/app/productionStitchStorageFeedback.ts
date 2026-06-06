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
  function applyConnectionNotice(result: ConnectionTestResult): void {
    const notice = buildConnectionNotice(result);
    options.setConnectionNotice({
      title: '连接测试结果',
      body: notice.body,
      ...(notice.html ? { html: notice.html } : {}),
      variant: notice.variant
    });
    options.refreshAppData();
  }

  async function runVaultListConnectionTest(): Promise<ConnectionTestResult> {
    return runVaultListConnectionTestHelper(
      load.ensureVaultRouter(),
      options.getMessagingRepository()
    );
  }

  return {
    applyConnectionNotice,
    runVaultListConnectionTest
  };
}

function buildConnectionNotice(result: ConnectionTestResult): {
  body: string;
  html?: string;
  variant: 'success' | 'warning' | 'danger';
} {
  const body =
    result.message || result.error || (result.success ? '连接测试成功。' : '连接测试失败。');
  const html = result.vaults?.length ? renderVaultConnectionResults(result) : undefined;
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

function renderVaultConnectionResults(result: ConnectionTestResult): string {
  return `<div class="vault-connection-results">${(result.vaults ?? [])
    .map((vault) => {
      const channelRows = vault.channels.map((channel) => {
        const emoji = channel.success ? '✅' : '❌';
        const certificateLink = channel.certificateUrl
          ? ` <a href="${escapeAttribute(channel.certificateUrl)}" target="_blank" rel="noopener noreferrer">下载并信任该证书</a>`
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
