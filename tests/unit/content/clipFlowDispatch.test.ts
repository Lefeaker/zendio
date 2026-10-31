/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendClipResult } from '@content/runtime/clipFlowDispatch';
import { createClipSaveFailure, type ClipSaveResult } from '@shared/types/clipResult';

const withinTransportBudget = vi.hoisted(() => vi.fn(() => true));
vi.mock('@shared/attachments/clipPayloadBudget', () => ({
  isClipResultWithinTransportBudget: withinTransportBudget
}));

const payload = { type: 'ai_chat', markdown: '# Conversation' };
const sourceUrl = 'https://chatgpt.com/c/image-save';

afterEach(() => vi.useRealTimers());
beforeEach(() => withinTransportBudget.mockReset().mockReturnValue(true));

describe('clip flow save acknowledgements', () => {
  it('checks the final payload including source metadata before sending any bytes', async () => {
    withinTransportBudget.mockReturnValue(false);
    const send = vi.fn();
    const completePayload = {
      ...payload,
      meta: { sourceUrl, url: sourceUrl, messageCount: 2 }
    };

    await expect(sendClipResult({ send }, completePayload, sourceUrl)).resolves.toEqual(
      createClipSaveFailure('failed', 'validation', 'prepare')
    );
    expect(withinTransportBudget).toHaveBeenCalledExactlyOnceWith(completePayload);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a definite validation rejection without claiming extraction failed', async () => {
    const failure = createClipSaveFailure('failed', 'validation', 'prepare');
    const send = vi.fn().mockResolvedValue(failure);

    await expect(sendClipResult({ send }, payload, sourceUrl)).resolves.toEqual(failure);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'CLIP_RESULT', payload });
  });

  it('retains partial attachment confirmations and an unknown save outcome', async () => {
    const failure = createClipSaveFailure('unknown', 'connection', 'attachments', {
      operationId: 'op_image123',
      planId: 'a'.repeat(64),
      storageTarget: 'rest-api',
      total: 2,
      phase: 'attachments',
      confirmed: [{ id: 'image-a', outputPath: 'AI/assets/note/image-a.png' }]
    });
    const send = vi.fn().mockResolvedValue(failure);

    await expect(sendClipResult({ send }, payload, sourceUrl)).resolves.toEqual(failure);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not turn a missing reply into success', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await expect(sendClipResult({ send }, payload, sourceUrl)).resolves.toMatchObject({
      success: false,
      outcome: 'unknown'
    });
  });

  it('keeps a lost message reply unknown and does not emit a new CLIP_ERROR', async () => {
    const send = vi.fn().mockRejectedValue(new Error('message reply lost after a possible write'));
    await expect(sendClipResult({ send }, payload, sourceUrl)).resolves.toMatchObject({
      success: false,
      outcome: 'unknown',
      failureCategory: 'connection'
    });
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'CLIP_RESULT', payload });
  });

  it('waits for the actual saved acknowledgement', async () => {
    let acknowledge: ((value: ClipSaveResult) => void) | undefined;
    const send = vi
      .fn()
      .mockImplementation(() => new Promise<ClipSaveResult>((resolve) => (acknowledge = resolve)));
    const saved: ClipSaveResult = { success: true, outcome: 'saved', filePath: 'AI/note.md' };
    let settled = false;
    const result = sendClipResult({ send }, payload, sourceUrl).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    acknowledge?.(saved);
    await expect(result).resolves.toEqual(saved);
  });

  it('uses the existing bounded unknown outcome when the channel never settles', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const result = sendClipResult({ send }, payload, sourceUrl);
    await vi.advanceTimersByTimeAsync(150_000);
    await expect(result).resolves.toMatchObject({
      success: false,
      outcome: 'unknown',
      failureCategory: 'timeout'
    });
  });

  it('still rejects missing Markdown before dispatch', async () => {
    const send = vi.fn();
    await expect(sendClipResult({ send }, { type: 'ai_chat' }, sourceUrl)).rejects.toMatchObject({
      code: 'EXTRACTION_CONTENT_NO_MARKDOWN'
    });
    expect(send).not.toHaveBeenCalled();
  });
});
