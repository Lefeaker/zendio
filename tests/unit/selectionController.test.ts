/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const extractSelectionClipMock = vi.fn();
let dialogShowMock: ReturnType<typeof vi.fn>;

const storageGetMock = vi.fn();
const storageSyncMock = {
  get: storageGetMock
};

vi.mock('../../src/content/extractors/selectionExtractor', () => ({
  extractSelectionClip: extractSelectionClipMock
}));

vi.mock('../../src/content/clipper/components/dialog', () => ({
  ClipperDialog: vi.fn().mockImplementation(() => ({
    show: (selectedText: string) => dialogShowMock(selectedText)
  }))
}));

describe('content selectionController service', () => {
  beforeEach(() => {
    dialogShowMock = vi.fn();
    extractSelectionClipMock.mockReset();
    storageGetMock.mockReset();
    storageGetMock.mockResolvedValue({ options: {} });

    globalThis.chrome = {
      storage: {
        sync: storageSyncMock as unknown as typeof chrome.storage.sync
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
    storageGetMock.mockReset();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'chrome');
    document.body.innerHTML = '';
  });

  function createSelection(text: string) {
    document.body.innerHTML = `<p id="target">${text}</p>`;
    const target = document.getElementById('target');
    if (!target) throw new Error('missing target');

    const range = document.createRange();
    range.selectNodeContents(target);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection;
  }

  it('returns null when dialog is cancelled', async () => {
    dialogShowMock.mockResolvedValue({ confirmed: false, comment: '' });
    const selection = createSelection('Selected text');

    const module = await import('../../src/content/clipper/services/selectionController');
    const result = await module.handleSelectionClip(document, 'https://example.com', selection!);

    expect(result).toBeNull();
    expect(extractSelectionClipMock).not.toHaveBeenCalled();
  });

  it('extracts selection clip with merged configuration when confirmed', async () => {
    dialogShowMock.mockResolvedValue({ confirmed: true, comment: 'note' });
    const selection = createSelection('Selected text');

    extractSelectionClipMock.mockResolvedValue({ type: 'clipper', markdown: '# note' });

    storageGetMock.mockResolvedValue({
      options: {
        fragmentClipper: {
          useFootnoteFormat: false,
          captureContext: true,
          contextLength: 50,
          contextMode: 'sentences'
        }
      }
    });

    const module = await import('../../src/content/clipper/services/selectionController');
    const result = await module.handleSelectionClip(document, 'https://example.com', selection!);

    expect(result).toEqual({ type: 'clipper', markdown: '# note' });
    expect(extractSelectionClipMock).toHaveBeenCalledTimes(1);
    const args = extractSelectionClipMock.mock.calls[0][0];
    expect(args.userComment).toBe('note');
    expect(args.config).toEqual({
      useFootnoteFormat: false,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars'
    });
  });

  it('throws when selection is empty', async () => {
    dialogShowMock.mockResolvedValue({ confirmed: true, comment: '' });
    const selection = createSelection('   ');

    const module = await import('../../src/content/clipper/services/selectionController');
    await expect(module.handleSelectionClip(document, 'https://example.com', selection!)).rejects.toThrow('Selected text is empty');
  });

  it('throws when there are no selection ranges', async () => {
    dialogShowMock.mockResolvedValue({ confirmed: true, comment: '' });
    const selection = window.getSelection();
    selection?.removeAllRanges();

    const module = await import('../../src/content/clipper/services/selectionController');
    await expect(module.handleSelectionClip(document, 'https://example.com', selection!)).rejects.toThrow('No text selected');
  });
});
