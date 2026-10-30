import { createServer, type ServerResponse } from 'node:http';
import { expect } from '@playwright/test';
import englishMessages from '../../src/i18n/catalog/messages/en/runtime.json' with { type: 'json' };
import chineseMessages from '../../src/i18n/catalog/messages/zh-CN/runtime.json' with { type: 'json' };
import {
  testWithExtension,
  openFixtureWithRuntime,
  injectContentRuntime,
  createOptionsFixture,
  type StoredOptionsFixture
} from './utils/videoListenerScopeHarness';

const test = testWithExtension.extend({
  extensionPage: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = worker.url().split('/')[2];
    if (!extensionId) throw new Error('Missing installed extension identity');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/index.html`);
    try {
      await use(page);
    } finally {
      await page.close();
    }
  }
});

const languages: Array<'en' | 'zh-CN'> = ['en', 'zh-CN'];
languages.forEach((language) => {
  test(`${language}: extraction failure ends progress and retry succeeds only after the write acknowledgement`, async ({
    context,
    extensionPage
  }) => {
    const writes: Array<{ path: string; markdown: string }> = [];
    let pendingResponse: ServerResponse | undefined;
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        if (request.method === 'PUT') {
          writes.push({ path: decodeURIComponent(request.url ?? ''), markdown: body });
          pendingResponse = response;
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing REST test address');
    const endpoint = `http://127.0.0.1:${address.port}`;
    try {
      const { page, tabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        'https://chatgpt.com/c/support-status-regression',
        '<html><head><title>Feedback regression - ChatGPT</title></head><body><main></main></body></html>',
        createOptionsFixture({ selectionTriggerMode: 'disabled' })
      );
      await extensionPage.evaluate(
        async ({ endpoint, language }) => {
          const stored = await chrome.storage.sync.get<{ options: StoredOptionsFixture }>(
            'options'
          );
          const rest = {
            baseUrl: endpoint,
            httpUrl: endpoint,
            httpsUrl: '',
            vault: 'FeedbackTest',
            apiKey: 'synthetic-fixture-key'
          };
          await chrome.storage.sync.set({
            language,
            options: {
              ...stored.options,
              rest,
              vaultRouter: {
                defaultVaultId: 'default',
                vaults: [
                  {
                    ...rest,
                    id: 'default',
                    name: 'Feedback Test',
                    enabled: true,
                    isDefault: true,
                    rules: []
                  }
                ],
                rules: []
              },
              classifier: { enabled: false },
              templates: { ai: 'AI/{slug}.md' }
            }
          });
        },
        { endpoint, language }
      );
      await page.reload();
      await injectContentRuntime(extensionPage, tabId);
      await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
      const messages = language === 'en' ? englishMessages : chineseMessages;
      const status = page.locator('#aiob-support-prompt [data-role="status-text"]');
      const progress = page.locator('#aiob-support-prompt [data-role="task-progress"]');
      const clip = () =>
        extensionPage.evaluate(
          (tabId) => chrome.tabs.sendMessage(tabId, { action: 'clipFull' }),
          tabId
        );

      await clip();
      await expect(progress).toHaveClass(/is-failure/);
      await expect(status).toContainText(messages.errorExtractionAiChatParseEmpty);
      await expect(status).toContainText('EXTRACTION_AI_CHAT_PARSE_EMPTY');
      expect(writes).toEqual([]);

      // Keep the same content runtime and retry after the conversation becomes available.
      await page.locator('main').evaluate((main) => {
        main.innerHTML = `<article data-message-author-role="user"><div class="whitespace-pre-wrap">Question sentinel</div></article>
          <article data-message-author-role="assistant"><div class="markdown"><p>Answer sentinel</p></div></article>`;
      });
      await clip();
      await expect.poll(() => writes.length).toBe(1);
      await expect(progress).toHaveClass(/is-progress/);
      await expect(status).toHaveText(messages.supportProgressWritingNote);
      await expect(status).not.toContainText(messages.supportPromptStatusSuccess);

      // The real REST writer must await this acknowledgement before showing success.
      pendingResponse?.writeHead(200, { 'Content-Type': 'application/json' });
      pendingResponse?.end('{}');
      pendingResponse = undefined;
      await expect(progress).toHaveClass(/is-success/);
      await expect(status).toHaveText(
        messages.supportPromptStatusSuccessWithVault.replace('{vault}', 'FeedbackTest')
      );
      expect(writes).toHaveLength(1);
      expect(writes[0]?.path).toBe('/vault/AI/feedback-regression.md');
      expect(writes[0]?.markdown).toContain('Question sentinel');
      expect(writes[0]?.markdown).toContain('Answer sentinel');
      expect(writes[0]?.markdown).toContain('chatgpt');
      await expect(page.locator('#aiob-support-prompt')).toHaveCount(1);
    } finally {
      pendingResponse?.end('{}');
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
