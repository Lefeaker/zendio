import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import type { ClipPayload, ClipResultResponse } from '../../src/shared/types';
import { configureSink, test as exportTest } from './utils/exportTitleSinks';
import {
  createOptionsFixture,
  seedOptions,
  EXTENSION_PATH,
  type StoredOptionsFixture
} from './utils/videoListenerScopeHarness';

// Output assertions need an extension origin, not a development-only harness page.
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

const imageData =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=';
const title = 'Review#1 % 中文 (notes)';
const imageName = '图 #% (a).png';

function payload(secondByteLength = Buffer.from(imageData, 'base64').length): ClipPayload {
  return {
    title,
    type: 'video',
    markdown: '![first](aiob-attachment:a)\n![second](aiob-attachment:a)b)',
    meta: {
      url: 'https://attachment-integrity.test/video',
      exportDestination: { kind: 'downloads' },
      attachments: [
        {
          id: 'a',
          fileName: imageName,
          mimeType: 'image/png',
          content: {
            encoding: 'base64',
            data: imageData,
            byteLength: Buffer.from(imageData, 'base64').length
          }
        },
        {
          id: 'a)b',
          fileName: imageName,
          mimeType: 'image/png',
          content: { encoding: 'base64', data: imageData, byteLength: secondByteLength }
        }
      ]
    }
  };
}

test.beforeEach(async ({ extensionPage, context }, testInfo) => {
  const downloads = testInfo.outputPath('downloads');
  await mkdir(downloads, { recursive: true });
  const cdp = await context.newCDPSession(extensionPage);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  await cdp.detach();
  await seedOptions(extensionPage, createOptionsFixture());
  await extensionPage.evaluate(async () => {
    const stored = await chrome.storage.sync.get<{ options: StoredOptionsFixture }>('options');
    await chrome.storage.sync.set({
      options: {
        ...stored.options,
        classifier: { enabled: false },
        templates: { video: '{title}.md' }
      }
    });
  });
});

test('installed download output resolves exact attachment IDs and encoded paths after native uniquification', async ({
  extensionPage,
  context
}, testInfo) => {
  const backgroundLogs: string[] = [];
  context.serviceWorkers()[0]?.on('console', (message) => backgroundLogs.push(message.text()));
  const downloads = testInfo.outputPath('downloads');
  // A real existing file forces the browser to choose a different physical leaf name.
  const existing = path.join(downloads, title.replaceAll('%', '_'), imageName.replaceAll('%', '_'));
  await mkdir(path.dirname(existing), { recursive: true });
  await writeFile(existing, 'protected existing file');
  const response: ClipResultResponse = await extensionPage.evaluate(
    (clip) => chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: clip }),
    payload()
  );
  const diagnosticPath = testInfo.outputPath('clip-result.json');
  await writeFile(
    diagnosticPath,
    JSON.stringify({
      response,
      backgroundLogs,
      downloads: await extensionPage.evaluate(() => chrome.downloads.search({}))
    })
  );
  await testInfo.attach('clip-result', { contentType: 'application/json', path: diagnosticPath });
  expect(response.success).toBe(true);
  if (!response.success) throw new Error('Installed clip failed');
  const files = await extensionPage.evaluate(() => chrome.downloads.search({}));
  expect(files).toHaveLength(3);
  expect(files.every((file) => file.filename.startsWith(`${downloads}${path.sep}`))).toBe(true);
  expect(files.every((file) => file.state === 'complete')).toBe(true);
  expect(await readFile(existing, 'utf8')).toBe('protected existing file');
  const markdown = await readFile(response.filePath, 'utf8');
  expect(markdown).not.toContain('aiob-attachment:');
  const references = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)].map((match) => match[1]);
  expect(references).toHaveLength(2);
  expect(new Set(references).size).toBe(2);
  const resolvedPaths: string[] = [];
  for (const reference of references) {
    const url = new URL(reference, pathToFileURL(response.filePath));
    expect(url.hash).toBe('');
    expect(url.search).toBe('');
    const resolved = fileURLToPath(url);
    expect(files.some((file) => file.filename === resolved)).toBe(true);
    expect(await readFile(resolved)).toEqual(Buffer.from(imageData, 'base64'));
    resolvedPaths.push(resolved);
  }
  const identity = await extensionPage.evaluate(() => ({
    id: chrome.runtime.id,
    version: chrome.runtime.getManifest().version
  }));
  await testInfo.attach('actual-attachment-artifacts', {
    contentType: 'application/json',
    body: JSON.stringify({
      ...identity,
      fixture: 'installed Chromium extension; real native downloads; synthetic clip input',
      manifestSha256: createHash('sha256')
        .update(await readFile(path.join(EXTENSION_PATH, 'manifest.json')))
        .digest('hex'),
      markdown,
      resolvedPaths,
      files: files.map(({ filename, state }) => ({ filename, state }))
    })
  });
});

