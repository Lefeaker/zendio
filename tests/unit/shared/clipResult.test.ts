import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitClipSaveResult,
  createClipSaveFailure,
  readClipSaveResult
} from '../../../src/shared/types/clipResult';

describe('clip result boundary', () => {
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
