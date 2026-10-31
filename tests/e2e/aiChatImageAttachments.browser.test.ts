import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, type TestInfo } from '@playwright/test';
import messages from '../../src/i18n/catalog/messages/en/runtime.json' with { type: 'json' };
import { test as exportTest } from './utils/exportTitleSinks';
import {
  createOptionsFixture,
  EXTENSION_PATH,
  injectContentRuntime,
  openFixtureWithRuntime
} from './utils/videoListenerScopeHarness';
import {
  blockLocalImageFile,
  createImageOutputSink,
  imageChatHtml,
  imageHash,
  IMAGE_CHAT_URL,
  IMAGE_FIXTURES,
  IMAGE_NOTE_PATH,
  preserveLocalImageReadback,
  rejectSecondNativeImage,
  routeImageFixtures
} from './utils/aiChatImageAttachmentFixture';

const test = exportTest.extend({
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

const destinations: Array<'rest' | 'downloads' | 'local'> = ['rest', 'downloads', 'local'];
const altNames = ['upload-first', 'upload-repeat', 'answer-picture'];

type EvidenceValue =
  | string
  | number
  | boolean
  | null
  | EvidenceValue[]
  | { [key: string]: EvidenceValue };

async function recordEvidence(
  testInfo: TestInfo,
  name: string,
  value: EvidenceValue
): Promise<void> {
  const file = testInfo.outputPath(`${name}.json`);
  await fs.writeFile(file, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { contentType: 'application/json', path: file });
}

function messageImageReferences(markdown: string): Array<{ alt: string; url: string }> {
  return [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/gu)]
    .map((match) => ({ alt: match[1] ?? '', url: match[2] ?? '' }))
    .filter(({ alt }) => altNames.includes(alt));
}

function assertImageOutput(files: Map<string, Buffer>) {
  const notes = [...files.entries()].filter(([name]) => name.endsWith('.md'));
  expect(notes).toHaveLength(1);
  const note = notes[0];
  if (!note) throw new Error('Missing actual note');
  const [notePath, bytes] = note;
  const markdown = bytes.toString('utf8');
  const references = messageImageReferences(markdown);
  expect(references.map(({ alt }) => alt)).toEqual(altNames);
  expect(references[0]?.url).toBe(references[1]?.url);
  expect(references[2]?.url).not.toBe(references[0]?.url);
  expect(markdown).not.toContain('aiob-attachment:');
  expect(markdown).toContain('![literal example](https://example.test/example.png)');
  for (const fixture of IMAGE_FIXTURES) expect(markdown).not.toContain(fixture.url);
  const expected = [IMAGE_FIXTURES[0], IMAGE_FIXTURES[0], IMAGE_FIXTURES[1]];
  const resolved: string[] = [];
  references.forEach((reference, index) => {
    expect(reference.url).not.toMatch(/^(?:https?:|blob:|data:)/u);
    const url = new URL(
      reference.url,
      `https://saved.test/${notePath.split('/').map(encodeURIComponent).join('/')}`
    );
    expect(url.hash).toBe('');
    expect(url.search).toBe('');
    const target = decodeURIComponent(url.pathname.slice(1));
    const image = files.get(target);
    expect(image, `Referenced file ${target} must exist`).toBeDefined();
    if (!image) throw new Error('Missing referenced bytes');
    const expectedImage = expected[index];
    if (!expectedImage) throw new Error('Unexpected image occurrence');
    expect(imageHash(image)).toBe(imageHash(expectedImage.bytes));
    resolved.push(target);
  });
  expect(files.size).toBe(3);
  return { notePath, markdown, references, resolved };
}

for (const destination of destinations) {
  test(`AI messages save original image bytes and repeated references to ${destination}`, async ({
    context,
    extensionPage
  }, testInfo) => {
    await routeImageFixtures(context);
    const { page, tabId } = await openFixtureWithRuntime(
      context,
      extensionPage,
      IMAGE_CHAT_URL,
      imageChatHtml(),
      createOptionsFixture({ selectionTriggerMode: 'disabled' })
    );
    const sink = await createImageOutputSink(
      extensionPage,
      destination,
      testInfo.outputPath('downloads')
    );
    const protectedPath = path.posix.join(
      path.posix.basename(IMAGE_NOTE_PATH, '.md').replaceAll('%', '_'),
      `ai-image-${imageHash(IMAGE_FIXTURES[0].bytes)}.png`
    );
    try {
      if (destination === 'downloads') {
        const existingFile = testInfo.outputPath('downloads', protectedPath);
        await fs.mkdir(path.dirname(existingFile), { recursive: true });
        await fs.writeFile(existingFile, 'protected existing file');
      }
      await page.reload();
      await injectContentRuntime(extensionPage, tabId);
      await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
      await extensionPage.evaluate(
        (tabId) => chrome.tabs.sendMessage(tabId, { action: 'clipFull' }),
        tabId
      );
      const progress = page.locator('#aiob-support-prompt [data-role="task-progress"]');
      if (destination === 'rest') {
        await expect.poll(() => sink.writes.length).toBe(3);
        await expect.poll(sink.notePending).toBe(true);
        expect(sink.writes.map(({ contentType }) => contentType)).toEqual([
          IMAGE_FIXTURES[0].mimeType,
          IMAGE_FIXTURES[1].mimeType,
          'text/markdown; charset=utf-8'
        ]);
        expect(sink.writes.map(({ path: written }) => written.endsWith('.md'))).toEqual([
          false,
          false,
          true
        ]);
        await expect(progress).toHaveClass(/is-progress/);
        await expect(page.locator('#aiob-support-prompt [data-role="status-text"]')).toHaveText(
          messages.supportProgressWritingNote
        );
        sink.acknowledgeNote();
      }
      await expect(progress).toHaveClass(/is-success/);
      const files = await sink.files();
      if (destination === 'local')
        await preserveLocalImageReadback(testInfo.outputPath('local-vault-readback'), files);
      const exported = new Map(files);
      if (destination === 'downloads') {
        expect(files.get(protectedPath)?.toString()).toBe('protected existing file');
        exported.delete(protectedPath);
      }
      const output = assertImageOutput(exported);
      expect(sink.unexpectedRestWrites()).toBe(0);
      if (destination === 'downloads') {
        const downloads = await extensionPage.evaluate(() =>
          chrome.downloads.search({ orderBy: ['startTime'] })
        );
        expect(downloads).toHaveLength(3);
        expect(downloads.every(({ state }) => state === 'complete')).toBe(true);
        expect(downloads.at(-1)?.filename.endsWith('.md')).toBe(true);
      } else {
        expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toEqual([]);
      }
      const identity = await extensionPage.evaluate(() => ({
        id: chrome.runtime.id,
        version: chrome.runtime.getManifest().version
      }));
      await recordEvidence(testInfo, 'ai-extractor-image-output', {
        ...identity,
        fixture: 'Controlled ChatGPT DOM → installed production AI extractor → actual sink',
        destination,
        manifestSha256: imageHash(await fs.readFile(path.join(EXTENSION_PATH, 'manifest.json'))),
        ...output,
        files: [...files].map(([name, content]) => ({
          name,
          size: content.length,
          sha256: imageHash(content)
        }))
      });
    } finally {
      await sink.close();
    }
  });

  test(`a second ${destination} image write failure never writes a complete note`, async ({
    context,
    extensionPage
  }, testInfo) => {
    await routeImageFixtures(context);
    const { page, tabId } = await openFixtureWithRuntime(
      context,
      extensionPage,
      IMAGE_CHAT_URL,
      imageChatHtml(),
      createOptionsFixture({ selectionTriggerMode: 'disabled' })
    );
    const sink = await createImageOutputSink(
      extensionPage,
      destination,
      testInfo.outputPath('downloads'),
      true
    );
    try {
      if (destination === 'downloads') {
        const worker = context.serviceWorkers()[0];
        if (!worker) throw new Error('Missing extension worker');
        await rejectSecondNativeImage(worker);
      } else if (destination === 'local') {
        await blockLocalImageFile(
          extensionPage,
          `AI/assets/Image attachment #%/ai-image-${imageHash(IMAGE_FIXTURES[1].bytes)}.gif`
        );
      }
      await page.reload();
      await injectContentRuntime(extensionPage, tabId);
      await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
      await extensionPage.evaluate(
        (tabId) => chrome.tabs.sendMessage(tabId, { action: 'clipFull' }),
        tabId
      );
      await expect(page.locator('#aiob-support-prompt [data-role="task-progress"]')).toHaveClass(
        /is-failure/
      );
      await expect(page.locator('#aiob-support-prompt [data-role="status-text"]')).toContainText(
        messages.saveResultUnknown
      );
      const files = await sink.files();
      if (destination === 'local')
        await preserveLocalImageReadback(testInfo.outputPath('local-vault-readback'), files);
      expect([...files.keys()].some((name) => name.endsWith('.md'))).toBe(false);
      expect(files.size).toBe(1);
      const firstImage = [...files.values()][0];
      if (!firstImage) throw new Error('Missing the first confirmed image file');
      expect(imageHash(firstImage)).toBe(imageHash(IMAGE_FIXTURES[0].bytes));
      expect(sink.writes.some(({ path: written }) => written.endsWith('.md'))).toBe(false);
      expect(sink.unexpectedRestWrites()).toBe(0);
      await recordEvidence(testInfo, 'controlled-attachment-failure', {
        destination,
        fault:
          destination === 'rest'
            ? 'Second attachment HTTP 500'
            : destination === 'downloads'
              ? 'Reject second native download invocation; first is a real native file'
              : 'Actual directory at second image file path blocks direct and offscreen writes',
        files: [...files].map(([name, content]) => ({ name, sha256: imageHash(content) })),
        writes: sink.writes.map(({ bytes, ...write }) => ({
          ...write,
          sha256: imageHash(bytes)
        }))
      });
    } finally {
      await sink.close();
    }
  });
}

test('an unavailable message image fails preparation before any destination write', async ({
  context,
  extensionPage
}, testInfo) => {
  await routeImageFixtures(context, true);
  const { page, tabId } = await openFixtureWithRuntime(
    context,
    extensionPage,
    IMAGE_CHAT_URL,
    imageChatHtml(),
    createOptionsFixture({ selectionTriggerMode: 'disabled' })
  );
  const sink = await createImageOutputSink(extensionPage, 'rest', testInfo.outputPath('downloads'));
  try {
    await page.reload();
    await injectContentRuntime(extensionPage, tabId);
    await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
    await extensionPage.evaluate(
      (tabId) => chrome.tabs.sendMessage(tabId, { action: 'clipFull' }),
      tabId
    );
    await expect(page.locator('#aiob-support-prompt [data-role="task-progress"]')).toHaveClass(
      /is-failure/
    );
    expect(sink.writes).toEqual([]);
    expect((await sink.files()).size).toBe(0);
    await recordEvidence(testInfo, 'image-preparation-rejected', {
      fault: 'Required second source image returns HTTP 403',
      status: await page.locator('#aiob-support-prompt [data-role="status-text"]').innerText(),
      writes: 0,
      files: 0
    });
  } finally {
    await sink.close();
  }
});
