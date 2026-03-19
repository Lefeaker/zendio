import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { DEFAULT_FRAGMENT_CONFIG } from '../clipper/services/fragmentConfig';
import { ADD_HIGHLIGHT_EVENT } from './constants';
import { handleReaderKeydown, isNodeInsideReaderUi } from './sessionDom';
import {
  createReaderSessionDependencies,
  type ReaderSessionPlatformDependencies
} from './sessionDependencies';
import { createReaderHighlightId, ReaderSessionState, resolveReadingConfig } from './sessionState';
import type { ReaderBootstrapHighlight } from './types';
import type { ExternalHighlightPayload } from './types';
import type { ReaderSelectionPayload } from './services/selectionController';
import type { ReaderHighlightManager, ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderPanelCoordinator } from './panelCoordinator';
import type { ReaderSelectionController } from './services/selectionController';
import type { ReaderEnvironmentController } from './environmentController';
import type { ReaderSessionLifecycle } from './sessionLifecycle';
import type { ReadingSessionOptions } from '../../shared/types/options';
import {
  clearReaderSession,
  isReaderSessionActive,
  registerReaderSession
} from '../runtime/contentSessionRegistry';
import type { ReaderSessionDependencies as FullReaderSessionDependencies } from './sessionTypes';

export type { ReaderSessionDependencies } from './sessionTypes';

let defaultReaderSessionDependencies: FullReaderSessionDependencies | null = null;

export function initializeDefaultReaderSessionDependencies(
  platform: ReaderSessionPlatformDependencies
): FullReaderSessionDependencies {
  const dependencies = createReaderSessionDependencies(platform);
  defaultReaderSessionDependencies = dependencies;
  return dependencies;
}

function getDefaultReaderSessionDependencies(): FullReaderSessionDependencies {
  if (!defaultReaderSessionDependencies) {
    throw new Error('ReaderSession dependencies have not been initialized');
  }
  return defaultReaderSessionDependencies;
}

function resolveReaderSessionDependencies(
  overrides?: Partial<FullReaderSessionDependencies>
): FullReaderSessionDependencies {
  if (!overrides) {
    return getDefaultReaderSessionDependencies();
  }
  if (!defaultReaderSessionDependencies) {
    return overrides as FullReaderSessionDependencies;
  }
  return {
    ...defaultReaderSessionDependencies,
    ...overrides
  };
}

export class ReaderSession {
  private readonly state = new ReaderSessionState();
  private readonly dependencies: FullReaderSessionDependencies;
  private readonly highlightManager: ReaderHighlightManager;
  private readonly panelCoordinator: ReaderPanelCoordinator;
  private readonly selectionController: ReaderSelectionController;
  private readonly environment: ReaderEnvironmentController;
  private readonly lifecycle: ReaderSessionLifecycle;