test('installed message boundary rejects a malformed second attachment before creating any download', async ({
  extensionPage
}) => {
  const response: ClipResultResponse = await extensionPage.evaluate(
    (clip) => chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: clip }),
    payload(1)
  );
  expect(response).toMatchObject({
    success: false,
    outcome: 'failed',
    failureCategory: 'validation'
  });
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(0);
});

for (const withAttachments of [false, true]) {
  test(`installed export preserves literal attachment examples with attachments=${withAttachments}`, async ({
    extensionPage
  }) => {
    const marker = '![example](aiob-attachment:a)';
    const literal = [
      `# Examples\n\n\`\`\`markdown\n${marker}\n\`\`\`\n\nUse \`${marker}\` here.\n\n    ${marker}\n\n!\\[example](aiob-attachment:a)`,
      `1. Intro\n2. ~~~markdown\n   ${marker}\n   ~~~`,
      `1. Intro\n2. \`\`\`markdown\n   ${marker}\n   \`\`\``,
      `1. Intro\n2. \`\`\`markdown\n   ${marker}\n   \`\`\`\``,
      `1. Intro\n2. \`\`\`markdown\n   ${marker}`
    ].join('\n\n');
    const clip = payload();
    clip.markdown = withAttachments ? `${literal}\n\n${clip.markdown}` : literal;
    if (!withAttachments && clip.meta) delete clip.meta.attachments;
    const response: ClipResultResponse = await extensionPage.evaluate(
      (input) => chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: input }),
      clip
    );
    expect(response.success).toBe(true);
    if (!response.success) throw new Error('Literal example export failed');
    const markdown = await readFile(response.filePath, 'utf8');
    expect(markdown).toContain(literal);
    if (withAttachments) {
      expect(markdown).not.toContain('![first](aiob-attachment:');
      expect(markdown).not.toContain('![second](aiob-attachment:');
    }
    const files = await extensionPage.evaluate(() => chrome.downloads.search({}));
    expect(files).toHaveLength(withAttachments ? 3 : 1);
    expect(files.every((file) => file.state === 'complete')).toBe(true);
  });
}

test('installed export rejects a real missing reference next to a literal example before writing', async ({
  extensionPage
}) => {
  const clip = payload();
  clip.markdown = '`![example](aiob-attachment:missing)`\n\n![real](aiob-attachment:missing)';
  const response: ClipResultResponse = await extensionPage.evaluate(
    (input) => chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: input }),
    clip
  );
  expect(response).toMatchObject({
    success: false,
    outcome: 'failed',
    failureCategory: 'validation'
  });
  expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(0);
});

const orderedItemDestinations: ('downloads' | 'rest')[] = ['downloads', 'rest'];
for (const destination of orderedItemDestinations) {
  test(`installed ${destination} export cannot hide a live attachment across ordered items`, async ({
    extensionPage
  }, testInfo) => {
    const sink = await configureSink(extensionPage, destination, testInfo.outputPath('downloads'));
    const clip: ClipPayload = {
      title: 'List boundary',
      type: 'article',
      markdown: '1. `literal\n2. ![Screenshot](aiob-attachment:a)\n3. literal`',
      meta: { url: 'https://attachment-integrity.test/list' }
    };
    try {
      const missing: ClipResultResponse = await extensionPage.evaluate(
        (data) => chrome.runtime.sendMessage({ type: 'clip', data }),
        clip
      );
      expect(missing).toMatchObject({ success: false, failureCategory: 'validation' });
      expect(sink.writeAttempts).toBe(0);
      expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(0);

      clip.meta = { ...clip.meta, attachments: payload().meta?.attachments?.slice(0, 1) };
      const saved: ClipResultResponse = await extensionPage.evaluate(
        (data) => chrome.runtime.sendMessage({ type: 'clip', data }),
        clip
      );
      expect(saved.success).toBe(true);
      if (!saved.success) throw new Error('List attachment export failed');
      const markdown =
        destination === 'rest'
          ? await sink.read('Articles/list-boundary.md')
          : await readFile(saved.filePath, 'utf8');
      expect(markdown).not.toContain('aiob-attachment:');
      expect(markdown).toContain('1. `literal');
      expect(markdown).toContain('3. literal`');
      const href = /!\[Screenshot\]\(([^)]+)\)/u.exec(markdown)?.[1];
      expect(href).toBeTruthy();
      if (!href) throw new Error('Missing resolved attachment path');
      if (destination === 'rest') {
        const relativePath = path.posix.join('Articles', decodeURIComponent(href));
        expect(sink.writeAttempts).toBe(2);
        expect(sink.files.get(`/vault/${relativePath}`)).toBe(
          Buffer.from(imageData, 'base64').toString('utf8')
        );
      } else {
        const bytes = await readFile(
          path.resolve(path.dirname(saved.filePath), decodeURIComponent(href))
        );
        expect(bytes).toEqual(Buffer.from(imageData, 'base64'));
        expect(await extensionPage.evaluate(() => chrome.downloads.search({}))).toHaveLength(2);
      }
    } finally {
      await sink.close();
    }
  });
}
