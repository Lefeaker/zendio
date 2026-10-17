import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClipPayloadSchema } from '@shared/schemas/clip.schema';
import type { ClipAttachment, ClipPayload } from '@shared/types';
import type { ClipAttachmentProgress } from '@shared/types/clipResult';
import {
  classifyClipMock,
  createWriteSessionMock,
  downloadMock,
  getOptionsMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  selectVaultMock,
  templateOptions,
  writeAttachmentMock,
  writeMarkdownMock
} from './clipTestHarness';

const first: ClipAttachment = {
  id: 'a',
  fileName: 'a.jpg',
  mimeType: 'image/jpeg',
  content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
};
const mismatched: ClipAttachment = {
  ...first,
  id: 'b',
  content: { encoding: 'base64', data: 'Yg==', byteLength: 2 }
};
const malformed: ClipAttachment[] = [
  mismatched,
  { ...first, id: 'b', content: { encoding: 'base64', data: '!!!!', byteLength: 3 } },
  { id: 'b', fileName: 'b.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,!!!!' },
  { ...first, id: 'a' }
];

beforeEach(() => {
  resetClipProcessorHarnessMocks();
  getOptionsMock.mockResolvedValue({ templates: templateOptions, domainMappings: {}, rest: {} });
  resolvePathMock.mockReturnValue('Videos/note.md');
  selectVaultMock.mockReturnValue({
    vault: null,
    restConfig: { baseUrl: 'https://review.invalid', vault: 'Review', apiKey: 'synthetic' }
  });
  classifyClipMock.mockResolvedValue({ type: 'video', topics: [], tags: [], status: 'success' });
});
afterEach(restoreClipProcessorHarnessMocks);

function payloadWith(
  attachments: ClipAttachment[],
  destination: 'vault' | 'downloads'
): ClipPayload {
  return {
    markdown: '![A](aiob-attachment:a)\n![B](aiob-attachment:b)',
    type: 'video',
    meta: {
      operationId: 'op_preflight01',
      attachments,
      exportDestination: { kind: destination }
    }
  };
}

describe.each<'vault' | 'downloads'>(['vault', 'downloads'])(
  'attachment preflight for %s',
  (destination) => {
    it.each(malformed)(
      'rejects malformed second attachment before any write: %j',
      async (second) => {
        const payload = payloadWith([first, second], destination);
        if (second.id === first.id) payload.markdown = '![A](aiob-attachment:a)';
        const { processClipPayload, clipProcessingFailureResult } =
          await import('../../../src/background/application/clipProcessor');
        const failure = await processClipPayload(payload).then(() => {
          throw new Error('Unexpected success');
        }, clipProcessingFailureResult);
        expect(failure).toMatchObject({ outcome: 'failed', stage: 'prepare' });
        expect(createWriteSessionMock).not.toHaveBeenCalled();
        expect(writeAttachmentMock).not.toHaveBeenCalled();
        expect(writeMarkdownMock).not.toHaveBeenCalled();
        expect(downloadMock).not.toHaveBeenCalled();
      }
    );

    it('rejects missing referenced bytes even with an empty attachment list', async () => {
      const payload = payloadWith([], destination);
      const { processClipPayload } =
        await import('../../../src/background/application/clipProcessor');
      await expect(processClipPayload(payload)).rejects.toThrow();
      expect(createWriteSessionMock).not.toHaveBeenCalled();
      expect(downloadMock).not.toHaveBeenCalled();
    });
  }
);

it('preserves previous confirmations when a continuation fails preflight', async () => {
  const previous: ClipAttachmentProgress = {
    operationId: 'op_preflight01',
    planId: 'a'.repeat(64),
    storageTarget: 'rest-api',
    total: 2,
    phase: 'attachments',
    confirmed: [{ id: 'a', outputPath: 'Videos/assets/note/a.jpg' }]
  };
  const payload = payloadWith([first, mismatched], 'vault');
  payload.meta = { ...payload.meta, attachmentProgress: previous };
  const { processClipPayload, clipProcessingFailureResult } =
    await import('../../../src/background/application/clipProcessor');
  const failure = await processClipPayload(payload).then(() => {
    throw new Error('Unexpected success');
  }, clipProcessingFailureResult);
  expect(failure).toMatchObject({
    outcome: 'unknown',
    stage: 'prepare',
    attachmentProgress: previous
  });
  expect(previous.confirmed).toEqual([{ id: 'a', outputPath: 'Videos/assets/note/a.jpg' }]);
  expect(createWriteSessionMock).not.toHaveBeenCalled();
  expect(writeAttachmentMock).not.toHaveBeenCalled();
});

it.each(malformed)('rejects corrupt attachments at the message boundary: %j', (second) => {
  const payload = payloadWith([first, second], 'vault');
  if (second.id === first.id) payload.markdown = '![A](aiob-attachment:a)';
  expect(ClipPayloadSchema.safeParse(payload).success).toBe(false);
});
