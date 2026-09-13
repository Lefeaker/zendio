import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import {
  testWithExtension,
  EXTENSION_PATH,
  type StoredOptionsFixture
} from './videoListenerScopeHarness';

// Native download preferences preserve chrome.downloads' supplied filename.
// CDP's `allow` override replaces it with the data URL's generic download.md.
export const test = testWithExtension.extend({
  context: async ({ browserName }, use, testInfo) => {
    void browserName;
    const profile = testInfo.outputPath('profile');
    const downloads = testInfo.outputPath('downloads');
    await fs.mkdir(path.join(profile, 'Default'), { recursive: true });
    await fs.mkdir(downloads, { recursive: true });
    await fs.writeFile(
      path.join(profile, 'Default', 'Preferences'),
      JSON.stringify({ download: { default_directory: downloads, prompt_for_download: false } })
    );
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: 'chromium',
      acceptDownloads: false,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });
    try {
      await context.tracing.start({ screenshots: true, snapshots: true });
      await use(context);
    } finally {
      await context.tracing.stop({
        path:
          testInfo.status !== testInfo.expectedStatus ? testInfo.outputPath('trace.zip') : undefined
      });
      await context.close();
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
});

export type Destination = 'downloads' | 'local' | 'rest' | 'explicit-downloads';
const folderId = 'title-test-folder';
export async function configureSink(page: Page, destination: Destination, outputDirectory: string) {
  const received = new Map<string, string>();
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      if (request.method === 'PUT') received.set(decodeURIComponent(request.url ?? ''), body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test REST address');
  const endpoint = `http://127.0.0.1:${address.port}`;
  if (destination === 'local') {
    await page.evaluate(async (id) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getDirectoryHandle(id, { create: true });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ai2ob-local-vault-folders', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('folders', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('folders', 'readwrite');
          transaction.objectStore('folders').put({ id, name: 'Title Test', handle });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      });
      await chrome.storage.local.set({
        deviceLocalVaultBindings: {
          version: 1,
          bindings: { default: { folderId: id, folderName: 'Title Test' } }
        }
      });
    }, folderId);
  }
  await page.evaluate(
    async ({ endpoint, destination }) => {
      const stored = await chrome.storage.sync.get<{ options: StoredOptionsFixture }>('options');
      await chrome.storage.sync.set({
        options: {
          ...stored.options,
          rest: {
            baseUrl: endpoint,
            httpUrl: endpoint,
            httpsUrl: '',
            vault: destination === 'downloads' ? '' : 'TitleTest',
            apiKey:
              destination === 'rest' || destination === 'explicit-downloads' ? 'fixture-key' : ''
          },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                id: 'default',
                name: 'Title Test',
                vault: 'TitleTest',
                enabled: true,
                isDefault: true,
                httpUrl: endpoint,
                httpsUrl: '',
                apiKey:
                  destination === 'rest' || destination === 'explicit-downloads'
                    ? 'fixture-key'
                    : '',
                rules: []
              }
            ],
            rules: []
          },
          templates: {
            video: 'Video/{slug}.md',
            article: 'Articles/{slug}.md',
            reading: 'Reading/{slug}.md',
            fragment: 'Fragments/{slug}.md'
          }
        }
      });
    },
    { endpoint, destination }
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  return {
    async read(relativePath: string, dated = false): Promise<string> {
      if (dated) {
        const directory = path.posix.dirname(relativePath);
        const stem = path.posix.basename(relativePath, '.md');
        const pattern = new RegExp(`^${stem}-\\d{4}-\\d{2}-\\d{2}t\\d{2}_\\d{2}_\\d{2}\\.md$`);
        const names = async (): Promise<string[]> => {
          if (destination === 'downloads') return fs.readdir(outputDirectory);
          if (destination === 'rest')
            return [...received.keys()]
              .filter((name) => name.startsWith(`/vault/${directory}/`))
              .map((name) => path.posix.basename(name));
          return page.evaluate(
            async ({ id, directory }) => {
              try {
                let folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(id);
                for (const part of directory.split('/'))
                  folder = await folder.getDirectoryHandle(part);
                const result: string[] = [];
                const hasKeys = (
                  handle: FileSystemDirectoryHandle
                ): handle is FileSystemDirectoryHandle & {
                  keys(): AsyncIterableIterator<string>;
                } => 'keys' in handle && typeof handle.keys === 'function';
                if (!hasKeys(folder)) throw new Error('Native directory iteration unavailable');
                for await (const key of folder.keys()) result.push(key);
                return result;
              } catch {
                return [];
              }
            },
            { id: folderId, directory }
          );
        };
        await expect.poll(names).toEqual([expect.stringMatching(pattern)]);
        const filename = (await names()).find((name) => pattern.test(name));
        if (!filename) throw new Error('Missing timestamped title');
        relativePath = `${directory}/${filename}`;
      }
      if (destination === 'rest') {
        await expect.poll(() => [...received.keys()]).toContain(`/vault/${relativePath}`);
        return received.get(`/vault/${relativePath}`) ?? '';
      }
      if (destination === 'local') {
        const read = () =>
          page.evaluate(
            async ({ id, relativePath }) => {
              try {
                let directory = await (
                  await navigator.storage.getDirectory()
                ).getDirectoryHandle(id);
                const parts = relativePath.split('/');
                const name = parts.pop();
                if (!name) throw new Error('Missing note filename');
                for (const part of parts) directory = await directory.getDirectoryHandle(part);
                return await (await (await directory.getFileHandle(name)).getFile()).text();
              } catch {
                return null;
              }
            },
            { id: folderId, relativePath }
          );
        await expect.poll(read).not.toBeNull();
        expect(received.size).toBe(0);
        return (await read()) ?? '';
      }
      const filename = path.basename(relativePath);
      await expect.poll(() => fs.readdir(outputDirectory)).toContain(filename);
      expect(received.size).toBe(0);
      return fs.readFile(path.join(outputDirectory, filename), 'utf8');
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  };
}
