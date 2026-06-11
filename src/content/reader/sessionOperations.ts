import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { createReaderHighlightId, type ReaderSessionState } from './sessionState';
import type { ReaderSelectionPayload } from './services/selectionController';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderPanelCoordinator } from './panelCoordinator';
import type { ReaderSessionDependencies } from './sessionTypes';
import type { ReaderSessionLifecycle } from './sessionLifecycle';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import type { SessionDraftTerminalStatus } from '../sessionDrafts';
import {
  createTrackUsageEventMessage,
  type TrackUsageEventPayload,
  type UsageEventParamMap
} from '@shared/types/analytics';
import { bucketCount } from '@shared/analytics/featureTimer';
import { isNodeInsideReaderUi } from './sessionDom';
import { clearReaderSession } from '../runtime/contentSessionRegistry';
import { clearHighlightThemeState } from '../shared/highlightThemeState';
import type { SessionMutationTransaction } from '../sessionMutations';

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
  persistDraftMutation?: () => Promise<void>;
  disposeDraftPersistence?: () => Promise<void>;
  clearPersistedDraft?: () => Promise<void>;
  finalizeTerminalDraft?: (status: SessionDraftTerminalStatus) => Promise<boolean>;
  runDraftMutation?: <Result>(
    transaction: SessionMutationTransaction<Result, void>
  ) => Promise<boolean>;
}

type ReaderUsageEventName = Extract<
  keyof UsageEventParamMap,
  | 'reader_session_started'
  | 'reader_highlight_added'
  | 'reader_exported'
  | 'reader_export_failed'
  | 'reader_session_cancelled'
>;

type HighlightWrapperSnapshot = {
  wrapper: HTMLElement;
  parent: ParentNode | null;
  nextSibling: ChildNode | null;
  childNodes: ChildNode[];
};

export function handleReaderSessionSelection(
  context: ReaderSessionOperationContext,
  payload: ReaderSelectionPayload
): Promise<void> {
  if (context.state.saving) {
    return Promise.resolve();
  }

  context.state.handlingSelection = true;

  return (async () => {
    try {
      await addReaderHighlightFromRange(
        context,
        payload.range,
        payload.selectedHtml,
        payload.selectedText,
        ''
      );
    } catch (error) {
      console.error('[ReaderSession] Failed to capture selection:', error);
      context.panelCoordinator.applyHint('selectionFailure', context.state.highlights.length);
    } finally {
      context.state.handlingSelection = false;
    }
  })();
}

