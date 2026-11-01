import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { configureSink, type Destination } from './exportTitleSinks';
import type { StoredOptions } from '../../../src/shared/types/options';

export const IMAGE_CHAT_URL = 'https://chatgpt.com/c/attachment-roundtrip';
export const IMAGE_NOTE_PATH = 'AI/Image attachment #%.md';
type ImageFixture = { url: string; mimeType: string; bytes: Buffer };
export const IMAGE_FIXTURES: readonly [ImageFixture, ImageFixture] = [
  {
    url: 'https://chatgpt.com/media/attachment-first.png',
    mimeType: 'image/png',
    bytes: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=',
      'base64'
    )
  },
  {
    url: 'https://chatgpt.com/media/attachment-second.gif',
    mimeType: 'image/gif',
    bytes: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  }
];

export function imageHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Preserve bytes read from actual OPFS before the isolated browser profile is removed. */
export async function preserveLocalImageReadback(
  directory: string,
  files: ReadonlyMap<string, Buffer>
) {
  const root = path.resolve(directory);
  for (const [relative, bytes] of files) {
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`))
      throw new Error('Readback path escaped evidence root');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

export function imageChatHtml(): string {
  return `<!doctype html><html><head><title>Image attachments - ChatGPT</title></head><body><main>
    <article data-message-id="image-question" data-message-author-role="user">
      <div class="whitespace-pre-wrap"><p>Compare my uploaded pictures.</p>
        <img src="${IMAGE_FIXTURES[0].url}" alt="upload-first \`" width="96" height="96">
        <img src="${IMAGE_FIXTURES[0].url}" alt="upload-repeat \`" width="96" height="96">
      </div>
    </article>
    <article data-message-id="image-answer" data-message-author-role="assistant"><div class="markdown">
      <p>Generated answer picture.</p><img src="${IMAGE_FIXTURES[1].url}" alt="answer-picture" width="96" height="96">
      <div hidden><h4 data-conversation-role="assistant">Hidden role copy</h4></div>
      <pre><code class="language-markdown">![literal example](https://example.test/example.png)</code></pre>
    </div></article>
    </main></body></html>`;
}

export async function routeImageFixtures(context: BrowserContext, rejectSecond = false) {
  for (const [index, fixture] of IMAGE_FIXTURES.entries()) {
    await context.route(fixture.url, (route) =>
      route.fulfill({
        status: rejectSecond && index === 1 ? 403 : 200,
        contentType: rejectSecond && index === 1 ? 'text/html' : fixture.mimeType,
        body: rejectSecond && index === 1 ? '<html>Image unavailable</html>' : fixture.bytes
      })
    );
  }
}

type BinaryWrite = { path: string; contentType: string; bytes: Buffer; accepted: boolean };

async function createBinaryRestSink(outputDirectory: string, rejectSecond: boolean) {
  const writes: BinaryWrite[] = [];
  let pendingNote: ServerResponse | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      void (async () => {
        if (request.method !== 'PUT') {
          response.writeHead(200).end('{}');
          return;
        }
        const relative = decodeURIComponent(request.url ?? '').replace(/^\/vault\//u, '');
        const isNote = relative.endsWith('.md');
        const accepted = !(rejectSecond && !isNote && writes.length >= 1);
        const bytes = Buffer.concat(chunks);
        writes.push({
          path: relative,
          contentType: String(request.headers['content-type'] ?? ''),
          bytes,
          accepted
        });
        if (!accepted) {
          response.writeHead(500).end('{}');
          return;
        }
        const file = path.resolve(outputDirectory, relative);
        if (!file.startsWith(`${path.resolve(outputDirectory)}${path.sep}`))
          throw new Error('Test REST output escaped its directory');
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes);
        if (isNote) pendingNote = response;
        else response.writeHead(200).end('{}');
      })().catch(() => response.writeHead(500).end('{}'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing REST image test address');
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    writes,
    notePending: () => pendingNote !== undefined,
    acknowledgeNote() {
      pendingNote?.writeHead(200).end('{}');
      pendingNote = undefined;
    },
    async close() {
      pendingNote?.end('{}');
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  };
}

async function diskFiles(directory: string, prefix = ''): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await diskFiles(path.join(directory, entry.name), relative))
        files.set(name, bytes);
    } else if (entry.isFile())
      files.set(relative, await fs.readFile(path.join(directory, entry.name)));
  }
  return files;
}

async function localFiles(page: Page): Promise<Map<string, Buffer>> {
  const files = await page.evaluate(async () => {
    const { deviceLocalVaultBindings } = await chrome.storage.local.get<{
      deviceLocalVaultBindings: { bindings: { default: { folderId: string } } };
    }>('deviceLocalVaultBindings');
    const id = deviceLocalVaultBindings.bindings.default.folderId;
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(id);
    const rows: Array<{ path: string; bytes: number[] }> = [];
    function hasEntries(
      directory: FileSystemDirectoryHandle
    ): directory is FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    } {
      return 'entries' in directory && typeof directory.entries === 'function';
    }
    async function visit(directory: FileSystemDirectoryHandle, prefix: string) {
      if (!hasEntries(directory)) throw new Error('Native directory iteration is unavailable');
      for await (const [name, handle] of directory.entries()) {
        const relative = `${prefix}${name}`;
        if (handle.kind === 'directory')
          await visit(await directory.getDirectoryHandle(name), `${relative}/`);
        else {
          const file = await (await directory.getFileHandle(name)).getFile();
          rows.push({
            path: relative,
            bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
          });
        }
      }
    }
    await visit(root, '');
    return rows;
  });
  return new Map(files.map((file) => [file.path, Buffer.from(file.bytes)]));
}

export async function createImageOutputSink(
  extensionPage: Page,
  destination: Extract<Destination, 'downloads' | 'local' | 'rest'>,
  outputDirectory: string,
  rejectSecond = false
) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const configured = await configureSink(extensionPage, destination, outputDirectory);
  const rest =
    destination === 'rest' ? await createBinaryRestSink(outputDirectory, rejectSecond) : null;
  await extensionPage.evaluate(
    async ({ notePath, endpoint }) => {
      const { options } = await chrome.storage.sync.get<{ options: StoredOptions }>('options');
      if (!options.rest || !options.vaultRouter?.vaults)
        throw new Error('Image output sink was not configured');
      const receiver = endpoint ?? options.rest.httpUrl ?? options.rest.baseUrl;
      if (!receiver) throw new Error('Missing test-owned REST endpoint');
      const connection = {
        baseUrl: receiver,
        httpUrl: receiver,
        httpsUrl: receiver.replace(/^http:/u, 'https:')
      };
      await chrome.storage.sync.set({
        language: 'en',
        options: {
          ...options,
          classifier: { enabled: false },
          templates: { ai: notePath },
          rest: { ...options.rest, ...connection },
          vaultRouter: {
            ...options.vaultRouter,
            vaults: options.vaultRouter.vaults.map((vault) => ({ ...vault, ...connection }))
          }
        }
      });
    },
    { notePath: IMAGE_NOTE_PATH, endpoint: rest?.endpoint }
  );
  return {
    writes: rest?.writes ?? [],
    notePending: () => rest?.notePending() ?? false,
    acknowledgeNote: () => rest?.acknowledgeNote(),
    files: () => (destination === 'local' ? localFiles(extensionPage) : diskFiles(outputDirectory)),
    unexpectedRestWrites: () => configured.writeAttempts,
    async close() {
      await rest?.close();
      await configured.close();
    }
  };
}

/** First attachment is a real native file; reject only the second native write attempt. */
export async function rejectSecondNativeImage(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const native = chrome.downloads.download.bind(chrome.downloads);
    let imageWrites = 0;
    Object.defineProperty(chrome.downloads, 'download', {
      configurable: true,
      value: (options: chrome.downloads.DownloadOptions) => {
        if (!options.filename?.endsWith('.md') && ++imageWrites === 2)
          return Promise.reject(new Error('Controlled second image write rejection'));
        return native(options);
      }
    });
  });
}

/** A directory cannot be replaced by a file, in either direct or offscreen native writes. */
export async function blockLocalImageFile(page: Page, relativePath: string): Promise<void> {
  await page.evaluate(async (relativePath) => {
    const { deviceLocalVaultBindings } = await chrome.storage.local.get<{
      deviceLocalVaultBindings: { bindings: { default: { folderId: string } } };
    }>('deviceLocalVaultBindings');
    const id = deviceLocalVaultBindings.bindings.default.folderId;
    let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(id);
    for (const segment of relativePath.split('/'))
      directory = await directory.getDirectoryHandle(segment, { create: true });
  }, relativePath);
}
