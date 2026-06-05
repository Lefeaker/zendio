import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { createReaderHighlightId, type ReaderSessionState } from './sessionState';
import type { ReaderSelectionPayload } from './services/selectionController';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderPanelCoordinator } from './panelCoordinator';
import type { ReaderSessionDependencies } from './sessionTypes';
import type { ReaderSessionLifecycle } from './sessionLifecycle';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import {
  createTrackUsageEventMessage,
  type TrackUsageEventPayload,
  type UsageEventParamMap
} from '@shared/types/analytics';
import { bucketCount } from '@shared/analytics/featureTimer';
import { isNodeInsideReaderUi } from './sessionDom';
import { clearReaderSession } from '../runtime/contentSessionRegistry';
import { clearHighlightThemeState } from '../shared/highlightThemeState';

interface ReaderSessionOperationContext {
  session: object;
  doc: Document;
  url: string;
  clipPrompt?: ClipPromptGateway;
  state: ReaderSessionState;
  highlightManager: ReaderHighlightManager;
  panelCoordinator: ReaderPanelCoordinator;
  lifecycle: ReaderSessionLifecycle;
  dependencies: ReaderSessionDependencies;
  getExportDestinationMetadata?: () => ExportDestinationMetadata | undefined;
}

type ReaderUsageEventName = Extract<
  keyof UsageEventParamMap,
  | 'reader_session_started'
  | 'reader_highlight_added'
  | 'reader_exported'
  | 'reader_export_failed'
  | 'reader_session_cancelled'
>;

export function handleReaderSessionSelection(
  context: ReaderSessionOperationContext,
  payload: ReaderSelectionPayload
): void {
  context.state.handlingSelection = true;

  try {
    addReaderHighlightFromRange(
      context,
      payload.range,
      payload.selectedHtml,
      payload.selectedText,
      ''
    );
    context.doc.defaultView?.getSelection()?.removeAllRanges();
  } catch (error) {
    console.error('[ReaderSession] Failed to capture selection:', error);
    context.panelCoordinator.applyHint('selectionFailure', context.state.highlights.length);
  } finally {
    context.state.handlingSelection = false;
  }
}

