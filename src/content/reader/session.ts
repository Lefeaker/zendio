import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import { DEFAULT_FRAGMENT_CONFIG } from '../clipper/services/fragmentConfig';
import { ADD_HIGHLIGHT_EVENT } from './constants';
import { handleReaderKeydown, isNodeInsideReaderUi } from './sessionDom';
import { ReaderSessionState, resolveReadingConfig } from './sessionState';
import type { ReaderBootstrapHighlight } from './types';
import type { ExternalHighlightPayload } from './types';
import type { ReaderSelectionPayload } from './services/selectionController';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderPanelCoordinator } from './panelCoordinator';
import type { ReaderSelectionController } from './services/selectionController';
import type { ReaderEnvironmentController } from './environmentController';
import type { ReaderSessionLifecycle } from './sessionLifecycle';
import type { ReadingSessionOptions } from '../../shared/types/options';
import { createFeatureTimer } from '../../shared/analytics/featureTimer';
import {
  clearReaderSession,
  isReaderSessionActive,
  registerReaderSession
} from '../runtime/contentSessionRegistry';
import { clearHighlightThemeState } from '../shared/highlightThemeState';
import { ContentExportDestinationState } from '../shared/exportDestinationState';
import type { ClipPayload } from '../../shared/types';
import type { ReaderSessionDependencies as FullReaderSessionDependencies } from './sessionTypes';
import {
  createSessionDraftPersister,
  createSessionDraftRepository,
  createSessionDraftStorageKey,
  type SessionDraftPersister,
  type SessionDraftRepository
} from '../sessionDrafts';
import {
  addReaderHighlightFromRange,
  cancelReaderSession,
  finishReaderSession,
  focusReaderHighlight,
  handleReaderSessionMouseUp,
  handleReaderSessionSelection,
  ingestExternalReaderHighlight,
  removeReaderHighlight,
  submitReaderHighlightEdit,
  trackReaderUsageEvent
} from './sessionOperations';
import {
  buildReaderSessionDraftEnvelope,
  createReaderSessionDraftId,
  loadLatestReaderSessionDraft,
  restoreReaderSessionDraftHighlights
} from './sessionDrafts';

export type { ReaderSessionDependencies } from './sessionTypes';

export class ReaderSession {
  private readonly state = new ReaderSessionState();
  private readonly dependencies: FullReaderSessionDependencies;
  private readonly highlightManager: ReaderHighlightManager;
  private readonly panelCoordinator: ReaderPanelCoordinator;
  private readonly selectionController: ReaderSelectionController;
  private readonly environment: ReaderEnvironmentController;
  private readonly lifecycle: ReaderSessionLifecycle;
  private readonly destinationState: ContentExportDestinationState;
  private readonly draftRepository: SessionDraftRepository;
  private readonly draftPersister: SessionDraftPersister;
  private draftId: string | null = null;
  private draftCreatedAt: number | null = null;
  private draftStorageKey: string | null = null;
  private removeDraftLifecycleListeners: (() => void) | null = null;

  private get operationContext() {
    return {
      session: this,
      doc: this.doc,
      url: this.url,
      clipPrompt: this.clipPrompt,
      state: this.state,
      highlightManager: this.highlightManager,
      panelCoordinator: this.panelCoordinator,
      lifecycle: this.lifecycle,
      dependencies: this.dependencies,
      getExportDestinationMetadata: () => this.destinationState.metadata,
      onDraftMutation: () => this.syncDraftPersistence(),
      disposeDraftPersistence: () => this.disposeDraftPersistence(),
      clearPersistedDraft: () => this.clearPersistedDraft()
    };
  }

