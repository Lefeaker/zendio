import { createServer, type Server } from 'node:http';
import { expect, it } from 'vitest';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import { classify } from '../../../src/background/llm/classifier';
import { DEFAULT_TAXONOMY_CONFIG } from '../../../src/shared/types/taxonomy';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback server address missing');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

it('closes a real PUT connection when error headers arrive but the body never completes', async () => {
  let observedRequest = false;
  let disconnected = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const server = createServer((request, response) => {
    observedRequest = request.method === 'PUT' && request.url === '/vault/note.md';
    response.on('close', disconnected);
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.write('unfinished response');
  });
  const baseUrl = await listen(server);
  try {
    const result = createFetchRestClient().writeFile(
      { baseUrl, vault: 'Test', apiKey: 'synthetic' },
      'note.md',
      '# content',
      {
        deadlineAt: Date.now() + 500
      }
    );
    await expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
    await connectionClosed;
    expect(observedRequest).toBe(true);
  } finally {
    await close(server);
  }
});

it('closes a real classifier connection when successful headers arrive but JSON never completes', async () => {
  let observedRequest = false;
  let disconnected = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const server = createServer((request, response) => {
    observedRequest = request.method === 'POST';
    response.on('close', disconnected);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"message":');
  });
  const endpoint = await listen(server);
  try {
    await expect(
      classify(
        {
          enabled: true,
          provider: 'ollama',
          endpoint,
          model: 'test',
          apiKey: '',
          taxonomy: DEFAULT_TAXONOMY_CONFIG,
          timeoutMs: 500
        },
        { typeHint: 'article', platform: 'unknown', title: 'Example', url: '' },
        'preview'
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'CLASSIFIER_TIMEOUT' } });
    await connectionClosed;
    expect(observedRequest).toBe(true);
  } finally {
    await close(server);
  }
});

it('keeps a successful PUT acknowledgement and closes its unused streaming body', async () => {
  let disconnected = () => {};
  const connectionClosed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const server = createServer((_request, response) => {
    response.on('close', disconnected);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  const baseUrl = await listen(server);
  try {
    await expect(
      createFetchRestClient().writeFile(
        { baseUrl, vault: 'Test', apiKey: 'synthetic' },
        'note.md',
        '# content'
      )
    ).resolves.toBeUndefined();
    await connectionClosed;
  } finally {
    await close(server);
  }
});
