import { expect, type Page } from '@playwright/test';
import {
  bilibiliFixtureHtml,
  createOptionsFixture,
  expandVideoPanel,
  findCurrentTabId,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  selectFixtureText,
  testWithExtension,
  youtubeFixtureHtml
} from './utils/videoListenerScopeHarness';

const VAULT_ID = 'live-runtime-vault';
const INITIAL_VAULT_NAME = 'Unconfigured Runtime Vault';
const LIVE_VAULT_NAME = 'Current Live Vault';
const RENAMED_VAULT_NAME = 'Live Renamed Vault';

function createStoredOptions(vaultName: string, configured: boolean) {
  return {
    ...createOptionsFixture(),
    vaultRouter: {
      defaultVaultId: VAULT_ID,
      vaults: [
        {
          id: VAULT_ID,
          name: vaultName,
          vault: vaultName,
          localFolderId: configured ? 'live-runtime-folder' : '',
          localFolderName: configured ? vaultName : '',
          httpsUrl: 'https://127.0.0.1:27124',
          httpUrl: 'http://127.0.0.1:27123',
          apiKey: '',
          enabled: true,
          isDefault: true
        }
      ],
      rules: []
    }
  };
}

async function openClipper(page: Page, extensionPage: Page): Promise<void> {
  await selectFixtureText(page);
  const tabId = await findCurrentTabId(extensionPage, page.url());
  const result = await extensionPage.evaluate(async (targetTabId) => {
    return chrome.tabs.sendMessage(targetTabId, { action: 'clipSelection' });
  }, tabId);
  expect(result).toMatchObject({ success: true });
  await expect(page.locator('[data-stitch-surface="clipper"]')).toBeVisible();
}

async function updateVault(extensionPage: Page, vaultName: string): Promise<void> {
  const result = await extensionPage.evaluate(
    async ({ vaultId, nextName }) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId: `live-runtime-${crypto.randomUUID()}`,
        command: {
          kind: 'patch',
          patches: [
            {
              path: ['vaultRouter'],
              value: {
                defaultVaultId: vaultId,
                vaults: [
                  {
                    id: vaultId,
                    name: nextName,
                    vault: nextName,
                    localFolderId: 'live-runtime-folder',
                    localFolderName: nextName,
                    httpsUrl: 'https://127.0.0.1:27124',
                    httpUrl: 'http://127.0.0.1:27123',
                    apiKey: '',
                    enabled: true,
                    isDefault: true
                  }
                ],
                rules: []
              }
            }
          ]
        }
      }),
    { vaultId: VAULT_ID, nextName: vaultName }
  );
  expect(result).toMatchObject({ success: true });
}

async function markDestinationRow(page: Page, marker: string): Promise<void> {
  const row = page.locator('.export-destination-row');
  await expect(row).toBeVisible();
  await row.evaluate((element, value) => {
    (element as HTMLElement).dataset.liveRuntimeMarker = value;
  }, marker);
}

async function expectProjectedDestination(
  page: Page,
  marker: string,
  label: string
): Promise<void> {
  await expect(page.locator('.export-destination-label')).toHaveText(label);
  await expect(page.locator('.export-destination-row')).toHaveAttribute(
    'data-live-runtime-marker',
    marker
  );
}

testWithExtension.describe('Options live runtime destination projection', () => {
  testWithExtension.slow();
  testWithExtension.setTimeout(60_000);

  testWithExtension(
    'updates already-open Clipper, Reader, and Video rows without replacing them',
    async ({ context, extensionPage }) => {
      const initialOptions = createStoredOptions(INITIAL_VAULT_NAME, false);
      const clipper = await openFixtureWithRuntime(
        context,
        extensionPage,
        'https://www.youtube.com/watch?v=live-runtime-clipper',
        youtubeFixtureHtml(),
        initialOptions
      );
      await openClipper(clipper.page, extensionPage);

      const reader = await openFixtureWithRuntime(
        context,
        extensionPage,
        'https://www.youtube.com/watch?v=live-runtime-reader',
        youtubeFixtureHtml(),
        initialOptions
      );
      await openClipper(reader.page, extensionPage);
      await reader.page
        .locator('[data-stitch-surface="clipper"] [data-action-id="reader"]')
        .click();
      await expect(reader.page.locator('[data-stitch-surface="reader"]')).toBeVisible();

      const video = await openFixtureWithRuntime(
        context,
        extensionPage,
        'https://www.bilibili.com/video/BV1liveRuntimeProjection/',
        bilibiliFixtureHtml(),
        initialOptions
      );
      await openVideoPanelFromControlBar(video.page, 'Live runtime projection');
      await expandVideoPanel(video.page);

      await markDestinationRow(clipper.page, 'clipper-row');
      await markDestinationRow(reader.page, 'reader-row');
      await markDestinationRow(video.page, 'video-row');

      await updateVault(extensionPage, LIVE_VAULT_NAME);
      await Promise.all([
        expectProjectedDestination(clipper.page, 'clipper-row', LIVE_VAULT_NAME),
        expectProjectedDestination(reader.page, 'reader-row', LIVE_VAULT_NAME),
        expectProjectedDestination(video.page, 'video-row', LIVE_VAULT_NAME)
      ]);

      await updateVault(extensionPage, RENAMED_VAULT_NAME);
      await Promise.all([
        expectProjectedDestination(clipper.page, 'clipper-row', RENAMED_VAULT_NAME),
        expectProjectedDestination(reader.page, 'reader-row', RENAMED_VAULT_NAME),
        expectProjectedDestination(video.page, 'video-row', RENAMED_VAULT_NAME)
      ]);

      await Promise.all([clipper.page.close(), reader.page.close(), video.page.close()]);
    }
  );
});