  constructor(
    private readonly doc: Document,
    private readonly url: string,
    private readonly clipPrompt: ClipPromptGateway,
    dependencies: FullReaderSessionDependencies
  ) {
    this.dependencies = dependencies;
    this.highlightManager = this.dependencies.createHighlightManager(this.doc);
    this.panelCoordinator = this.dependencies.createPanelCoordinator({
      viewFactory: this.dependencies.viewFactory,
      callbacks: {
        onFinish: () => this.finish(),
        onCancel: () => this.cancel(),
        onSelectDestination: (id) => this.selectDestination(id),
        onDeleteHighlight: (id) => this.removeHighlightById(id),
        onSubmitHighlightEdit: (id, comment) => this.submitHighlightEdit(id, comment),
        onFocusHighlight: (id) => this.focusHighlight(id)
      },
      reconstructText: (highlight) => this.highlightManager.reconstructText(highlight),
      onCommentDraftChange: () => this.syncDraftPersistence()
    });
    this.selectionController = this.dependencies.createSelectionController({
      doc: this.doc,
      fragmentConfig: DEFAULT_FRAGMENT_CONFIG,
      canHandleSelection: () => !this.state.handlingSelection && !this.state.exporting,
      isNodeInsideUi: (node) =>
        isNodeInsideReaderUi(node, this.panelCoordinator.getElement(), this.doc),
      onSelectionReady: (payload) => {
        void this.handleSelection(payload);
      }
    });
    this.environment = this.dependencies.createEnvironmentController(
      {
        doc: this.doc,
        storage: this.dependencies.storage,
        optionsRepository: this.dependencies.optionsRepository
      },
      {
        onMessagesUpdate: (messages) => {
          this.state.messages = messages;
          this.panelCoordinator.updateMessages(messages, this.state.highlights);
        },
        onFragmentConfigUpdate: (config) => {
          this.selectionController.updateFragmentConfig(config);
        }
      }
    );
    this.lifecycle = this.dependencies.createLifecycle(
      {
        doc: this.doc,
        selectionController: this.selectionController,
        panelCoordinator: this.panelCoordinator,
        environment: this.environment,
        externalHighlightEvent: ADD_HIGHLIGHT_EVENT
      },
      {
        onSelection: (_payload) => {
          // Selection flow is already owned by the selection controller wiring.
        },
        onExternalHighlight: (payload) => this.ingestExternalHighlightPayload(payload),
        onKeydown: (event) => {
          handleReaderKeydown(event, {
            isPanelEditing: () => this.panelCoordinator.isEditing(),
            onCancel: () => this.cancel(),
            onFinish: () => this.finish()
          });
        }
      }
    );
    this.destinationState = new ContentExportDestinationState(
      this.dependencies.optionsRepository,
      () => this.createDestinationPayload(),
      this.dependencies.optionsPageUrl
    );
    this.draftRepository = createSessionDraftRepository(this.dependencies.storage.local);
    this.draftPersister = createSessionDraftPersister({
      repository: this.draftRepository,
      buildEnvelope: () => this.buildDraftEnvelope('active')
    });
  }

