import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import type { UiMountable } from '@ui/hosts/shared/contract';
import type { PopupCoordinator } from '@content/runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';
import { createVideoSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';
import { bindSessionPanelResize } from '@content/shared/panels/sessionPanelResize';
import { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';
import { createSessionPanelRenderRoot } from '@content/shared/panels/sessionPanelRoot';
import { bindSessionItemPreviewExpansion } from '@content/shared/panels/sessionItemPreviewExpansion';
import { SessionCommentDraftController } from '@content/shared/panels/sessionCommentDrafts';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import { focusContentDialogElementByDataset } from '@ui/hosts/content/contentDialogFocus';
import { bindVideoInputKeyboardIsolationBoundary } from '../videoInputEventIsolation';
import { applyVideoDialogPanelCompatibilityAttributes } from './videoDialogPanelCompatibility';

interface VideoDialogPanelOptions {
  callbacks: VideoPanelCallbacks;
  texts: VideoPanelTexts;
  initialCollapsed?: boolean;
}

export class VideoDialogPanel implements UiMountable<
  HTMLElement | undefined,
  | { texts?: VideoPanelTexts; count?: number; hint?: string; captures?: VideoPanelCapture[] }
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
  private keyboardIsolationDisposer: (() => void) | null = null;
  private texts: VideoPanelTexts;
  private captures: VideoPanelCapture[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private captureCount = 0;
  private editingCaptureId: string | null = null;
  private readonly commentDrafts = new SessionCommentDraftController<VideoPanelCapture>({
    datasetKey: 'captureInput',
    inputSelector: '[data-capture-input]',
    getItems: () => this.captures,
    getRoot: () => this.renderRoot.shadowRoot,
    submitDraft: (id, draft) => this.options.callbacks.onSubmitCaptureEdit(id, draft),
    onChange: (drafts) => this.options.callbacks.onCommentDraftChange?.(drafts)
  });
  private keepCollapsedForNextCaptureUpdate = false;
  private suppressCaptureEditorBlur = false;
  private renderBlurSuppressionToken = 0;

  constructor(private readonly options: VideoDialogPanelOptions) {
    this.texts = options.texts;
    this.keepCollapsedForNextCaptureUpdate = Boolean(options.initialCollapsed);
    this.popupCoordinator = resolveContentPopupCoordinator();
    this.collapsePersistence = new SessionPanelCollapsePersistence({
      initialCollapsed: Boolean(options.initialCollapsed),
      restoreFromStorage: !options.initialCollapsed,
      rerender: () => this.rerender()
    });
    this.renderRoot = createSessionPanelRenderRoot();
    const shadow = this.renderRoot.attachShadow({ mode: 'open' });
    this.keyboardIsolationDisposer = bindVideoInputKeyboardIsolationBoundary(shadow);
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
    texts?: VideoPanelTexts;
    count?: number;
    hint?: string;
    captures?: VideoPanelCapture[];
  }): HTMLElement {
    if (!payload) {
      return this.renderRoot;
    }
    if (payload.texts) {
      this.texts = payload.texts;
    }
    if (typeof payload.count === 'number') {
      this.captureCount = payload.count;
    }
    if (typeof payload.hint === 'string') {
      this.texts = { ...this.texts, hint: payload.hint };
    }
    if (payload.captures) {
      this.applyCaptures(payload.captures);
      this.rerender({ captureDrafts: false });
      return this.renderRoot;
    }
    this.rerender();
    return this.renderRoot;
  }

  updateTexts(texts: VideoPanelTexts): void {
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
    this.captureCount = count;
    this.rerender();
  }

  updateHint(text: string): void {
    this.texts = { ...this.texts, hint: text };
    this.rerender();
  }

  setCaptures(captures: VideoPanelCapture[]): void {
    this.applyCaptures(captures);
    this.rerender({ captureDrafts: false });
  }

  beginEditingCapture(id: string, draft: string): void {
    this.commentDrafts.captureRenderedInputs();
    this.editingCaptureId = id;
    this.commentDrafts.remember(id, draft);
    this.rerender({ captureDrafts: false });
    this.queueCaptureInputFocus(id);
  }

  stopEditing(captureId?: string): void {
    this.commentDrafts.captureRenderedInputs();
    const idToClear = captureId ?? this.editingCaptureId;
    this.commentDrafts.clear(idToClear);
    if (!captureId || this.editingCaptureId === captureId) {
      this.editingCaptureId = null;
    }
    this.rerender({ captureDrafts: false });
  }

  snapshotCommentDrafts(): Record<string, string> {
    return this.commentDrafts.snapshot();
  }

  hydrateCommentDrafts(drafts: Record<string, string>): void {
    this.commentDrafts.hydrate(drafts);
  }

  collapse(): void {
    this.collapsePersistence.set(true, { rerender: false });
    this.keepCollapsedForNextCaptureUpdate = true;
    this.rerender();
  }

  destroy(): void {
    this.cancelActiveEditor();
    this.collapsePersistence.destroy();
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    this.keyboardIsolationDisposer?.();
    this.keyboardIsolationDisposer = null;
    this.renderRoot.remove();
  }

  private rerender(options: { captureDrafts?: boolean } = {}): void {
    const shadow = this.renderRoot.shadowRoot;
    if (!shadow) {
      return;
    }
    const restoreFocusCaptureId = this.resolveFocusedEditingCaptureId(shadow);
    if (options.captureDrafts !== false) {
      this.commentDrafts.captureRenderedInputs();
    }
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    const surface = this.renderSurface();
    this.suppressCaptureEditorBlurForInternalRender();
    shadow.replaceChildren(surface);
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    this.resizeDisposer = bindSessionPanelResize(surface);
    this.previewExpansionDisposer = bindSessionItemPreviewExpansion(surface);
    if (restoreFocusCaptureId) {
      this.queueCaptureInputFocus(restoreFocusCaptureId);
    }
  }

  private suppressCaptureEditorBlurForInternalRender(): void {
    this.suppressCaptureEditorBlur = true;
    const token = (this.renderBlurSuppressionToken += 1);
    queueMicrotask(() => {
      if (this.renderBlurSuppressionToken === token) {
        this.suppressCaptureEditorBlur = false;
      }
    });
  }

  private renderSurface(): HTMLElement {
    const content = createVideoSurfaceContent({
      texts: this.texts,
      captures: this.captures.map((capture) => this.commentDrafts.withDraft(capture)),
      counter: this.formatCounter(this.captureCount),
      ...(this.destination ? { destination: this.destination } : {}),
      actions: [
        { id: 'video:finish', label: this.texts.finish, variant: 'primary' },
        { id: 'video:cancel', label: this.texts.cancel, variant: 'ghost' }
      ]
    });
    if (this.collapsePersistence.value) {
      content.surfaces.video.labels.subtitle = '';
    }
    content.surfaces.video.captures = content.surfaces.video.captures.map((capture) =>
      capture.id === this.editingCaptureId ? { ...capture, editing: true } : capture
    );
    const surface = renderStitchRuntimeSurface({
      surfaceId: 'video',
      appData: content,
      actions: {
        'video:add': () => {
          void this.commentDrafts.runAfterFlush(() =>
            this.options.callbacks.onAddCapture('button')
          );
        },
        'video:add-note': () => {
          void this.commentDrafts.runAfterFlush(() =>
            this.options.callbacks.onAddCapture('note-input')
          );
        },
        'video:finish': () => {
          void this.commentDrafts.runAfterFlush(() => this.options.callbacks.onFinish());
        },
        'video:cancel': () => {
          this.cancelActiveEditor();
          this.options.callbacks.onCancel();
        },
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
        'video:delete': (event) => {
          const id = this.resolveActionId(event, 'captureId');
          if (id) {
            if (id === this.editingCaptureId) {
              this.options.callbacks.onCaptureEditorCancel?.(id);
              this.editingCaptureId = null;
            }
            this.commentDrafts.clear(id);
            this.options.callbacks.onDeleteCapture(id);
          }
        },
        'video:toggle-screenshot': (event) => {
          const id = this.resolveActionId(event, 'captureId');
          if (id) {
            void this.options.callbacks.onToggleScreenshot(id);
          }
        }
      }
    });
    applyVideoDialogPanelCompatibilityAttributes({
      surface,
      collapsed: this.collapsePersistence.value,
      expandCollapsedPanel: () => this.collapsePersistence.set(false, { persist: true })
    });
    this.bindCaptureInteractions(surface);
    return surface;
  }

  private resolveActionId(event: Event, datasetKey: 'captureId' | 'destinationId'): string | null {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (datasetKey === 'destinationId') {
      return target?.dataset.destinationId ?? null;
    }
    return (
      target?.dataset[datasetKey] ??
      target?.closest<HTMLElement>('[data-capture-id]')?.dataset.captureId ??
      null
    );
  }

  private resolveFocusedEditingCaptureId(shadow: ShadowRoot): string | null {
    if (!this.editingCaptureId) {
      return null;
    }
    const activeElement = shadow.activeElement instanceof HTMLElement ? shadow.activeElement : null;
    return activeElement?.dataset.captureInput === this.editingCaptureId
      ? this.editingCaptureId
      : null;
  }

  private queueCaptureInputFocus(id: string): void {
    queueMicrotask(() => {
      if (this.editingCaptureId !== id) {
        return;
      }
      focusContentDialogElementByDataset(this.renderRoot.shadowRoot, 'captureInput', id);
    });
  }

  private bindCaptureInteractions(surface: HTMLElement): void {
    surface.querySelectorAll<HTMLElement>('[data-capture-id]').forEach((item) => {
      const id = item.dataset.captureId;
      if (!id) {
        return;
      }
      item.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (this.isInteractiveCaptureTarget(target)) {
          return;
        }
        this.options.callbacks.onFocusCapture(id);
      });
      const input = item.querySelector<HTMLInputElement>('[data-capture-input]');
      this.commentDrafts.bindInput(input, id);
      input?.addEventListener('focus', () => this.options.callbacks.onCaptureEditorFocus?.(id));
      input?.addEventListener('blur', (event) => {
        if (this.suppressCaptureEditorBlur) {
          return;
        }
        this.options.callbacks.onCaptureEditorBlur?.(
          id,
          this.isTargetInsidePanel(event.relatedTarget) ? 'inside-panel' : 'outside-panel'
        );
      });
    });
  }

  private applyCaptures(captures: VideoPanelCapture[]): void {
    this.commentDrafts.captureRenderedInputs();
    const shouldExpandForNewCapture =
      this.captures.length > 0 && captures.length > this.captures.length;
    if (
      this.collapsePersistence.value &&
      shouldExpandForNewCapture &&
      !this.keepCollapsedForNextCaptureUpdate
    ) {
      this.collapsePersistence.set(false, { persist: true, rerender: false });
    }
    this.keepCollapsedForNextCaptureUpdate = false;
    this.captures = [...captures];
    this.captureCount = captures.length;
    this.commentDrafts.reconcile(this.captures);
  }

  private isInteractiveCaptureTarget(target: Element | null): boolean {
    return Boolean(
      target?.closest(
        'button, input, textarea, select, a, [contenteditable="true"], [data-action-id]'
      )
    );
  }

  private cancelActiveEditor(): void {
    const id = this.editingCaptureId;
    if (!id) {
      return;
    }
    this.options.callbacks.onCaptureEditorCancel?.(id);
    this.commentDrafts.clear(id);
    this.editingCaptureId = null;
  }

  private isTargetInsidePanel(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    return (
      target === this.renderRoot ||
      this.renderRoot.contains(target) ||
      Boolean(this.renderRoot.shadowRoot?.contains(target))
    );
  }

  private formatCounter(count: number): string {
    return count <= 0
      ? this.texts.counterZero
      : this.texts.counter.replace('{count}', String(count));
  }
}
