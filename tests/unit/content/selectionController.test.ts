/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selection as mkSelection } from '../../utils/typeHelpers';
import { testPlatformHarness } from '../../setup/globalSetup';
import type { TestPlatformHarness } from '../../utils/platformTestHarness';
import type {
  ClipPromptRequest,
  ClipPromptResponse
} from '@content/clipper/application/clipPromptGateway';
import * as selectionExtractor from '@content/extractors/selectionExtractor';
import type { SelectionClipResult } from '@content/extractors/selectionExtractor';
import {
  __resetContentSessionRegistryForTests,
  registerReaderSession,
  registerVideoSession
} from '@content/runtime/contentSessionRegistry';

const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => null));
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn(async () => ({
    exportFragmentCommentHeading: 'Catalog Comment Heading'
  }))
);

vi.mock('@content/i18n/context', () => ({
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const extractSelectionClipMock = vi.spyOn(selectionExtractor, 'extractSelectionClip');
let promptMock: ReturnType<
  typeof vi.fn<(...args: [ClipPromptRequest]) => Promise<ClipPromptResponse>>
>;
const platformHarness: TestPlatformHarness = testPlatformHarness;

describe('content selectionController service', () => {
  beforeEach(async () => {
    promptMock = vi.fn<(...args: [ClipPromptRequest]) => Promise<ClipPromptResponse>>();
    extractSelectionClipMock.mockReset();
    getContentI18nResourceMock.mockReset();
    getContentI18nResourceMock.mockReturnValue(null);
    getContentMessagesMock.mockReset();
    getContentMessagesMock.mockResolvedValue({
      exportFragmentCommentHeading: 'Catalog Comment Heading'
    });
    await platformHarness.storage.sync.clear();
    await platformHarness.storage.sync.set('options', {});
    __resetContentSessionRegistryForTests(document);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    __resetContentSessionRegistryForTests(document);
  });

  function createSelection(text: string, html = `<p>${text}</p>`): Selection {
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;
    const range = document.createRange();
    const textNode = document.createTextNode(text);
    fragment.appendChild(textNode);
    range.setStart(textNode, 0);
    range.setEnd(textNode, text.length);

    const selection = mkSelection({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: fragment.firstChild,
      focusNode: fragment.firstChild,
      anchorOffset: 0,
      focusOffset: text.length,
      toString: () => text,
      getRangeAt: () => range,
      removeAllRanges: vi.fn()
    });

    return selection;
  }

  async function createController() {
    const module = await import('@content/clipper/services/selectionController');
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
      optionsRepository: {
        get: vi.fn().mockResolvedValue({
          fragmentClipper: {
            useFootnoteFormat: false,
            captureContext: true,
            contextLength: 200,
            contextMode: 'chars',
            selectionModifierEnabled: false,
            selectionModifierKeys: []
          }
        }),
        set: vi.fn(),
        onChange: vi.fn().mockReturnValue(() => {})
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
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection);

    expect(result).toBeNull();
    expect(extractSelectionClipMock).not.toHaveBeenCalled();
  });

  it('extracts selection clip with merged configuration when confirmed', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: 'note' });
    const selection = createSelection('Selected text');

    const clipResult: SelectionClipResult = {
      type: 'clipper',
      title: 'note',
      pageTitle: 'note',
      markdown: '# note',
      meta: {
        url: 'https://example.com/',
        fragmentUrl: 'https://example.com/#:~:text=Selected%20text',
        domain: 'example.com',
        clippedAtISO: '1970-01-01T00:00:00.000Z',
        hasComment: true,
        selectedTextPreview: 'Selected text',
        sourceUrl: 'https://example.com',
        resolvedUrl: 'https://example.com/'
      }
    };
    extractSelectionClipMock.mockResolvedValue(clipResult);

    await testPlatformHarness.storage.sync.set('options', {
      fragmentClipper: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: 50,
        contextMode: 'sentences'
      }
    });

    const { controller } = await createController();
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection);

    expect(result).toEqual(clipResult);
    expect(extractSelectionClipMock).toHaveBeenCalledTimes(1);
    const args = extractSelectionClipMock.mock.calls[0][0];
    expect(args.userComment).toBe('note');
    expect(args.config).toEqual({
      useFootnoteFormat: false,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: ['shift'],
      keyboardShortcutsEnabled: true
    });
    expect(args.commentHeading).toBe('Catalog Comment Heading');
  });

  it('passes the selected export destination into confirmed selection clips', async () => {
    promptMock.mockResolvedValue({
      action: 'clip',
      comment: '',
      destination: { kind: 'downloads' }
    });
    const selection = createSelection('Selected text');
    const clipResult: SelectionClipResult = {
      type: 'clipper',
      title: 'note',
      pageTitle: 'note',
      markdown: '# note',
      meta: {
        url: 'https://example.com/',
        fragmentUrl: 'https://example.com/#:~:text=Selected%20text',
        domain: 'example.com',
        clippedAtISO: '1970-01-01T00:00:00.000Z',
        hasComment: false,
        selectedTextPreview: 'Selected text',
        sourceUrl: 'https://example.com',
        resolvedUrl: 'https://example.com/'
      }
    };
    extractSelectionClipMock.mockResolvedValue(clipResult);

    const { controller } = await createController();
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection);

    expect(result?.meta).toMatchObject({
      exportDestination: { kind: 'downloads' }
    });
  });

  it('throws when selection is empty', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    const selection = createSelection('   ');

    const { controller } = await createController();
    await expect(
      controller.handleSelectionClip(document, 'https://example.com', selection)
    ).rejects.toThrow('Selected text is empty');
  });

  it('throws when there are no selection ranges', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    const selection = mkSelection({
      rangeCount: 0,
      isCollapsed: true,
      toString: () => '',
      removeAllRanges: vi.fn(),
      getRangeAt: () => {
        throw new Error('no range');
      }
    });

    const { controller } = await createController();
    await expect(
      controller.handleSelectionClip(document, 'https://example.com', selection)
    ).rejects.toThrow('No text selected');
  });

  it('fails when the localized fragment comment heading is unavailable', async () => {
    promptMock.mockResolvedValue({ action: 'clip', comment: 'note' });
    getContentMessagesMock.mockResolvedValueOnce({
      exportFragmentCommentHeading: '   '
    });
    const selection = createSelection('Selected text');

    const { controller } = await createController();
    await expect(
      controller.handleSelectionClip(document, 'https://example.com', selection)
    ).rejects.toThrow('Missing fragment comment heading');
    expect(extractSelectionClipMock).not.toHaveBeenCalled();
  });

  it('reuses registered reader session without falling back to window globals', async () => {
    promptMock.mockResolvedValue({ action: 'reader', comment: 'note' });
    const selection = createSelection('Selected text');
    const existingSession = {
      ingestExternalHighlight: vi.fn(),
      start: vi.fn()
    };
    registerReaderSession(existingSession, document);

    const { controller, readerSessionFactory } = await createController();
    const result = await controller.handleSelectionClip(document, 'https://example.com', selection);

    expect(result).toBeNull();
    expect(existingSession.ingestExternalHighlight).toHaveBeenCalledTimes(1);
    expect(readerSessionFactory).not.toHaveBeenCalled();
  });

  it('passes the selected export destination into a new reader session', async () => {
    promptMock.mockResolvedValue({
      action: 'reader',
      comment: 'note',
      destination: { kind: 'vault', vaultId: 'research' }
    });
    const selection = createSelection('Selected text');

    const { controller, readerSessionFactory } = await createController();
    await controller.handleSelectionClip(document, 'https://example.com', selection);

    const readerSession = readerSessionFactory.mock.results[0]?.value;
    expect(readerSession.start).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: 'note',
        destination: { kind: 'vault', vaultId: 'research' }
      })
    );
  });

  it('reuses registered video session for selection clip', async () => {
    const selection = createSelection('Selected text');
    const existingSession = {
      start: vi.fn(),
      ingestTextCapture: vi.fn()
    };
    registerVideoSession(existingSession, document);

    const { controller, videoSessionFactory } = await createController();
    await controller.handleVideoSelectionClip(document, 'https://example.com/watch?v=1', selection);

    expect(existingSession.ingestTextCapture).toHaveBeenCalledTimes(1);
    expect(videoSessionFactory).not.toHaveBeenCalled();
  });
});