  async initialize(
    initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]
  ): Promise<void> {
    await this.start(initialHighlights);
  }

  destroy(): void {
    this.cancel();
  }

  __setTestHighlights(
    records: Array<{
      id: string;
      selectedHtml: string;
      selectedText: string;
      comment: string;
      fragmentUrl: string;
      wrapper: HTMLElement;
    }>
  ): void {
    this.state.highlights = records.map((record) => ({
      id: record.id,
      selectedHtml: record.selectedHtml,
      selectedText: record.selectedText,
      comment: record.comment,
      fragmentUrl: record.fragmentUrl,
      wrapper: record.wrapper,
      wrapperSegments: [record.wrapper],
      createdAt: Date.now()
    }));
    this.syncHighlightsUi();
  }

  get __testHighlights(): Array<{
    id: string;
    selectedHtml: string;
    selectedText: string;
    comment: string;
    fragmentUrl: string;
    wrapper: HTMLElement;
  }> {
    return this.state.highlights;
  }

  async start(
    initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]
  ): Promise<void> {
    if (isReaderSessionActive(this.doc)) {
      return;
    }

    registerReaderSession(this, this.doc);

    try {
      await this.lifecycle.start();
      this.bindDraftLifecycleListeners();
      this.state.analyticsTimer = createFeatureTimer();
      this.state.analyticsSource = 'unknown';
      this.applyInitialDestination(initialHighlights);
      const loadedDraft = await this.hydrateStoredDraft(initialHighlights);
      await this.refreshDestinationPreview();
      this.applyReadingConfig(await this.loadReadingConfig());
      this.watchReadingConfig();
      void trackReaderUsageEvent(this.operationContext, 'reader_session_started', {
        source: this.state.analyticsSource
      });
      this.bootstrapHighlights(initialHighlights);
      this.panelCoordinator.refreshHint(this.state.highlights.length);
      if (loadedDraft) {
        this.syncDraftPersistence();
      }
    } catch (error) {
      this.state.analyticsTimer = null;
      await this.disposeDraftPersistence();
      clearReaderSession(this, this.doc);
      throw error;
    }
  }

  private bootstrapHighlights(
    initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]
  ): void {
    const bootHighlights = initialHighlights
      ? Array.isArray(initialHighlights)
        ? initialHighlights
        : [initialHighlights]
      : [];

    for (const highlight of bootHighlights) {
      try {
        this.addHighlightFromRange(
          highlight.range,
          highlight.selectedHtml,
          highlight.selectedText,
          highlight.comment
        );
      } catch (error) {
        console.error('[ReaderSession] Failed to add initial highlight:', error);
      }
    }
  }

  private applyInitialDestination(
    initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]
  ): void {
    const bootHighlights = initialHighlights
      ? Array.isArray(initialHighlights)
        ? initialHighlights
        : [initialHighlights]
      : [];
    const initialDestination = bootHighlights.find(
      (highlight) => highlight.destination
    )?.destination;
    this.destinationState.applyMetadata(initialDestination);
  }

  private async hydrateStoredDraft(
    initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]
  ): Promise<boolean> {
    const bootHighlights = initialHighlights
      ? Array.isArray(initialHighlights)
        ? initialHighlights
        : [initialHighlights]
      : [];
    if (bootHighlights.length > 0) {
      return false;
    }

    try {
      const loadedDraft = await loadLatestReaderSessionDraft(this.draftRepository, this.url);
      if (!loadedDraft) {
        return false;
      }

      this.draftId = loadedDraft.envelope.draftId;
      this.draftCreatedAt = loadedDraft.envelope.createdAt;
      this.draftStorageKey = loadedDraft.storageKey;
      this.destinationState.applyMetadata(loadedDraft.payload.destination);
      this.panelCoordinator.hydrateCommentDrafts(loadedDraft.payload.commentDrafts);
      const restored = restoreReaderSessionDraftHighlights({
        doc: this.doc,
        highlightManager: this.highlightManager,
        highlights: loadedDraft.payload.highlights
      });
      this.state.highlights = restored.highlights;
      this.syncHighlightsUi();
      return true;
    } catch (error) {
      console.warn('[ReaderSession] Failed to hydrate stored session draft:', error);
      return false;
    }
  }

  private async loadReadingConfig(): Promise<ReadingSessionOptions> {
    try {
      return resolveReadingConfig(await this.dependencies.readerRepository.getReadingConfig());
    } catch (error) {
      console.warn('[ReaderSession] Failed to load reading config, using defaults:', error);
      return resolveReadingConfig();
    }
  }

  private watchReadingConfig(): void {
    this.state.stopReadingConfigWatcher?.();
    this.state.stopReadingConfigWatcher = this.dependencies.readerRepository.onConfigChange(
      (config) => {
        this.applyReadingConfig(resolveReadingConfig(config));
      }
    );
  }

  private applyReadingConfig(config: ReturnType<typeof resolveReadingConfig>): void {
    this.state.readingConfig = config;
    this.highlightManager.applyTheme(config.highlightTheme);
  }

  private handleSelection(payload: ReaderSelectionPayload): void {
    handleReaderSessionSelection(this.operationContext, payload);
  }

  private async handleMouseUp(event: MouseEvent): Promise<void> {
    await handleReaderSessionMouseUp(this.operationContext, event);
  }

  private addHighlightFromRange(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void {
    addReaderHighlightFromRange(this.operationContext, range, selectedHtml, selectedText, comment);
  }

  ingestExternalHighlight(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void {
    this.ingestExternalHighlightPayload({ range, selectedHtml, selectedText, comment });
  }

  private ingestExternalHighlightPayload(payload: ExternalHighlightPayload): void {
    ingestExternalReaderHighlight(this.operationContext, payload);
  }

  private syncHighlightsUi(): void {
    this.highlightManager.sortByDocumentOrder(this.state.highlights);
    this.panelCoordinator.updateHighlights(this.state.highlights);
  }

  private async finish(): Promise<void> {
    await finishReaderSession(
      this.operationContext,
      () => this.loadReadingConfig(),
      (config) => this.applyReadingConfig(config)
    );
  }

  private async refreshDestinationPreview(): Promise<void> {
    const preview = await this.destinationState.refresh();
    this.panelCoordinator.updateDestination(preview);
  }

  private async selectDestination(id: string): Promise<void> {
    this.destinationState.select(id);
    await this.refreshDestinationPreview();
    this.syncDraftPersistence();
  }

  private createDestinationPayload(): ClipPayload {
    const parsedUrl = this.parseCurrentUrl();
    const title = this.doc.title || parsedUrl?.hostname || 'Untitled';
    const domain = parsedUrl?.hostname ?? '';
    const markdown = this.state.highlights
      .map((highlight) => this.highlightManager.reconstructText(highlight))
      .join('\n\n');
    return {
      markdown: markdown || title,
      title,
      type: 'clipper',
      meta: {
        url: this.url,
        sourceUrl: this.url,
        resolvedUrl: this.url,
        ...(domain ? { domain } : {}),
        readerMode: true
      }
    };
  }

  private parseCurrentUrl(): URL | null {
    try {
      return new URL(this.url);
    } catch {
      return null;
    }
  }

  private cancel(): void {
    cancelReaderSession(this.operationContext);
  }

  private buildDraftEnvelope(status: 'active' | 'restorable') {
    const now = Date.now();
    const draftId = this.draftId ?? createReaderSessionDraftId(now);
    const createdAt = this.draftCreatedAt ?? now;
    const pageTitle = this.doc.title || this.parseCurrentUrl()?.hostname || 'Untitled';
    const envelope = buildReaderSessionDraftEnvelope({
      draftId,
      createdAt,
      now,
      pageUrl: this.url,
      pageTitle,
      destination: this.destinationState.metadata,
      highlights: this.state.highlights,
      commentDrafts: this.panelCoordinator.snapshotCommentDrafts(),
      status
    });

    if (!envelope) {
      return null;
    }

    this.draftId = draftId;
    this.draftCreatedAt = createdAt;
    this.draftStorageKey = createSessionDraftStorageKey({
      mode: envelope.mode,
      pageKey: envelope.pageKey,
      draftId: envelope.draftId
    });
    return envelope;
  }

  private syncDraftPersistence(): void {
    if (
      this.state.highlights.length === 0 &&
      Object.keys(this.panelCoordinator.snapshotCommentDrafts()).length === 0
    ) {
      void this.clearPersistedDraft();
      return;
    }

    void this.draftPersister.scheduleSave().catch((error) => {
      console.warn('[ReaderSession] Failed to persist session draft:', error);
    });
  }

  private async clearPersistedDraft(): Promise<void> {
    if (!this.draftStorageKey) {
      return;
    }

    try {
      await this.draftRepository.remove({ key: this.draftStorageKey });
    } catch (error) {
      console.warn('[ReaderSession] Failed to remove session draft:', error);
    } finally {
      this.draftId = null;
      this.draftCreatedAt = null;
      this.draftStorageKey = null;
    }
  }

  private bindDraftLifecycleListeners(): void {
    if (this.removeDraftLifecycleListeners) {
      return;
    }

    const onPageHide = () => {
      void this.flushDraftForRestore();
    };
    const onBeforeUnload = () => {
      void this.flushDraftForRestore();
    };
    this.doc.defaultView?.addEventListener('pagehide', onPageHide, { passive: true });
    this.doc.defaultView?.addEventListener('beforeunload', onBeforeUnload);
    this.removeDraftLifecycleListeners = () => {
      this.doc.defaultView?.removeEventListener('pagehide', onPageHide);
      this.doc.defaultView?.removeEventListener('beforeunload', onBeforeUnload);
      this.removeDraftLifecycleListeners = null;
    };
  }

  private async flushDraftForRestore(): Promise<void> {
    try {
      await this.draftPersister.flushNow();
      const envelope = this.buildDraftEnvelope('restorable');
      if (!envelope) {
        await this.clearPersistedDraft();
        return;
      }
      await this.draftRepository.save(envelope);
    } catch (error) {
      console.warn('[ReaderSession] Failed to flush restorable session draft:', error);
    }
  }

  private async disposeDraftPersistence(): Promise<void> {
    this.removeDraftLifecycleListeners?.();
    try {
      await this.draftPersister.dispose();
    } catch (error) {
      console.warn('[ReaderSession] Failed to dispose session draft persister:', error);
    }
  }

  private cleanup(): void {
    this.lifecycle.cleanup();
    this.state.stopReadingConfigWatcher?.();
    this.state.stopReadingConfigWatcher = null;

    for (const highlight of this.state.highlights) {
      this.highlightManager.unwrapHighlight(highlight);
    }
    this.state.highlights = [];

    clearReaderSession(this, this.doc);
    this.state.exporting = false;
    this.state.handlingSelection = false;
    clearHighlightThemeState(this.doc);

    if (this.state.highlightFocusTimeout !== null) {
      this.doc.defaultView?.clearTimeout(this.state.highlightFocusTimeout);
      this.state.highlightFocusTimeout = null;
    }

    this.doc.defaultView?.getSelection()?.removeAllRanges();
  }

  private focusHighlight(id: string): void {
    focusReaderHighlight(this.operationContext, id);
  }

  private removeHighlightById(id: string): void {
    removeReaderHighlight(this.operationContext, id);
  }

  private submitHighlightEdit(id: string, nextComment: string): void {
    submitReaderHighlightEdit(this.operationContext, id, nextComment);
  }

  private findHighlight(id: string): ReaderHighlightRecord | undefined {
    return this.state.highlights.find((highlight) => highlight.id === id);
  }
}