export async function handleReaderSessionMouseUp(
  context: ReaderSessionOperationContext,
  event: MouseEvent
): Promise<void> {
  if (
    context.state.handlingSelection ||
    context.state.exporting ||
    context.state.saving ||
    event.button !== 0
  ) {
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

  await handleReaderSessionSelection(context, {
    range,
    selectedHtml: container.innerHTML,
    selectedText,
    event
  });
}

export function applyReaderHighlightFromRange(
  context: ReaderSessionOperationContext,
  range: Range,
  selectedHtml: string,
  selectedText: string,
  comment: string
): ReaderHighlightRecord {
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
  return highlight;
}

export async function addReaderHighlightFromRange(
  context: ReaderSessionOperationContext,
  range: Range,
  selectedHtml: string,
  selectedText: string,
  comment: string,
  options: { clearSelectionOnCommit?: boolean } = {}
): Promise<boolean> {
  const clearSelectionOnCommit = options.clearSelectionOnCommit ?? true;
  if (!context.runDraftMutation || !context.persistDraftMutation) {
    applyReaderHighlightFromRange(context, range, selectedHtml, selectedText, comment);
    queueReaderDraftPersistence(context);
    if (clearSelectionOnCommit) {
      context.doc.defaultView?.getSelection()?.removeAllRanges();
    }
    void trackReaderUsageEvent(context, 'reader_highlight_added', {
      selection_length_bucket: bucketCount(selectedText.length),
      highlight_count_bucket: bucketCount(context.state.highlights.length)
    });
    return true;
  }

  return context.runDraftMutation({
    apply: () => {
      const highlight = applyReaderHighlightFromRange(
        context,
        range,
        selectedHtml,
        selectedText,
        comment
      );
      const highlightAddedParams = {
        selection_length_bucket: bucketCount(selectedText.length),
        highlight_count_bucket: bucketCount(context.state.highlights.length)
      } as const;
      return { highlight, highlightAddedParams };
    },
    save: () => context.persistDraftMutation?.() ?? Promise.resolve(),
    commit: ({ highlightAddedParams }) => {
      if (clearSelectionOnCommit) {
        context.doc.defaultView?.getSelection()?.removeAllRanges();
      }
      void trackReaderUsageEvent(context, 'reader_highlight_added', highlightAddedParams);
    },
    rollback: ({ highlight }) => {
      removeHighlightFromState(context.state.highlights, highlight.id);
      context.highlightManager.unwrapHighlight(highlight);
      syncReaderHighlightsUi(context);
      context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    },
    onSaveError: (error) => {
      console.warn('[ReaderSession] Failed to persist highlighted selection:', error);
    }
  });
}

export async function ingestExternalReaderHighlight(
  context: ReaderSessionOperationContext,
  payload: { range: Range; selectedHtml: string; selectedText: string; comment: string }
): Promise<boolean> {
  const selectionSnapshot = snapshotSelection(context.doc);

  if (!context.runDraftMutation || !context.persistDraftMutation) {
    context.doc.defaultView?.getSelection()?.removeAllRanges();
    applyReaderHighlightFromRange(
      context,
      payload.range,
      payload.selectedHtml,
      payload.selectedText,
      payload.comment
    );
    queueReaderDraftPersistence(context);
    void trackReaderUsageEvent(context, 'reader_highlight_added', {
      selection_length_bucket: bucketCount(payload.selectedText.length),
      highlight_count_bucket: bucketCount(context.state.highlights.length)
    });
    return true;
  }

  return context.runDraftMutation({
    apply: () => {
      const highlight = applyReaderHighlightFromRange(
        context,
        payload.range,
        payload.selectedHtml,
        payload.selectedText,
        payload.comment
      );
      context.doc.defaultView?.getSelection()?.removeAllRanges();
      const highlightAddedParams = {
        selection_length_bucket: bucketCount(payload.selectedText.length),
        highlight_count_bucket: bucketCount(context.state.highlights.length)
      } as const;
      return { highlight, highlightAddedParams, selectionSnapshot };
    },
    save: () => context.persistDraftMutation?.() ?? Promise.resolve(),
    commit: ({ highlightAddedParams }) => {
      void trackReaderUsageEvent(context, 'reader_highlight_added', highlightAddedParams);
    },
    rollback: ({ highlight, selectionSnapshot }) => {
      removeHighlightFromState(context.state.highlights, highlight.id);
      context.highlightManager.unwrapHighlight(highlight);
      syncReaderHighlightsUi(context);
      restoreSelection(context.doc, selectionSnapshot);
      context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    },
    onSaveError: (error) => {
      console.warn('[ReaderSession] Failed to persist external highlight:', error);
    }
  });
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
    const terminalized = (await context.finalizeTerminalDraft?.('exported')) ?? true;
    if (!terminalized) {
      context.dependencies.showSupportProgress?.({
        value: 100,
        label: '发送失败',
        variant: 'failure'
      });
      context.panelCoordinator.applyHint('failure', context.state.highlights.length);
      context.state.exporting = false;
      return;
    }
    void trackReaderUsageEvent(context, 'reader_exported', {
      destination: resolveReaderExportDestination(exportDestination),
      duration_bucket: context.state.analyticsTimer?.durationBucket() ?? 'under_100ms'
    });
    cleanupReaderSession(context);
    await context.disposeDraftPersistence?.();
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

export async function cancelReaderSession(context: ReaderSessionOperationContext): Promise<void> {
  if (context.state.exporting) {
    return;
  }
  const terminalized = (await context.finalizeTerminalDraft?.('discarded')) ?? true;
  if (!terminalized) {
    context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    return;
  }
  void trackReaderUsageEvent(context, 'reader_session_cancelled', {
    duration_bucket: context.state.analyticsTimer?.durationBucket() ?? 'under_100ms'
  });
  cleanupReaderSession(context);
  void context
    .disposeDraftPersistence?.()
    .catch((error) => {
      console.warn('[ReaderSession] Failed to dispose session draft persistence after cancel:', error);
    });
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
  context.state.saving = false;
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

export async function removeReaderHighlight(
  context: ReaderSessionOperationContext,
  id: string
): Promise<boolean> {
  if (context.state.exporting) {
    return true;
  }

  const index = context.state.highlights.findIndex((highlight) => highlight.id === id);
  if (index === -1) {
    return true;
  }

  const draftSnapshot = context.panelCoordinator.snapshotCommentDrafts()[id];

  if (!context.runDraftMutation || !context.persistDraftMutation) {
    const [removed] = context.state.highlights.splice(index, 1);
    context.highlightManager.unwrapHighlight(removed);
    syncReaderHighlightsUi(context);
    context.panelCoordinator.applyHint(
      context.state.highlights.length ? 'panel' : 'noHighlights',
      context.state.highlights.length
    );
    queueReaderDraftPersistence(context);
    return true;
  }

  return context.runDraftMutation({
    apply: () => {
      const [removed] = context.state.highlights.splice(index, 1);
      const wrapperSnapshots = snapshotHighlightWrappers(removed);
      context.highlightManager.unwrapHighlight(removed);
      syncReaderHighlightsUi(context);
      if (draftSnapshot !== undefined) {
        restoreCommentDraft(context, id, draftSnapshot);
      }
      context.panelCoordinator.applyHint(
        context.state.highlights.length ? 'panel' : 'noHighlights',
        context.state.highlights.length
      );
      return {
        removed,
        wrapperSnapshots,
        draftSnapshot
      };
    },
    save: () => context.persistDraftMutation?.() ?? Promise.resolve(),
    commit: ({ draftSnapshot }) => {
      if (draftSnapshot === undefined) {
        return;
      }
      const drafts = context.panelCoordinator.snapshotCommentDrafts();
      delete drafts[id];
      context.panelCoordinator.hydrateCommentDrafts(drafts);
    },
    rollback: ({ removed, wrapperSnapshots, draftSnapshot: nextDraftSnapshot }) => {
      restoreHighlightWrappers(wrapperSnapshots);
      context.state.highlights.splice(index, 0, removed);
      syncReaderHighlightsUi(context);
      restoreCommentDraft(context, id, nextDraftSnapshot);
      context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    },
    onSaveError: (error) => {
      console.warn('[ReaderSession] Failed to save highlight removal:', error);
    }
  });
}

export async function submitReaderHighlightEdit(
  context: ReaderSessionOperationContext,
  id: string,
  nextComment: string
): Promise<boolean> {
  if (context.state.exporting) {
    return true;
  }

  const highlight = findReaderHighlight(context.state.highlights, id);
  if (!highlight) {
    context.panelCoordinator.stopEditing();
    return true;
  }

  const draftSnapshot = context.panelCoordinator.snapshotCommentDrafts()[id];
  const previousComment = highlight.comment;
  const previousFootnoteIndex = highlight.footnoteIndex;

  if (!context.runDraftMutation || !context.persistDraftMutation) {
    context.highlightManager.updateComment(highlight, nextComment);
    syncReaderHighlightsUi(context);
    context.panelCoordinator.applyHint('panel', context.state.highlights.length);
    context.panelCoordinator.stopEditing();
    queueReaderDraftPersistence(context);
    return true;
  }

  return context.runDraftMutation({
    apply: () => {
      context.highlightManager.updateComment(highlight, nextComment);
      syncReaderHighlightsUi(context);
      context.panelCoordinator.applyHint('panel', context.state.highlights.length);
      return {
        draftSnapshot,
        previousComment,
        previousFootnoteIndex
      };
    },
    save: () => context.persistDraftMutation?.() ?? Promise.resolve(),
    commit: () => {
      context.panelCoordinator.stopEditing();
    },
    rollback: ({
      draftSnapshot: nextDraftSnapshot,
      previousComment,
      previousFootnoteIndex
    }) => {
      context.highlightManager.assignFootnote(
        highlight,
        previousComment,
        previousFootnoteIndex
      );
      syncReaderHighlightsUi(context);
      restoreCommentDraft(context, id, nextDraftSnapshot);
      context.panelCoordinator.applyHint('failure', context.state.highlights.length);
    },
    onSaveError: (error) => {
      console.warn('[ReaderSession] Failed to save highlight edit:', error);
    }
  });
}

function syncReaderHighlightsUi(context: ReaderSessionOperationContext): void {
  context.highlightManager.sortByDocumentOrder(context.state.highlights);
  context.panelCoordinator.updateHighlights(context.state.highlights);
}

function queueReaderDraftPersistence(context: ReaderSessionOperationContext): void {
  if (!context.persistDraftMutation) {
    return;
  }
  void context.persistDraftMutation().catch((error) => {
    console.warn('[ReaderSession] Failed to persist session draft:', error);
  });
}

export function createDetachedReaderHighlight(
  doc: Document,
  id: string,
  selectedHtml: string,
  selectedText: string,
  comment: string,
  fragmentUrl: string,
  createdAt = Date.now()
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
    createdAt
  };
}

function findReaderHighlight(
  highlights: ReaderHighlightRecord[],
  id: string
): ReaderHighlightRecord | undefined {
  return highlights.find((highlight) => highlight.id === id);
}

function removeHighlightFromState(highlights: ReaderHighlightRecord[], id: string): void {
  const index = highlights.findIndex((highlight) => highlight.id === id);
  if (index !== -1) {
    highlights.splice(index, 1);
  }
}

function restoreCommentDraft(
  context: ReaderSessionOperationContext,
  id: string,
  draftSnapshot: string | undefined
): void {
  if (draftSnapshot === undefined) {
    return;
  }
  const drafts = context.panelCoordinator.snapshotCommentDrafts();
  context.panelCoordinator.hydrateCommentDrafts({
    ...drafts,
    [id]: draftSnapshot
  });
}

function snapshotHighlightWrappers(highlight: ReaderHighlightRecord): HighlightWrapperSnapshot[] {
  return highlight.wrapperSegments.map((wrapper) => ({
    wrapper,
    parent: wrapper.parentNode,
    nextSibling: wrapper.nextSibling,
    childNodes: Array.from(wrapper.childNodes)
  }));
}

function restoreHighlightWrappers(snapshots: HighlightWrapperSnapshot[]): void {
  for (const snapshot of snapshots) {
    const { wrapper, parent, nextSibling, childNodes } = snapshot;
    if (!parent || wrapper.isConnected) {
      continue;
    }
    parent.insertBefore(
      wrapper,
      nextSibling && nextSibling.parentNode === parent ? nextSibling : null
    );
    for (const child of childNodes) {
      if (child.parentNode === parent) {
        wrapper.appendChild(child);
      }
    }
  }
}

function snapshotSelection(doc: Document): Range[] {
  const selection = doc.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return [];
  }
  return Array.from({ length: selection.rangeCount }, (_value, index) =>
    selection.getRangeAt(index).cloneRange()
  );
}

function restoreSelection(doc: Document, ranges: Range[]): void {
  const selection = doc.defaultView?.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
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
