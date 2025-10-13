/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const extractSelectionClipMock = vi.fn();
let promptMock: ReturnType<typeof vi.fn>;

const storageGetMock = vi.fn();
const storageSyncMock = {
  get: storageGetMock
};
const storageAddListenerMock = vi.fn();
const storageRemoveListenerMock = vi.fn();
const storageOnChangedMock = {
  addListener: storageAddListenerMock,
  removeListener: storageRemoveListenerMock
};

vi.mock('../../src/content/extractors/selectionExtractor', () => ({
  extractSelectionClip: extractSelectionClipMock
}));

describe('content selectionController service', () => {
  beforeEach(() => {
    promptMock = vi.fn();
    extractSelectionClipMock.mockReset();
    storageGetMock.mockReset();
    storageGetMock.mockResolvedValue({ options: {} });

    globalThis.chrome = {
      storage: {
        sync: storageSyncMock as unknown as typeof chrome.storage.sync,
        onChanged: storageOnChangedMock as unknown as typeof chrome.storage.onChanged
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

  async function createController() {
    const module = await import('../../src/content/clipper/services/selectionController');
    const readerSessionFactory = vi.fn().mockReturnValue({
      ingestExternalHighlight: vi.fn(),
      start: vi.fn()
    });
    const videoSessionFactory = vi.fn().mockReturnValue({
      start: vi.fn(),
      ingestTextCapture: vi.fn()
    });
    const controller = module.createSelectionController({
      prompt: {
        requestSelectionAction: promptMock
      },
      createReaderSession: readerSessionFactory,
      createVideoSession: videoSessionFactory
    });
    return { controller, readerSessionFactory, videoSessionFactory };
  }

  it('returns null when dialog is cancelled', async () => {
    promptMock.mockResolvedValue({ action: 'cancel', comment: '' });
    const selection = createSelection('Selected text');

    const { controller } = await createController();
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection!);

    expect(result).toBeNull();
    expect(extractSelectionClipMock).not.toHaveBeenCalled();
  });

  it('extracts selection clip with merged configuration when confirmed', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: 'note' });
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

    const { controller } = await createController();
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection!);

    expect(result).toEqual({ type: 'clipper', markdown: '# note' });
    expect(extractSelectionClipMock).toHaveBeenCalledTimes(1);
    const args = extractSelectionClipMock.mock.calls[0][0];
    expect(args.userComment).toBe('note');
    expect(args.config).toEqual({
      useFootnoteFormat: false,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    });
  });

  it('throws when selection is empty', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    const selection = createSelection('   ');

    const { controller } = await createController();
    await expect(controller.handleSelectionClip(document, 'https://example.com', selection!)).rejects.toThrow('Selected text is empty');
  });

  it('throws when there are no selection ranges', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    const selection = window.getSelection();
    selection?.removeAllRanges();

    const { controller } = await createController();
    await expect(controller.handleSelectionClip(document, 'https://example.com', selection!)).rejects.toThrow('No text selected');
  });
});
