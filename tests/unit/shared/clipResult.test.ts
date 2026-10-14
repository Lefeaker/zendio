import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitClipSaveResult,
  createClipSaveFailure,
  ClipAttachmentProgressSchema,
  preserveClipAttachmentProgress,
  readClipSaveResult
} from '../../../src/shared/types/clipResult';
import { SessionExportAttemptSchema } from '../../../src/shared/sessionDrafts/exportAttempt';
import { ClipMetaSchema } from '../../../src/shared/schemas/clip.schema';

describe('clip result boundary', () => {
  it.each([
    { total: 51 },
    {
      operationId: 'op_different1',
      planId: 'a'.repeat(64),
      total: 1,
      phase: 'attachments',
      storageTarget: 'downloads',
      confirmed: []
    }
  ])(
    'keeps the unknown attempt when optional progress is malformed or belongs to another intent',
    (attachmentProgress) => {
      const base = {
        operationId: 'op_progress1',
        snapshotId: 'b'.repeat(64),
        outcome: 'unknown',
        startedAt: 1
      };
      expect(SessionExportAttemptSchema.parse({ ...base, attachmentProgress })).toEqual(base);
    }
  );
  it('keeps bounded confirmation metadata across result, draft and message schemas without bytes', () => {
    const progress = {
      operationId: 'op_progress1',
      planId: 'a'.repeat(64),
      total: 2,
      phase: 'attachments' as const,
      storageTarget: 'downloads' as const,
      confirmed: [
        {
          id: 'one',
          outputPath: 'one.jpg',
          download: { id: 1, filename: '/downloads/one.jpg' },
          content: 'must not persist bytes'
        }
      ]
    };
    const safe = ClipAttachmentProgressSchema.parse(progress);
    expect(JSON.stringify(safe)).not.toContain('must not persist bytes');
    expect(
      ClipMetaSchema.parse({ operationId: 'op_progress1', attachmentProgress: safe })
        .attachmentProgress
    ).toEqual(safe);
    expect(
      SessionExportAttemptSchema.parse({
        operationId: 'op_progress1',
        snapshotId: 'b'.repeat(64),
        outcome: 'unknown',
        startedAt: 1,
        attachmentProgress: safe
      }).attachmentProgress
    ).toEqual(safe);
    const failure = createClipSaveFailure('unknown', 'write', 'attachments', safe);
    expect(readClipSaveResult(failure)).toEqual(failure);
    expect(
      preserveClipAttachmentProgress(createClipSaveFailure('failed', 'validation', 'prepare'), safe)
    ).toMatchObject({ outcome: 'unknown', attachmentProgress: safe });
    expect(ClipAttachmentProgressSchema.safeParse({ ...safe, total: 51 }).success).toBe(false);
    expect(ClipAttachmentProgressSchema.safeParse({ ...safe, total: 0 }).success).toBe(false);
  });
  afterEach(() => vi.useRealTimers());

  it.each(['permission', 'connection', 'validation', 'write'] as const)(
    'preserves %s without transporting raw exception content',
    (category) => {
      const result = readClipSaveResult({
        ...createClipSaveFailure('failed', category, 'prepare'),
        error: '/private/path secret content',
        message: { key: 'untrusted', values: { secret: 'private payload' } },
        stack: 'secret'
      });
      expect(result).toMatchObject({
        success: false,
        outcome: 'failed',
        failureCategory: category
      });
      expect(JSON.stringify(result)).not.toMatch(/private|secret|untrusted/);
    }
  );

  it.each([undefined, null, {}, { success: false }, { error: 'network failed' }])(
    'keeps an unconfirmed legacy or missing result unknown: %j',
    (value) => expect(readClipSaveResult(value)).toMatchObject({ outcome: 'unknown' })
  );

  it('accepts a legacy positive write acknowledgement', () => {
    expect(readClipSaveResult({ success: true, filePath: 'note.md' })).toEqual({
      success: true,
      outcome: 'saved',
      filePath: 'note.md'
    });
  });

  it('accepts a canonical positive write acknowledgement', () => {
    expect(readClipSaveResult({ success: true, outcome: 'saved' })).toEqual({
      success: true,
      outcome: 'saved'
    });
  });

  it.each([
    { success: true, outcome: 'failed' },
    { success: true, outcome: 'unknown' },
    { success: true, outcome: 'invalid' },
    { success: true, outcome: null },
    { success: true, filePath: 42 },
    { success: true, filePath: null },
    { success: true, filePath: undefined }
  ])('keeps a malformed positive acknowledgement unknown: %j', (value) => {
    expect(readClipSaveResult(value)).toMatchObject({ success: false, outcome: 'unknown' });
  });

  it('bounds a missing reply without issuing a second write or consuming a late success', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const send = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = awaitClipSaveResult(send);
    await vi.advanceTimersByTimeAsync(150_000);
    await expect(pending).resolves.toMatchObject({
      outcome: 'unknown',
      failureCategory: 'timeout'
    });
    resolve({ success: true, filePath: 'note.md' });
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toMatchObject({ outcome: 'unknown' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
