import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type { ReaderPanelEditingSnapshot } from '../application/readerSessionView';
import type { UiMountable } from '@ui/hosts/shared/contract';
import type { PopupCoordinator } from '@content/runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';
import { createReaderSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';
import { bindSessionPanelResize } from '@content/shared/panels/sessionPanelResize';
import { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';
import { createSessionPanelRenderRoot } from '@content/shared/panels/sessionPanelRoot';
import { bindSessionItemPreviewExpansion } from '@content/shared/panels/sessionItemPreviewExpansion';
import { preserveSessionPanelIcon } from '@content/shared/panels/sessionPanelIconPersistence';
import {
  SessionCommentDraftController,
  type SessionCommentDraftSnapshot
} from '@content/shared/panels/sessionCommentDrafts';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import { focusContentDialogElementByDataset } from '@ui/hosts/content/contentDialogFocus';
import {
  applyReaderPanelCompatibilityAttributes,
  bindReaderHighlightInteractions
} from './readerDialogPanelDom';

interface ReaderDialogPanelOptions {
  callbacks: ReaderPanelCallbacks;
  texts: ReaderPanelTexts;
  resolveAssetUrl?: (path: string) => string;
  onCommentDraftChange?: (drafts: SessionCommentDraftSnapshot) => void;
}

export class ReaderDialogPanel implements UiMountable<
  HTMLElement | undefined,
  | {
      texts?: ReaderPanelTexts;
      count?: number;
      hint?: string;
      highlights?: ReaderPanelHighlight[];
    }
  | undefined,
  HTMLElement
> {
  readonly popupLifecycle = { preserveOnTransientClose: true, kind: 'session-panel' } as const;

  private renderRoot: HTMLElement;
  private readonly popupCoordinator: PopupCoordinator | null;
  private readonly collapsePersistence: SessionPanelCollapsePersistence;
  private unregisterPopup: (() => void) | null = null;
  private resizeDisposer: (() => void) | null = null;
  private previewExpansionDisposer: (() => void) | null = null;
  private texts: ReaderPanelTexts;
  private highlights: ReaderPanelHighlight[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private highlightCount = 0;
  private editingHighlightId: string | null = null;
  private readonly commentDrafts = new SessionCommentDraftController<ReaderPanelHighlight>({
    datasetKey: 'highlightInput',
    inputSelector: '[data-highlight-input]',
    getItems: () => this.highlights,
    getRoot: () => this.renderRoot.shadowRoot,
    submitDraft: (id, draft) => this.options.callbacks.onSubmitHighlightEdit(id, draft),
    onChange: (drafts) => this.options.onCommentDraftChange?.(drafts)
  });
  private pendingNoteFocusHighlightId: string | null = null;

  constructor(private readonly options: ReaderDialogPanelOptions) {
    this.texts = options.texts;
    this.popupCoordinator = resolveContentPopupCoordinator();
    this.collapsePersistence = new SessionPanelCollapsePersistence({
      rerender: () => this.rerender()
    });
    this.renderRoot = createSessionPanelRenderRoot('aiob-reader-panel');
    const shadow = this.renderRoot.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    this.rerender();
    void this.collapsePersistence.restore();
  }

  get element(): HTMLElement {
    return this.renderRoot;
  }

  mount(target: HTMLElement = document.body): HTMLElement {
    if (!this.renderRoot.isConnected) {
      target.append(this.renderRoot);
    }
    return this.renderRoot;
  }

  show(): void {
    this.mount();
    this.renderRoot.hidden = false;
    if (!this.unregisterPopup && this.popupCoordinator) {
      this.unregisterPopup = this.popupCoordinator.register(this);
    }
  }

  hide(): void {
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.renderRoot.hidden = true;
  }

  update(payload?: {
    texts?: ReaderPanelTexts;
    count?: number;
    hint?: string;
    highlights?: ReaderPanelHighlight[];
  }): HTMLElement {
    if (!payload) {
      return this.renderRoot;
    }
    if (payload.texts) {
      this.texts = payload.texts;
    }
    if (typeof payload.count === 'number') {
      this.highlightCount = payload.count;
    }
    if (typeof payload.hint === 'string') {
      this.texts = { ...this.texts, hint: payload.hint };
    }
    if (payload.highlights) {
      const newestHighlight = this.applyHighlights(payload.highlights);
      this.rerender({ captureDrafts: false });
      this.focusHighlightNoteInput(newestHighlight?.id);
      return this.renderRoot;
    }
    this.rerender();
    return this.renderRoot;
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.texts = texts;
    this.rerender();
  }

  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.destination = destination;
    const shadow = this.renderRoot.shadowRoot;
    if (!shadow || !patchExportDestinationRow(shadow, destination)) {
      this.rerender();
    }
  }

  updateCount(count: number): void {
    this.highlightCount = count;
    this.rerender();
  }

  updateHint(text: string): void {
    this.texts = { ...this.texts, hint: text };
    this.rerender();
  }

  setHighlights(highlights: ReaderPanelHighlight[]): void {
    const newestHighlight = this.applyHighlights(highlights);
    this.rerender();
    this.focusHighlightNoteInput(newestHighlight?.id);
  }

  stopEditing(): void {
    this.commentDrafts.clear(this.editingHighlightId);
    this.finishEditing();
  }

  snapshotCommentDrafts(): SessionCommentDraftSnapshot {
    return this.commentDrafts.snapshot();
  }

  hydrateCommentDrafts(drafts: SessionCommentDraftSnapshot): void {
    this.commentDrafts.hydrate(drafts);
    this.rerender({ captureDrafts: false });
  }

  clearCommentDraft(id: string): void {
    this.commentDrafts.clear(id, { notify: false });
    this.rerender({ captureDrafts: false });
  }

  restoreCommentDraft(id: string, draft: string | undefined): void {
    this.commentDrafts.restore(id, draft, { notify: false });
    this.rerender({ captureDrafts: false });
  }

  snapshotEditingState(): ReaderPanelEditingSnapshot {
    return {
      editingHighlightId: this.editingHighlightId,
      pendingNoteFocusHighlightId: this.pendingNoteFocusHighlightId
    };
  }

  restoreEditingState(snapshot: ReaderPanelEditingSnapshot): void {
    this.editingHighlightId = snapshot.editingHighlightId;
    this.pendingNoteFocusHighlightId = snapshot.pendingNoteFocusHighlightId;
    this.rerender({ captureDrafts: false });
  }

  finishEditing(): void {
    this.editingHighlightId = null;
    this.pendingNoteFocusHighlightId = null;
    this.rerender({ captureDrafts: false });
  }

  isEditing(): boolean {
    const activeElement = this.renderRoot.shadowRoot?.activeElement;
    return (
      activeElement instanceof HTMLInputElement &&
      activeElement.dataset.highlightInput === this.editingHighlightId
    );
  }

  destroy(): void {
    this.collapsePersistence.destroy();
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    this.renderRoot.remove();
  }

  private rerender(options: { captureDrafts?: boolean } = {}): void {
    const shadow = this.renderRoot.shadowRoot;
    if (!shadow) {
      return;
    }
    if (options.captureDrafts !== false) {
      this.commentDrafts.captureRenderedInputs();
    }
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    const surface = this.renderSurface();
    preserveSessionPanelIcon(shadow, surface);
    shadow.replaceChildren(surface);
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    this.resizeDisposer = bindSessionPanelResize(surface);
    this.previewExpansionDisposer = bindSessionItemPreviewExpansion(surface);
    this.focusHighlightNoteInput(this.pendingNoteFocusHighlightId ?? this.editingHighlightId);
  }

  private renderSurface(): HTMLElement {
    const content = createReaderSurfaceContent({
      texts: this.texts,
      highlights: this.highlights.map((highlight) => this.commentDrafts.withDraft(highlight)),
      counter: this.formatCounter(this.highlightCount),
      iconUrl: this.resolveAssetUrl('icons/60x60/zendio_icon_readingt.png'),
      ...(this.destination ? { destination: this.destination } : {}),
      actions: [
        { id: 'reader:finish', label: this.texts.finish, variant: 'primary' },
        { id: 'reader:cancel', label: this.texts.cancel, variant: 'ghost' }
      ]
    });
    if (this.collapsePersistence.value) {
      content.surfaces.reader.labels.subtitle = '';
    }
    const surface = renderStitchRuntimeSurface({
      surfaceId: 'reader',
      appData: content,
      actions: {
        'reader:finish': () => {
          void this.commentDrafts.runAfterFlush(() => this.options.callbacks.onFinish());
        },
        'reader:cancel': () => this.options.callbacks.onCancel(),
        'export-destination:select': (event) => {
          const id = this.resolveActionId(event, 'destinationId');
          if (id) {
            void this.options.callbacks.onSelectDestination?.(id);
          }
        },
        'session:toggleCollapse': () => {
          this.collapsePersistence.toggle({ persist: true });
        },
        'resource:close': () => this.options.callbacks.onCancel(),
        'reader:delete': (event) => {
          const id = this.resolveActionId(event, 'highlightId');
          if (id) {
            this.observeAsync(this.handleDeleteHighlight(id));
          }
        },
        'reader:save': (event) => {
          const id = this.resolveActionId(event, 'highlightId');
          const input = id
            ? surface.querySelector<HTMLInputElement>(`[data-highlight-input="${CSS.escape(id)}"]`)
            : null;
          if (id && input) {
            void this.commentDrafts.submit(id, input.value);
          }
        }
      }
    });
    applyReaderPanelCompatibilityAttributes(surface, {
      collapsed: this.collapsePersistence.value,
      onExpand: () => {
        this.collapsePersistence.set(false, { persist: true });
      }
    });
    bindReaderHighlightInteractions(surface, {
      onFocusHighlight: (id) => this.options.callbacks.onFocusHighlight(id),
      onInputFocus: (id) => {
        this.editingHighlightId = id;
      },
      bindInput: (input, id) => this.commentDrafts.bindInput(input, id)
    });
    return surface;
  }

  private resolveAssetUrl(path: string): string {
    try {
      return this.options.resolveAssetUrl?.(path) ?? path;
    } catch {
      return path;
    }
  }

  private resolveActionId(
    event: Event,
    datasetKey: 'highlightId' | 'destinationId'
  ): string | null {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (datasetKey === 'destinationId') {
      return target?.dataset.destinationId ?? null;
    }
    return (
      target?.dataset[datasetKey] ??
      target?.closest<HTMLElement>('[data-highlight-id]')?.dataset.highlightId ??
      null
    );
  }

  private applyHighlights(highlights: ReaderPanelHighlight[]): ReaderPanelHighlight | undefined {
    this.commentDrafts.captureRenderedInputs();
    const previousCount = this.highlights.length;
    const shouldExpandForNewHighlight = previousCount > 0 && highlights.length > previousCount;
    if (this.collapsePersistence.value && shouldExpandForNewHighlight) {
      this.collapsePersistence.set(false, { persist: true, rerender: false });
    }
    this.highlights = [...highlights];
    this.highlightCount = highlights.length;
    this.commentDrafts.reconcile(this.highlights);
    const newestHighlight = highlights.length > previousCount ? highlights.at(-1) : undefined;
    if (newestHighlight?.id) {
      this.editingHighlightId = newestHighlight.id;
      this.pendingNoteFocusHighlightId = newestHighlight.id;
    }
    return newestHighlight;
  }

  private focusHighlightNoteInput(highlightId: string | null | undefined): void {
    if (!highlightId) {
      return;
    }
    if (
      focusContentDialogElementByDataset(this.renderRoot.shadowRoot, 'highlightInput', highlightId)
    ) {
      this.pendingNoteFocusHighlightId = null;
    }
  }

  private formatCounter(count: number): string {
    if (count <= 0) {
      return this.texts.counterZero;
    }
    return this.texts.counter.replace('{count}', String(count));
  }

  private async handleDeleteHighlight(id: string): Promise<void> {
    this.commentDrafts.captureRenderedInputs();
    await this.options.callbacks.onDeleteHighlight(id);
    this.commentDrafts.clear(id);
  }

  private observeAsync(task: Promise<void>): void {
    void task.catch((error) => {
      console.warn('[ReaderDialogPanel] Failed to complete async panel action:', error);
    });
  }
}
