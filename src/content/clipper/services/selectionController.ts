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
import {
  resolveVideoDestinationBootstrap,
  type VideoSessionAdapter
} from '../../video/application/videoSessionPort';

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

function captureSelection(selection: Selection): {
  selectedText: string;
  selectedHtml: string;
  savedRange: Range;
} {
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
  return { selectedText, selectedHtml: container.innerHTML, savedRange };
}

export function createSelectionController(deps: SelectionClipDependencies): SelectionController {
  async function handleSelectionClip(
    doc: Document,
    url: string,
    selection: Selection,
    promptLifecycle?: SelectionPromptLifecycleHandlers
  ): Promise<SelectionClipResult | null> {
    const { selectedText, selectedHtml, savedRange } = captureSelection(selection);

    const existingSession = getReaderSession<ReaderSessionAdapter>();
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
      const destinationBootstrap = resolveVideoDestinationBootstrap(
        promptResult.destination,
        promptResult.destinationSelectionIsExplicit
      );
      const videoSession = deps.createVideoSession(doc);
      await videoSession.start({ destinationBootstrap });
      videoSession.ingestTextCapture(selectedHtml, selectedText, comment, savedRange);
      selection.removeAllRanges();
      return null;
    }

    if (action === 'reader') {
      const highlight: ReaderBootstrapHighlight = {
        range: savedRange,
        selectedHtml,
        selectedText,
        comment
      };
      if (existingSession) {
        existingSession.ingestExternalHighlight(savedRange, selectedHtml, selectedText, comment);
      } else if (hasReaderSession) {
        doc.dispatchEvent(new CustomEvent(ADD_HIGHLIGHT_EVENT, { detail: highlight }));
      } else {
        const session = deps.createReaderSession(doc, url);
        const destination =
          promptResult.destinationSelectionIsExplicit === false
            ? undefined
            : promptResult.destination;
        await session.start({
          ...highlight,
          ...(destination ? { destination } : {})
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
    const { selectedText, selectedHtml, savedRange } = captureSelection(selection);

    let session = getVideoSession<VideoSessionAdapter>();
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

      let session = getVideoSession<VideoSessionAdapter>();
      if (!session) {
        session = deps.createVideoSession(doc);
        await session.start();
      }

      session.ingestTextCapture(selectedHtml, normalizedText, comment);
    }
  };
}