  constructor(
    private readonly doc: Document,
    private readonly url: string,
    private readonly clipPrompt: ClipPromptGateway,
    dependencyOverrides?: Partial<FullReaderSessionDependencies>
  ) {
    this.dependencies = resolveReaderSessionDependencies(dependencyOverrides);
    this.highlightManager = this.dependencies.createHighlightManager(this.doc);
    this.panelCoordinator = this.dependencies.createPanelCoordinator({
      viewFactory: this.dependencies.viewFactory,
      callbacks: {
        onFinish: () => this.finish(),
        onCancel: () => this.cancel(),
        onDeleteHighlight: (id) => this.removeHighlightById(id),
        onSubmitHighlightEdit: (id, comment) => this.submitHighlightEdit(id, comment),
        onFocusHighlight: (id) => this.focusHighlight(id)
      },
      reconstructText: (highlight) => this.highlightManager.reconstructText(highlight)
    });
    this.selectionController = this.dependencies.createSelectionController({
      doc: this.doc,
      fragmentConfig: DEFAULT_FRAGMENT_CONFIG,
      canHandleSelection: () => !this.state.handlingSelection && !this.state.exporting,
      isNodeInsideUi: (node) => isNodeInsideReaderUi(node, this.panelCoordinator.getElement(), this.doc),
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
  }

  async initialize(initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]): Promise<void> {
    await this.start(initialHighlights);
  }

  destroy(): void {
    this.cancel();
  }

  __setTestHighlights(records: Array<{
    id: string;
    selectedHtml: string;
    selectedText: string;
    comment: string;
    fragmentUrl: string;
    wrapper: HTMLElement;
  }>): void {
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

  async start(initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]): Promise<void> {
    if (isReaderSessionActive(this.doc)) {
      return;
    }

    registerReaderSession(this, this.doc);

    try {
      await this.lifecycle.start();
      this.applyReadingConfig(await this.loadReadingConfig());
      this.watchReadingConfig();
      this.bootstrapHighlights(initialHighlights);
      this.panelCoordinator.refreshHint(this.state.highlights.length);
    } catch (error) {
      clearReaderSession(this, this.doc);
      throw error;
    }
  }

  private bootstrapHighlights(initialHighlights?: ReaderBootstrapHighlight | ReaderBootstrapHighlight[]): void {
    const bootHighlights = initialHighlights
      ? (Array.isArray(initialHighlights) ? initialHighlights : [initialHighlights])
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
    this.state.stopReadingConfigWatcher = this.dependencies.readerRepository.onConfigChange((config) => {
      this.applyReadingConfig(resolveReadingConfig(config));
    });
  }

  private applyReadingConfig(config: ReturnType<typeof resolveReadingConfig>): void {
    this.state.readingConfig = config;
    this.highlightManager.applyTheme(config.highlightTheme);
  }

  private async handleSelection(payload: ReaderSelectionPayload): Promise<void> {
    this.state.handlingSelection = true;

    try {
      const promptResult = await this.clipPrompt.requestSelectionAction({
        selectedText: payload.selectedText,
        allowReaderMode: false,
        readerModeBehavior: 'start'
      });
      if (promptResult.action !== 'clip') {
        this.doc.defaultView?.getSelection()?.removeAllRanges();
        return;
      }

      this.addHighlightFromRange(
        payload.range,
        payload.selectedHtml,
        payload.selectedText,
        promptResult.comment.trim()
      );
      this.doc.defaultView?.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error('[ReaderSession] Failed to capture selection:', error);
      this.panelCoordinator.applyHint('selectionFailure', this.state.highlights.length);
    } finally {
      this.state.handlingSelection = false;
    }
  }

  private async handleMouseUp(event: MouseEvent): Promise<void> {
    if (this.state.handlingSelection || this.state.exporting || event.button !== 0) {
      return;
    }

    const selection = this.doc.defaultView?.getSelection() ?? window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    if (
      isNodeInsideReaderUi(selection.anchorNode, this.panelCoordinator.getElement(), this.doc) ||
      isNodeInsideReaderUi(selection.focusNode, this.panelCoordinator.getElement(), this.doc)
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
    const container = this.doc.createElement('div');
    container.appendChild(range.cloneContents());

    await this.handleSelection({
      range,
      selectedHtml: container.innerHTML,
      selectedText,
      event
    });
  }

  private addHighlightFromRange(
    range: Range,
    selectedHtml: string,
    selectedText: string,
    comment: string
  ): void {
    const id = createReaderHighlightId();
    const fragmentUrl = generateTextFragmentUrl(this.url, selectedText);
    const highlight =
      this.highlightManager.createHighlight({
        id,
        range,
        selectedHtml,
        selectedText,
        comment,
        fragmentUrl
      }) ?? this.createDetachedHighlight(id, selectedHtml, selectedText, comment, fragmentUrl);
    this.state.highlights.push(highlight);
    this.syncHighlightsUi();
    this.panelCoordinator.applyHint('panel', this.state.highlights.length);
  }

  private createDetachedHighlight(
    id: string,
    selectedHtml: string,
    selectedText: string,
    comment: string,
    fragmentUrl: string
  ): ReaderHighlightRecord {
    const wrapper = this.doc.createElement('mark');
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

  ingestExternalHighlight(range: Range, selectedHtml: string, selectedText: string, comment: string): void {
    this.ingestExternalHighlightPayload({ range, selectedHtml, selectedText, comment });
  }

  private ingestExternalHighlightPayload(payload: ExternalHighlightPayload): void {
    this.addHighlightFromRange(payload.range, payload.selectedHtml, payload.selectedText, payload.comment);
    this.doc.defaultView?.getSelection()?.removeAllRanges();
  }

  private syncHighlightsUi(): void {
    this.highlightManager.sortByDocumentOrder(this.state.highlights);
    this.panelCoordinator.updateHighlights(this.state.highlights);
  }

  private async finish(): Promise<void> {
    if (this.state.exporting) {
      return;
    }

    if (!this.state.highlights.length) {
      this.panelCoordinator.applyHint('noHighlights', 0);
      return;
    }

    this.state.exporting = true;
    this.panelCoordinator.applyHint('exporting', this.state.highlights.length);

    try {
      this.applyReadingConfig(await this.loadReadingConfig());
      const highlights = this.dependencies.exporter.prepareHighlights(
        this.state.highlights,
        this.highlightManager
      );
      const pageTitle = this.doc.title || new URL(this.url).hostname;
      const documentClone =
        this.state.readingConfig.exportMode === 'full'
          ? (this.doc.cloneNode(true) as Document)
          : undefined;

      if (documentClone) {
        this.dependencies.exporter.applyTokens(documentClone, highlights);
      }

      const payload = this.dependencies.exporter.buildMarkdown({
        mode: this.state.readingConfig.exportMode,
        pageTitle,
        pageUrl: this.url,
        highlights,
        ...(documentClone !== undefined && { documentClone })
      });

      await this.dependencies.dispatchClipResult(payload);
      this.cleanup();
    } catch (error) {
      console.error('[ReaderSession] Export failed:', error);
      this.panelCoordinator.applyHint('failure', this.state.highlights.length);
      this.state.exporting = false;
    }
  }

  private cancel(): void {
    if (this.state.exporting) {
      return;
    }
    this.cleanup();
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
    delete this.doc.documentElement.dataset.aiobReaderHighlight;
    delete this.doc.documentElement.dataset.aiobReaderHighlightTheme;

    if (this.state.highlightFocusTimeout !== null) {
      this.doc.defaultView?.clearTimeout(this.state.highlightFocusTimeout);
      this.state.highlightFocusTimeout = null;
    }

    this.doc.defaultView?.getSelection()?.removeAllRanges();
  }

  private focusHighlight(id: string): void {
    const highlight = this.findHighlight(id);
    if (!highlight) {
      return;
    }

    this.state.highlightFocusTimeout = this.highlightManager.focusHighlight(
      highlight,
      this.state.highlightFocusTimeout,
      this.doc.defaultView ?? window
    );
  }

  private removeHighlightById(id: string): void {
    if (this.state.exporting) {
      return;
    }

    const index = this.state.highlights.findIndex((highlight) => highlight.id === id);
    if (index === -1) {
      return;
    }

    const [removed] = this.state.highlights.splice(index, 1);
    this.highlightManager.unwrapHighlight(removed);
    this.syncHighlightsUi();
    this.panelCoordinator.applyHint(
      this.state.highlights.length ? 'panel' : 'noHighlights',
      this.state.highlights.length
    );
  }

  private submitHighlightEdit(id: string, nextComment: string): void {
    if (this.state.exporting) {
      return;
    }

    const highlight = this.findHighlight(id);
    if (!highlight) {
      this.panelCoordinator.stopEditing();
      return;
    }

    this.highlightManager.updateComment(highlight, nextComment);
    this.syncHighlightsUi();
    this.panelCoordinator.applyHint('panel', this.state.highlights.length);
    this.panelCoordinator.stopEditing();
  }

  private findHighlight(id: string): ReaderHighlightRecord | undefined {
    return this.state.highlights.find((highlight) => highlight.id === id);
  }
}
