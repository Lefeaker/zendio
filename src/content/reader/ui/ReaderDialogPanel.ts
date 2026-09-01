import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type {
  ReaderPanelEditingSnapshot,
  ReaderPanelRenderOptions
} from '../application/readerSessionView';
import type { UiMountable } from '@ui/hosts/shared/contract';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';
import { createReaderSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import {
  renderStitchRuntimeSessionSurface,
  renderStitchRuntimeSessionTemplate
} from '@content/stitch/runtimeSurfaceRenderer';
import {
  panelStyleSheetManager,
  prepareStyleHost,
  revealStyleHost
} from '@content/shared/panels/styleSheetManager';
import { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';
import { createSessionPanelRenderRoot } from '@content/shared/panels/sessionPanelRoot';
import {
  SessionCommentDraftController,
  type SessionCommentDraftSnapshot
} from '@content/shared/panels/sessionCommentDrafts';
import { reconcileLiveExportDestinationRow } from '@content/shared/exportDestinationState';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';
import { focusContentDialogElementByDataset } from '@ui/hosts/content/contentDialogFocus';
import { ReaderDialogPanelController } from './readerDialogPanelController';
import { createReaderDialogPanelEventHandlers } from './readerDialogPanelEvents';

interface ReaderDialogPanelOptions {
  callbacks: ReaderPanelCallbacks;
  texts: ReaderPanelTexts;
  resolveAssetUrl?: (path: string) => string;
  onCommentDraftChange?: (drafts: SessionCommentDraftSnapshot) => void;
}

type ReaderUpdate =
  | { texts?: ReaderPanelTexts; count?: number; hint?: string; highlights?: ReaderPanelHighlight[] }
  | undefined;

export class ReaderDialogPanel implements UiMountable<
  HTMLElement | undefined,
  ReaderUpdate,
  HTMLElement
> {
  readonly popupLifecycle = { preserveOnTransientClose: true, kind: 'session-panel' } as const;
  private readonly renderRoot = createSessionPanelRenderRoot('aiob-reader-panel');
  private readonly collapsePersistence: SessionPanelCollapsePersistence;
  private readonly commentDrafts = new SessionCommentDraftController<ReaderPanelHighlight>({
    datasetKey: 'highlightInput',
    inputSelector: '[data-highlight-input]',
    getItems: () => this.highlights,
    getRoot: () => this.renderRoot.shadowRoot,
    submitDraft: (id, draft) => this.options.callbacks.onSubmitHighlightEdit(id, draft),
    onChange: (drafts) => this.options.onCommentDraftChange?.(drafts)
  });
  private readonly controller: ReaderDialogPanelController;
  private texts: ReaderPanelTexts;
  private highlights: ReaderPanelHighlight[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private highlightCount = 0;
  private editingHighlightId: string | null = null;
  private pendingNoteFocusHighlightId: string | null = null;

  constructor(private readonly options: ReaderDialogPanelOptions) {
    this.texts = options.texts;
    this.collapsePersistence = new SessionPanelCollapsePersistence({
      rerender: () => this.rerender()
    });
    const shadow = this.renderRoot.attachShadow({ mode: 'open' });
    prepareStyleHost(this.renderRoot);
    this.controller = new ReaderDialogPanelController({
      host: this.renderRoot,
      shadow,
      popupOwner: this,
      popupCoordinator: resolveContentPopupCoordinator(),
      applyStyles: (root) => panelStyleSheetManager.applyReaderStyles(root),
      revealStyles: revealStyleHost,
      createHandle: () => renderStitchRuntimeSessionSurface(this.surfaceOptions()),
      createTemplate: () => renderStitchRuntimeSessionTemplate(this.surfaceOptions()),
      isCollapsed: () => this.collapsePersistence.value,
      events: createReaderDialogPanelEventHandlers({
        callbacks: options.callbacks,
        drafts: this.commentDrafts,
        collapse: this.collapsePersistence,
        setEditing: (id) => {
          this.editingHighlightId = id;
        }
      })
    });
    void this.collapsePersistence.restore();
  }

  get element(): HTMLElement {
    return this.renderRoot;
  }
  mount(target: HTMLElement = document.body): HTMLElement {
    return this.controller.mount(target);
  }
  show(): void {
    this.controller.show();
  }
  hide(): void {
    this.controller.hide();
  }
  update(payload?: ReaderUpdate): HTMLElement {
    if (!payload) return this.renderRoot;
    if (payload.texts) this.texts = payload.texts;
    if (typeof payload.count === 'number') this.highlightCount = payload.count;
    if (typeof payload.hint === 'string') this.texts = { ...this.texts, hint: payload.hint };
    if (payload.highlights) {
      const focus = this.applyHighlights(payload.highlights);
      this.rerender({ captureDrafts: false });
      this.focusHighlightNoteInput(focus?.id);
    } else this.rerender();
    return this.renderRoot;
  }

  updateTexts(texts: ReaderPanelTexts): void {
    this.texts = texts;
    this.rerender();
  }
  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.destination = destination;
    const shadow = this.renderRoot.shadowRoot;
    if (shadow && reconcileLiveExportDestinationRow(shadow, destination)) return;
    this.rerender();
  }
  updateCount(count: number): void {
    this.highlightCount = count;
    this.rerender();
  }
  updateHint(text: string): void {
    this.texts = { ...this.texts, hint: text };
    this.rerender();
  }
  setHighlights(highlights: ReaderPanelHighlight[], options: ReaderPanelRenderOptions = {}): void {
    const focus = this.applyHighlights(highlights, options);
    this.rerender();
    this.focusHighlightNoteInput(focus?.id);
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
    const active = this.renderRoot.shadowRoot?.activeElement;
    return (
      active instanceof HTMLInputElement &&
      active.dataset.highlightInput === this.editingHighlightId
    );
  }

  destroy(): void {
    this.collapsePersistence.destroy();
    this.controller.dispose();
  }

  private rerender(options: { captureDrafts?: boolean } = {}): void {
    if (options.captureDrafts !== false) this.commentDrafts.captureRenderedInputs();
    this.controller.update();
    this.focusHighlightNoteInput(this.pendingNoteFocusHighlightId ?? this.editingHighlightId);
  }
  private surfaceOptions() {
    return {
      surfaceId: 'reader' as const,
      appData: createReaderSurfaceContent({
        texts: this.texts,
        highlights: this.highlights.map((item) => this.commentDrafts.withDraft(item)),
        counter: this.formatCounter(this.highlightCount),
        iconUrl: this.resolveAssetUrl('icons/60x60/zendio_icon_readingt.png'),
        ...(this.destination ? { destination: this.destination } : {}),
        actions: [
          { id: 'reader:finish', label: this.texts.finish, variant: 'primary' as const },
          { id: 'reader:cancel', label: this.texts.cancel, variant: 'ghost' as const }
        ]
      })
    };
  }
  private applyHighlights(
    highlights: ReaderPanelHighlight[],
    options: ReaderPanelRenderOptions = {}
  ): ReaderPanelHighlight | undefined {
    this.commentDrafts.captureRenderedInputs();
    const focus = options.focusHighlightId
      ? highlights.find((item) => item.id === options.focusHighlightId)
      : undefined;
    if (this.collapsePersistence.value && this.highlights.length > 0 && focus)
      this.collapsePersistence.set(false, { persist: true, rerender: false });
    this.highlights = [...highlights];
    this.highlightCount = highlights.length;
    this.commentDrafts.reconcile(this.highlights);
    if (focus) {
      this.editingHighlightId = focus.id;
      this.pendingNoteFocusHighlightId = focus.id;
    }
    return focus;
  }
  private focusHighlightNoteInput(id: string | null | undefined): void {
    if (id && focusContentDialogElementByDataset(this.renderRoot.shadowRoot, 'highlightInput', id))
      this.pendingNoteFocusHighlightId = null;
  }
  private resolveAssetUrl(path: string): string {
    try {
      return this.options.resolveAssetUrl?.(path) ?? path;
    } catch {
      return path;
    }
  }
  private formatCounter(count: number): string {
    return count <= 0
      ? this.texts.counterZero
      : this.texts.counter.replace('{count}', String(count));
  }
}
