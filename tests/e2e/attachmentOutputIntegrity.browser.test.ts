import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import type { ClipPayload, ClipResultResponse } from '../../src/shared/types';
import { test } from './utils/exportTitleSinks';
import {
  createOptionsFixture,
  seedOptions,
  EXTENSION_PATH,
  type StoredOptionsFixture
} from './utils/videoListenerScopeHarness';

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
