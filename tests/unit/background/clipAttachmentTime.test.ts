import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configProvider } from '../../../src/shared/config/provider';
import type { ClipPayload } from '../../../src/shared/types/clip';
import {
  classifyClipMock,
  createPayload,
  downloadMock,
  inspectDownloadMock,
  getOptionsMock,
  selectVaultMock,
  writeAttachmentMock,
  writeMarkdownMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  templateOptions
} from './clipTestHarness';

beforeEach(() => {
  vi.resetModules();
  resetClipProcessorHarnessMocks();
});
afterEach(() => {
  vi.useRealTimers();
  restoreClipProcessorHarnessMocks();
});

it.each([
  'seconds-template',
  'default-midnight-downloads',
  'default-midnight-vault',
  'changed-content',
  'changed-template',
  'changed-target'
])('checks the original export intent after a clock boundary: %s', async (scenario) => {
  vi.useFakeTimers();
  const start = new Date(2026, 9, 15, 23, 59, 59);
  vi.setSystemTime(start);
  const actual = await vi.importActual<typeof import('../../../src/background/pathResolver')>(
    '../../../src/background/pathResolver'
  );
  resolvePathMock.mockImplementation(actual.resolvePath);
  getOptionsMock.mockResolvedValue({
    templates: {
      ...templateOptions,
      video: scenario === 'seconds-template' ? 'Video/{yyyy}-{mm}-{dd}_{HHmmss}_{slug}.md' : ''
    },
    domainMappings: {},
    rest: {}
  });
  classifyClipMock.mockResolvedValue({ type: 'video', topics: [], tags: [], status: 'success' });
  selectVaultMock.mockReturnValue({
    vault: null,
    restConfig: {
      baseUrl: configProvider.getRestDefaults().baseUrl,
      vault: 'Time fixture',
      apiKey: 'fixture'
    }
  });
  const isVault = scenario === 'default-midnight-vault';
  const files = new Map<string, string>();
  const downloads = new Map<number, string>();
  const attempts: string[] = [];
  let refuse = true;
  downloadMock.mockImplementation(async (options) => {
    attempts.push(options.filename);
    if (refuse && options.filename.endsWith('/b.jpg')) throw new Error('second write refused');
    files.set(options.filename, options.blob ? await options.blob.text() : (options.content ?? ''));
    const id = downloads.size + 1;
    downloads.set(id, options.filename);
    return { state: 'complete', id, filename: `/downloads/${options.filename}` };
  });
  writeAttachmentMock.mockImplementation((name: string) => {
    attempts.push(name);
    if (refuse && name.endsWith('/b.jpg')) return Promise.reject(new Error('second write refused'));
    files.set(name, name.endsWith('/a.jpg') ? 'aaa' : 'bbb');
    return Promise.resolve();
  });
  writeMarkdownMock.mockImplementation((name: string, markdown: string) => {
    attempts.push(name);
    files.set(name, markdown);
    return Promise.resolve();
  });
  inspectDownloadMock.mockImplementation((id) =>
    Promise.resolve({
      state: 'complete',
      filename: '/downloads/' + downloads.get(Number(id)),
      exists: true
    })
  );
  const payload: ClipPayload = createPayload({
    type: 'video',
    title: 'Temporal audit',
    markdown: '![a](aiob-attachment:a)\n![b](aiob-attachment:b)',
    meta: {
      operationId: 'op_timeaudit1',
      exportStartedAt: start.getTime(),
      exportDestination: isVault ? { kind: 'vault' } : { kind: 'downloads' },
      attachments: ['a', 'b'].map((id) => ({
        id,
        fileName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: id === 'a' ? 'YWFh' : 'YmJi', byteLength: 3 }
      }))
    }
  });
  const { processClipPayload, clipProcessingFailureResult } =
    await import('../../../src/background/application/clipProcessor');
  const first = await processClipPayload(payload).then(() => {
    throw new Error('Expected partial write');
  }, clipProcessingFailureResult);
  expect(first.outcome).toBe('unknown');
  expect(first.attachmentProgress?.confirmed).toHaveLength(1);
  expect(attempts).toHaveLength(2);
  const firstPath = attempts[0];
  expect(firstPath).toBeTruthy();
  refuse = false;
  vi.setSystemTime(start.getTime() + 2000);
  if (scenario === 'changed-content') payload.markdown += '\nNew content';
  if (scenario === 'changed-template')
    getOptionsMock.mockResolvedValue({
      templates: { ...templateOptions, video: 'Other/changed.md' },
      domainMappings: {},
      rest: {}
    });
  if (scenario === 'changed-target' && payload.meta)
    payload.meta.exportDestination = { kind: 'vault' };
  const continuation = processClipPayload({
    ...payload,
    meta: { ...payload.meta, attachmentProgress: first.attachmentProgress }
  });
  if (scenario.startsWith('changed-')) {
    const failure = await continuation.then(() => {
      throw new Error('Unexpected continuation');
    }, clipProcessingFailureResult);
    expect(failure).toMatchObject({ outcome: 'unknown', attachmentProgress: { blocked: true } });
    expect(failure.attachmentProgress?.confirmed).toHaveLength(1);
    expect(attempts).toHaveLength(2);
    expect(files.size).toBe(1);
    return;
  }
  const result = await continuation;
  expect(result.destination).toBe(isVault ? 'vault' : 'downloads');
  expect(attempts).toHaveLength(4);
  expect(attempts.filter((path) => path === firstPath)).toHaveLength(1);
  expect(attempts[2]).toBe(attempts[1]);
  expect(files.size).toBe(3);
  const notePath = attempts[3];
  if (!notePath) throw new Error('Final note path missing');
  expect(notePath).not.toContain('2026-10-16');
  if (scenario === 'seconds-template') expect(notePath).toBe('2026-10-15_235959_temporal-audit.md');
  const markdown = files.get(notePath);
  const references = [...(markdown ?? '').matchAll(/!\[[ab]\]\(([^)]+)\)/gu)].map(
    (match) => match[1]
  );
  expect(references).toHaveLength(2);
  const directory = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/') + 1) : '';
  expect(references.map((reference) => files.get(directory + reference))).toEqual(['aaa', 'bbb']);
});