export async function handleReaderSessionMouseUp(
  context: ReaderSessionOperationContext,
  event: MouseEvent
): Promise<void> {
  if (context.state.handlingSelection || context.state.exporting || event.button !== 0) {
    return;
  }

  const selection = context.doc.defaultView?.getSelection() ?? window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  if (
    isNodeInsideReaderUi(
      selection.anchorNode,
      context.panelCoordinator.getElement(),
      context.doc
    ) ||
    isNodeInsideReaderUi(selection.focusNode, context.panelCoordinator.getElement(), context.doc)
  ) {
    selection.removeAllRanges();
    return;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    selection.removeAllRanges();
    return;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const container = context.doc.createElement('div');
  container.appendChild(range.cloneContents());

  handleReaderSessionSelection(context, {
    range,
    selectedHtml: container.innerHTML,
    selectedText,
    event
  });
}

export function addReaderHighlightFromRange(
  context: ReaderSessionOperationContext,
  range: Range,
  selectedHtml: string,
  selectedText: string,
  comment: string
): void {
  const id = createReaderHighlightId();
  const fragmentUrl = generateTextFragmentUrl(context.url, selectedText);
  const highlight =
    context.highlightManager.createHighlight({
      id,
      range,
      selectedHtml,
      selectedText,
      comment,
      fragmentUrl
    }) ??
    createDetachedReaderHighlight(
      context.doc,
      id,
      selectedHtml,
      selectedText,
      comment,
      fragmentUrl
    );
  context.state.highlights.push(highlight);
  syncReaderHighlightsUi(context);
  context.panelCoordinator.applyHint('panel', context.state.highlights.length);
  void trackReaderUsageEvent(context, 'reader_highlight_added', {
    selection_length_bucket: bucketCount(selectedText.length),
    highlight_count_bucket: bucketCount(context.state.highlights.length)
  });
}

export function ingestExternalReaderHighlight(
  context: ReaderSessionOperationContext,
  payload: { range: Range; selectedHtml: string; selectedText: string; comment: string }
): void {
  addReaderHighlightFromRange(
    context,
    payload.range,
    payload.selectedHtml,
    payload.selectedText,
    payload.comment
  );
  context.doc.defaultView?.getSelection()?.removeAllRanges();
}

export async function finishReaderSession(
  context: ReaderSessionOperationContext,
  loadReadingConfig: () => Promise<
    ReturnType<typeof import('./sessionState').resolveReadingConfig>
  >,
  applyReadingConfig: (
    config: ReturnType<typeof import('./sessionState').resolveReadingConfig>
  ) => void
): Promise<void> {
  if (context.state.exporting) {
    return;
  }

  if (!context.state.highlights.length) {
    context.panelCoordinator.applyHint('noHighlights', 0);
    return;
  }

  context.state.exporting = true;
  context.panelCoordinator.applyHint('exporting', context.state.highlights.length);
  context.dependencies.showSupportProgress?.({
    value: 10,
    label: '正在准备阅读导出'
  });

  try {
    applyReadingConfig(await loadReadingConfig());
    context.dependencies.showSupportProgress?.({
      value: 24,
      label: '正在整理阅读标注'
    });
    const highlights = context.dependencies.exporter.prepareHighlights(
      context.state.highlights,
      context.highlightManager
    );
    const pageTitle = context.doc.title || new URL(context.url).hostname;
    const documentClone =
      context.state.readingConfig.exportMode === 'full'
        ? (context.doc.cloneNode(true) as Document)
        : undefined;

    if (documentClone) {
      context.dependencies.exporter.applyTokens(documentClone, highlights);
    }

    context.dependencies.showSupportProgress?.({
      value: 32,
      label: '正在生成阅读笔记'
    });
    const payload = await context.dependencies.exporter.buildMarkdown({
      mode: context.state.readingConfig.exportMode,
      pageTitle,
      pageUrl: context.url,
      highlights,
      ...(documentClone !== undefined && { documentClone })
    });
    const exportDestination = context.getExportDestinationMetadata?.();
    if (exportDestination) {
      payload.meta = {
        ...payload.meta,
        exportDestination
      };
    }

    context.dependencies.showSupportProgress?.({
      value: 36,
      label: '正在发送到 Obsidian'
    });
    await context.dependencies.dispatchClipResult(payload);
    void trackReaderUsageEvent(context, 'reader_exported', {
      destination: resolveReaderExportDestination(exportDestination),
      duration_bucket: context.state.analyticsTimer?.durationBucket() ?? 'under_100ms'
    });
    cleanupReaderSession(context);
  } catch (error) {
    console.error('[ReaderSession] Export failed:', error);
    void trackReaderUsageEvent(context, 'reader_export_failed', {
      destination: resolveReaderExportDestination(context.getExportDestinationMetadata?.()),
      failure_category: 'unknown'
    });
    context.dependencies.showSupportProgress?.({
      value: 100,
      label: '发送失败',
      variant: 'failure'
    });
    context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    context.state.exporting = false;
  }
}

export function cancelReaderSession(context: ReaderSessionOperationContext): void {
  if (context.state.exporting) {
    return;
  }
  void trackReaderUsageEvent(context, 'reader_session_cancelled', {
    duration_bucket: context.state.analyticsTimer?.durationBucket() ?? 'under_100ms'
  });
  cleanupReaderSession(context);
}

export function cleanupReaderSession(context: ReaderSessionOperationContext): void {
  context.lifecycle.cleanup();
  context.state.stopReadingConfigWatcher?.();
  context.state.stopReadingConfigWatcher = null;

  for (const highlight of context.state.highlights) {
    context.highlightManager.unwrapHighlight(highlight);
  }
  context.state.highlights = [];

  clearReaderSession(context.session, context.doc);
  context.state.exporting = false;
  context.state.handlingSelection = false;
  context.state.analyticsTimer = null;
  context.state.analyticsSource = 'unknown';
  clearHighlightThemeState(context.doc);

  if (context.state.highlightFocusTimeout !== null) {
    context.doc.defaultView?.clearTimeout(context.state.highlightFocusTimeout);
    context.state.highlightFocusTimeout = null;
  }

  context.doc.defaultView?.getSelection()?.removeAllRanges();
}

export function focusReaderHighlight(context: ReaderSessionOperationContext, id: string): void {
  const highlight = findReaderHighlight(context.state.highlights, id);
  if (!highlight) {
    return;
  }

  context.state.highlightFocusTimeout = context.highlightManager.focusHighlight(
    highlight,
    context.state.highlightFocusTimeout,
    context.doc.defaultView ?? window
  );
}

export function removeReaderHighlight(context: ReaderSessionOperationContext, id: string): void {
  if (context.state.exporting) {
    return;
  }

  const index = context.state.highlights.findIndex((highlight) => highlight.id === id);
  if (index === -1) {
    return;
  }

  const [removed] = context.state.highlights.splice(index, 1);
  context.highlightManager.unwrapHighlight(removed);
  syncReaderHighlightsUi(context);
  context.panelCoordinator.applyHint(
    context.state.highlights.length ? 'panel' : 'noHighlights',
    context.state.highlights.length
  );
}

export function submitReaderHighlightEdit(
  context: ReaderSessionOperationContext,
  id: string,
  nextComment: string
): void {
  if (context.state.exporting) {
    return;
  }

  const highlight = findReaderHighlight(context.state.highlights, id);
  if (!highlight) {
    context.panelCoordinator.stopEditing();
    return;
  }

  context.highlightManager.updateComment(highlight, nextComment);
  syncReaderHighlightsUi(context);
  context.panelCoordinator.applyHint('panel', context.state.highlights.length);
  context.panelCoordinator.stopEditing();
}

function syncReaderHighlightsUi(context: ReaderSessionOperationContext): void {
  context.highlightManager.sortByDocumentOrder(context.state.highlights);
  context.panelCoordinator.updateHighlights(context.state.highlights);
}

function createDetachedReaderHighlight(
  doc: Document,
  id: string,
  selectedHtml: string,
  selectedText: string,
  comment: string,
  fragmentUrl: string
): ReaderHighlightRecord {
  const wrapper = doc.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = id;
  const trimmedComment = comment.trim();
  if (trimmedComment) {
    wrapper.dataset.readerComment = trimmedComment;
  }
  wrapper.textContent = selectedText;

  return {
    id,
    selectedHtml,
    selectedText,
    comment: trimmedComment,
    fragmentUrl,
    wrapper,
    wrapperSegments: [wrapper],
    createdAt: Date.now()
  };
}

function findReaderHighlight(
  highlights: ReaderHighlightRecord[],
  id: string
): ReaderHighlightRecord | undefined {
  return highlights.find((highlight) => highlight.id === id);
}

export async function trackReaderUsageEvent<EventName extends ReaderUsageEventName>(
  context: ReaderSessionOperationContext,
  event: EventName,
  params: UsageEventParamMap[EventName]
): Promise<void> {
  try {
    const payload = createTrackUsageEventMessage(event, params);
    await context.dependencies.messaging.send(payload as TrackUsageEventPayload);
  } catch (error) {
    console.debug('[ReaderSession] Failed to send analytics event:', error);
  }
}

function resolveReaderExportDestination(
  metadata: ExportDestinationMetadata | undefined
): UsageEventParamMap['reader_exported']['destination'] {
  if (metadata?.kind === 'downloads') {
    return 'downloads';
  }
  return 'unknown';
}
