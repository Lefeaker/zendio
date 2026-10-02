import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CompleteOptions } from '../../src/shared/types/options';

const config = (changes: object) =>
  JSON.stringify({ format: 'zendio-ai-config', version: 1, changes });

test('installed AI configuration previews, applies, preserves and rejects stale changes', async ({
  browserName
}, testInfo) => {
  test.skip(browserName !== 'chromium');
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-ai-configuration-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 900 },
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath
    ]
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = worker.url().split('/')[2];
    const bindings = {
      version: 1,
      bindings: { main: { folderId: 'ai-fixture-folder', folderName: 'AI Fixture' } }
    };
    await worker.evaluate(async (localBindings) => {
      await chrome.storage.sync.set({
        language: 'en',
        options: {
          rest: {
            vault: 'Existing',
            apiKey: 'AI_FIXTURE_SECRET',
            httpsUrl: 'https://127.0.0.1:27124/',
            httpUrl: ''
          },
          vaultRouter: {
            defaultVaultId: 'main',
            vaults: [
              {
                id: 'main',
                name: 'Existing',
                vault: 'Existing',
                apiKey: 'AI_FIXTURE_SECRET',
                httpsUrl: 'https://127.0.0.1:27124/',
                httpUrl: '',
                isDefault: true,
                enabled: true,
                rules: [
                  {
                    id: 'old',
                    vaultId: 'main',
                    type: 'domain',
                    pattern: 'old.test',
                    enabled: true,
                    priority: 1
                  }
                ]
              }
            ]
          },
          domainMappings: { 'old.test': 'Keep' },
          yamlConfig: {
            contentTypes: {
              article: {
                customFields: [
                  { name: 'existing', type: 'text', enabled: true, defaultValue: 'keep' }
                ]
              }
            }
          }
        }
      });
      await chrome.storage.local.set({ deviceLocalVaultBindings: localBindings });
    }, bindings);
    const read = () =>
      worker.evaluate(
        async () => (await chrome.storage.sync.get<{ options: CompleteOptions }>('options')).options
      );
    const readBindings = () =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get('deviceLocalVaultBindings')).deviceLocalVaultBindings
      );
    const guide = await context.newPage();
    await guide.goto('chrome-extension://' + id + '/onboarding/index.html');
    const opened = context.waitForEvent('page');
    await guide.getByRole('button', { name: 'AI-assisted configuration', exact: true }).click();
    const page = await opened;
    await expect(page.locator('#settingsTourTopics')).toHaveValue('ai');
    await page.locator('#settingsTourClose').click();
    await expect(page.locator('#aiConfigInput')).toBeVisible();
    await page.locator('#aiConfigIncludeCurrent').check();
    await page.locator('#aiConfigCopy').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('Copied.');
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain('zendio-ai-config');
    expect(prompt).toContain('"current"');
    expect(prompt).not.toContain('AI_FIXTURE_SECRET');
    expect(prompt).not.toContain('ai-fixture-folder');
    const before = await read();
    const input =
      'Here is your configuration:\n```json\n' +
      config({
        'fragmentClipper.selectionModifierKeys': ['alt'],
        'readingSession.exportMode': 'full',
        'fragmentClipper.selectionTriggerMode': 'modifier'
      }) +
      '\n```';
    await page.locator('#aiConfigInput').fill(input);
    await expect(page.locator('.ai-config-change')).toHaveCount(2);
    await expect(page.locator('#aiConfigChanges thead th')).toHaveCount(3);
    await expect(page.locator('.ai-config-change').first()).toContainText('Shift');
    expect(await read()).toEqual(before);
    expect(
      await page
        .locator('.ai-config-change')
        .first()
        .evaluate((node) => node.getBoundingClientRect().height)
    ).toBeLessThan(70);
    await expect(page.locator('#aiConfigChanges thead th')).toHaveText([
      'Setting',
      'Before',
      'After'
    ]);
    await page.screenshot({ path: testInfo.outputPath('ai-preview-en.png'), fullPage: true });
    await page.locator('#aiConfigApply').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('Applied 2 changes.');
    await expect
      .poll(async () => (await read()).fragmentClipper?.selectionModifierKeys)
      .toEqual(['alt']);
    expect((await read()).readingSession?.exportMode).toBe('full');
    expect((await read()).rest.apiKey).toBe('AI_FIXTURE_SECRET');
    expect((await read()).templates).toEqual(before.templates);
    expect(await readBindings()).toEqual(bindings);
    await expect(page.locator('#aiConfigInput')).toHaveValue(input);
    await page.locator('#aiConfigUndo').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('The last application was undone.');
    expect((await read()).fragmentClipper?.selectionModifierKeys).toEqual(['shift']);
    await page.locator('#aiConfigRefresh').click();
    await page.locator('#aiConfigApply').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('Applied 2 changes.');
    await page.reload();
    await expect(page.locator('#aiConfigInput')).toBeVisible();
    await expect(page.locator('#aiConfigUndo')).toBeHidden();
    expect((await read()).readingSession?.exportMode).toBe('full');

    await page.locator('#aiConfigInput').fill(
      config({
        'fragmentClipper.selectionModifierKeys': ['shift'],
        'readingSession.exportMode': 'highlights'
      })
    );
    const other = await context.newPage();
    await other.goto('chrome-extension://' + id + '/options/index.html#section-capture');
    const commandButton = other.locator(
      '.modifier-key-choices [data-value="ctrl"], .modifier-key-choices [data-value="meta"]'
    );
    await expect(commandButton).toBeVisible();
    const commandKey = await commandButton.getAttribute('data-value');
    await commandButton.click();
    await expect
      .poll(async () => (await read()).fragmentClipper?.selectionModifierKeys)
      .toEqual([commandKey]);
    await page.bringToFront();
    await page.locator('#aiConfigApply').click();
    await expect(page.locator('#aiConfigStatus')).toContainText('changed after the preview');
    expect((await read()).readingSession?.exportMode).toBe('full');
    await page.locator('#aiConfigRefresh').click();
    await page.locator('#aiConfigApply').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('Applied 2 changes.');
    expect((await read()).fragmentClipper?.selectionModifierKeys).toEqual(['shift']);
    await other.close();

    await page.locator('#aiConfigInput').fill(
      config({
        domainMappings: { 'new.test': 'Research' },
        'vaultRouter.vaults': [{ id: '$default', name: 'Research' }],
        'vaultRouter.rules': [
          {
            id: 'new',
            vaultId: '$default',
            type: 'domain',
            pattern: 'new.test',
            enabled: true,
            priority: 20
          }
        ],
        yamlConfig: {
          contentTypes: {
            article: {
              customFields: [
                { name: 'project', type: 'text', enabled: true, defaultValue: 'Research' }
              ]
            }
          }
        }
      })
    );
    await expect(page.locator('.ai-config-change')).toHaveCount(3);
    expect(await page.locator('#aiConfigChanges').innerText()).not.toContain('AI_FIXTURE_SECRET');
    await page.locator('#aiConfigApply').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('Applied 3 changes.');
    const saved = await read();
    expect(saved.domainMappings).toMatchObject({ 'old.test': 'Keep', 'new.test': 'Research' });
    expect(saved.rest).toMatchObject({ vault: 'Research', apiKey: 'AI_FIXTURE_SECRET' });
    expect(saved.vaultRouter?.vaults[0]?.rules?.map((rule) => rule.id)).toEqual(['old', 'new']);
    expect(
      saved.yamlConfig?.contentTypes?.article?.customFields?.map((field) => field.name)
    ).toEqual(['existing', 'project']);
    expect(await readBindings()).toEqual(bindings);
    await page.locator('#aiConfigUndo').click();
    await expect(page.locator('#aiConfigStatus')).toHaveText('The last application was undone.');
    expect((await read()).rest.vault).toBe('Existing');
    expect(await readBindings()).toEqual(bindings);
    const protectedState = await read();
    await page.locator('#aiConfigInput').fill(config({ 'rest.apiKey': 'NEVER_ECHO_THIS_VALUE' }));
    await expect(page.locator('#aiConfigApply')).toBeDisabled();
    await page.locator('#aiConfigCopyError').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain(
      'NEVER_ECHO_THIS_VALUE'
    );
    expect(await read()).toEqual(protectedState);

    for (const language of ['zh-CN', 'de', 'ja']) {
      await worker.evaluate(async (value) => {
        await chrome.storage.sync.set({ language: value });
      }, language);
      await page.setViewportSize({ width: language === 'zh-CN' ? 1280 : 360, height: 900 });
      await page.emulateMedia({ colorScheme: language === 'de' ? 'dark' : 'light' });
      await page.reload();
      await page.locator('#aiConfigInput').fill(input);
      await expect(page.locator('.ai-config-change')).toHaveCount(2);
      await expect(page.locator('#aiConfigChanges tbody th')).toHaveCount(2);
      if (language !== 'zh-CN') {
        const diff = page.locator('#aiConfigChanges');
        expect(await diff.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await diff.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => diff.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({
        path: testInfo.outputPath('ai-preview-' + language + '.png'),
        fullPage: true
      });
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('applied AI settings change real selection, reader export and video screenshot output', async ({
  browserName
}) => {
  test.skip(browserName !== 'chromium');
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-ai-output-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: true,
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath
    ]
  });
  const cleanup: string[] = [];
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = worker.url().split('/')[2];
    const options = await context.newPage();
    const downloadSession = await context.newCDPSession(options);
    await downloadSession.send('Browser.setDownloadBehavior', {
      behavior: 'default'
    });
    await options.goto('chrome-extension://' + id + '/options/index.html#section-maintenance');
    await options.locator('#aiConfigInput').fill(
      config({
        'fragmentClipper.selectionModifierKeys': ['alt'],
        'readingSession.exportMode': 'full',
        'video.screenshotAttachment.locationTemplate': 'AI-Screenshots',
        'video.screenshotAttachment.fileNameTemplate': 'AI-${originalAttachmentFileName}'
      })
    );
    await expect(options.locator('.ai-config-change')).toHaveCount(4);
    await options.locator('#aiConfigApply').click();
    await expect(options.locator('#aiConfigStatus')).toHaveText('Applied 4 changes.');
    await options.reload();
    const practice = await context.newPage();
    await practice.goto(
      'chrome-extension://' + id + '/onboarding/practice.html?lesson=reader&run=ai-settings'
    );
    await expect(practice.locator('kbd')).toHaveText('Alt');
    const secondPassage = (await practice.locator('#practiceSecond').innerText()).slice(0, 80);
    const rect = await practice.locator('#practiceFirst').evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const first = range.getClientRects()[0];
      if (!first) throw new Error('Missing passage');
      return { x: first.x, y: first.y, width: first.width, height: first.height };
    });
    await practice.keyboard.down('Alt');
    await practice.mouse.move(rect.x + 1, rect.y + rect.height / 2);
    await practice.mouse.down();
    await practice.mouse.move(rect.x + Math.min(rect.width - 2, 380), rect.y + rect.height / 2, {
      steps: 15
    });
    await practice.mouse.up();
    await practice.keyboard.up('Alt');
    await expect(practice.locator('[data-action-id="reader"]')).toBeVisible();
    await practice.locator('[data-action-id="reader"]').click();
    await expect(practice.locator('#aiob-reader-panel')).toBeVisible();
    await practice.locator('[data-action-id="reader:finish"]').click();
    const downloads = () => worker.evaluate(() => chrome.downloads.search({ state: 'complete' }));
    await expect.poll(async () => (await downloads()).length).toBe(1);
    const readerFile = (await downloads())[0];
    if (!readerFile) throw new Error('Missing actual reader export');
    cleanup.push(readerFile.filename);
    // Only the first paragraph was highlighted. Full-article export must include the distant one.
    expect(await readFile(readerFile.filename, 'utf8')).toContain(secondPassage);
    await practice.goto(
      'chrome-extension://' + id + '/onboarding/practice.html?lesson=video&run=ai-settings'
    );
    await expect
      .poll(() =>
        practice.locator('#practiceVideo').evaluate((node: HTMLVideoElement) => node.readyState)
      )
      .toBeGreaterThanOrEqual(2);
    await practice.locator('[data-practice-time="3"]').click();
    await practice.locator('#practiceStartVideo').click();
    await practice.locator('[data-action-id="video:add"]').click();
    await expect(practice.locator('.session-item-marker-time')).toHaveText('00:03');
    await practice.locator('.video-screenshot-toggle').click();
    await expect(practice.locator('.video-screenshot-toggle')).toHaveAttribute(
      'data-screenshot-state',
      'on'
    );
    await practice.locator('[data-action-id="video:finish"]').click();
    await expect.poll(async () => (await downloads()).length).toBe(3);
    const videoFiles = (await downloads()).filter((file) => file.id !== readerFile.id);
    cleanup.push(...videoFiles.map((file) => file.filename));
    const screenshot = videoFiles.find((file) => file.mime === 'image/jpeg');
    const note = videoFiles.find((file) => file.mime?.includes('text'));
    if (!screenshot || !note) throw new Error('Missing actual video export files');
    expect(screenshot.filename).toContain('/AI-Screenshots/AI-');
    expect(await readFile(note.filename, 'utf8')).toContain('AI-Screenshots/AI-');
    expect((await readFile(screenshot.filename)).length).toBeGreaterThan(1000);
  } finally {
    await context.close();
    for (const file of cleanup) await rm(file, { force: true });
    await rm(profile, { recursive: true, force: true });
  }
});
