import {
  extractSelectionClip,
  type SelectionClipResult
} from '../../extractors/selectionExtractor';
import { getContentI18nResource, getContentMessages } from '../../i18n/context';
import type { SelectionPromptLifecycleHandlers } from '../../runtime/clipFlowTypes';
import type { ReaderBootstrapHighlight } from '../../reader/types';
import type { ClipPromptGateway } from '../application/clipPromptGateway';
import { loadFragmentConfig } from './fragmentConfig';
import { detectVideoIdentity } from '../../video/utils';
import { isValidVideoPlayPage } from '../../video/videoPromptObserver';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import {
  getReaderSession,
  getVideoSession,
  isReaderSessionActive,
  isVideoSessionActive
} from '../../runtime/contentSessionRegistry';

const ADD_HIGHLIGHT_EVENT = 'aiob-reader:add-highlight';

async function resolveFragmentCommentHeading(): Promise<string> {
  try {
    const messages = getContentI18nResource()?.messages ?? (await getContentMessages());
    const heading = messages.exportFragmentCommentHeading?.trim();
    if (!heading) {
      throw new Error('Missing fragment comment heading');
    }
    return heading;
  } catch (error) {
    console.warn('[selection-controller] Failed to resolve fragment comment heading:', error);
    throw new Error('Missing fragment comment heading');
  }
}

export interface ReaderSessionAdapter {
  ingestExternalHighlight(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void;
  start(initialHighlight?: ReaderBootstrapHighlight): Promise<void>;
}

export interface VideoSessionAdapter {
  start(): Promise<void>;
  ingestTextCapture(
    selectedHtml: string,
    selectedText: string,
    comment: string,
    selectionRange?: Range | null
  ): void;
}

export interface SelectionClipDependencies {
  prompt: ClipPromptGateway;
  optionsRepository: IOptionsRepository;
  createReaderSession(doc: Document, url: string): ReaderSessionAdapter;
  createVideoSession(doc: Document): VideoSessionAdapter;
}

export interface SelectionController {
  handleSelectionClip(
    doc: Document,
    url: string,
    selection: Selection,
    promptLifecycle?: SelectionPromptLifecycleHandlers
  ): Promise<SelectionClipResult | null>;
  handleVideoSelectionClip(doc: Document, url: string, selection: Selection): Promise<void>;
  handleVideoSelectionClipFromData(
    doc: Document,
    url: string,
    selectedHtml: string,
    selectedText: string,
    comment?: string
  ): Promise<void>;
}

export function createSelectionController(deps: SelectionClipDependencies): SelectionController {
  async function handleSelectionClip(
    doc: Document,
    url: string,
    selection: Selection,
    promptLifecycle?: SelectionPromptLifecycleHandlers
  ): Promise<SelectionClipResult | null> {
    if (!selection.rangeCount) {
      throw new Error('No text selected');
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      throw new Error('Selected text is empty');
    }

    const range = selection.getRangeAt(0);
    const savedRange = range.cloneRange();

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const selectedHtml = container.innerHTML;

    const existingSession = getReaderSession<ReaderSessionAdapter>() ?? undefined;
    const readerPanel = doc.getElementById('aiob-reader-panel');
    const hasReaderSession = Boolean(existingSession || readerPanel || isReaderSessionActive(doc));

    // 检查是否在视频页面且视频模式未激活
    const identity = detectVideoIdentity(url);
    const isVideoPage = isValidVideoPlayPage(url, identity);
    const hasVideoSession = isVideoSessionActive(doc);
    const shouldShowVideoMode = isVideoPage && !hasVideoSession;

    const promptResult = await deps.prompt.requestSelectionAction({
      selectedText,
      allowReaderMode: !shouldShowVideoMode, // 在视频页面时不显示阅读模式选项
      readerModeBehavior: hasReaderSession ? 'append' : 'start',
      allowVideoMode: shouldShowVideoMode // 新增：允许视频模式选项
    });
    const action = promptResult.action;
    const comment = promptResult.comment.trim();

    if (action === 'cancel') {
      promptLifecycle?.onPromptCancelled?.();
      selection.removeAllRanges();
      return null;
    }

    if (action === 'video') {
      // 启动视频模式并捕获选择的内容
      const videoSession = deps.createVideoSession(doc);
      await videoSession.start();
      videoSession.ingestTextCapture(selectedHtml, selectedText, comment, savedRange);
      selection.removeAllRanges();
      return null;
    }

    if (action === 'reader') {
      if (existingSession) {
        existingSession.ingestExternalHighlight(savedRange, selectedHtml, selectedText, comment);
      } else if (hasReaderSession) {
        const event = new CustomEvent(ADD_HIGHLIGHT_EVENT, {
          detail: {
            range: savedRange,
            selectedHtml,
            selectedText,
            comment
          }
        });
        doc.dispatchEvent(event);
      } else {
        const session = deps.createReaderSession(doc, url);
        await session.start({
          range: savedRange,
          selectedHtml,
          selectedText,
          comment,
          ...(promptResult.destination ? { destination: promptResult.destination } : {})
        });
      }
      selection.removeAllRanges();
      return null;
    }

    const fragmentConfig = await loadFragmentConfig(deps.optionsRepository);
    const commentHeading =
      !fragmentConfig.useFootnoteFormat && comment
        ? await resolveFragmentCommentHeading()
        : undefined;
    promptLifecycle?.onPromptSubmitted?.();

    const clip = await extractSelectionClip({
      doc,
      url,
      selectedHtml,
      selectedText,
      userComment: comment,
      ...(commentHeading !== undefined ? { commentHeading } : {}),
      config: fragmentConfig,
      selectionRange: savedRange
    });
    if (!promptResult.destination) {
      return clip;
    }
    return {
      ...clip,
      meta: {
        ...clip.meta,
        exportDestination: promptResult.destination
      }
    };
  }

  async function handleVideoSelectionClip(
    doc: Document,
    url: string,
    selection: Selection
  ): Promise<void> {
    if (!selection.rangeCount) {
      throw new Error('No text selected');
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      throw new Error('Selected text is empty');
    }

    const range = selection.getRangeAt(0);
    const savedRange = range.cloneRange();

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const selectedHtml = container.innerHTML;

    let session = getVideoSession<VideoSessionAdapter>() ?? undefined;
    if (!session) {
      session = deps.createVideoSession(doc);
      await session.start();
    }

    session.ingestTextCapture(selectedHtml, selectedText, '', savedRange);
    selection.removeAllRanges();
  }

  return {
    handleSelectionClip,
    handleVideoSelectionClip,
    handleVideoSelectionClipFromData: async (
      doc,
      url,
      selectedHtml,
      selectedText,
      comment = ''
    ) => {
      const normalizedText = selectedText.replace(/\s+/g, ' ').trim();
      if (!normalizedText) {
        throw new Error('Selected text is empty');
      }

      let session = getVideoSession<VideoSessionAdapter>() ?? undefined;
      if (!session) {
        session = deps.createVideoSession(doc);
        await session.start();
      }

      session.ingestTextCapture(selectedHtml, normalizedText, comment);
    }
  };
}
