import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import type { UiMountable } from '@ui/hosts/shared/contract';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';
import {
  panelStyleSheetManager,
  prepareStyleHost,
  revealStyleHost
} from '@content/shared/panels/styleSheetManager';
import { SessionPanelCollapsePersistence } from '@content/shared/panels/sessionPanelCollapsePersistence';
import { createSessionPanelRenderRoot } from '@content/shared/panels/sessionPanelRoot';
import { SessionCommentDraftController } from '@content/shared/panels/sessionCommentDrafts';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';
import { queueContentDialogElementByDataset } from '@ui/hosts/content/contentDialogFocus';
import { createInvalidationScope } from '@ui/stitch-runtime/render/invalidation';
import { bindVideoInputKeyboardIsolationBoundary } from '../videoInputEventIsolation';
import {
  createVideoDialogSurfaceContent,
  renderVideoDialogSurface,
  renderVideoDialogSurfaceTemplate
} from './videoDialogSurface';
import { VideoDialogPanelController } from './videoDialogPanelController';
import { createVideoDialogPanelEventHandlers } from './videoDialogPanelEvents';
import { VIDEO_MODE_PANEL_ICON_PATH } from '@shared/assets/iconPaths';

interface VideoDialogPanelOptions {
  callbacks: VideoPanelCallbacks;
  texts: VideoPanelTexts;
  resolveAssetUrl?: (path: string) => string;
  initialCollapsed?: boolean;
}

type VideoUpdate =
  | { texts?: VideoPanelTexts; count?: number; hint?: string; captures?: VideoPanelCapture[] }
  | undefined;

export class VideoDialogPanel implements UiMountable<
  HTMLElement | undefined,
  VideoUpdate,
  HTMLElement
> {
  readonly popupLifecycle = { preserveOnTransientClose: true, kind: 'session-panel' } as const;
  private readonly renderRoot = createSessionPanelRenderRoot();
  private readonly collapsePersistence: SessionPanelCollapsePersistence;
  private readonly invalidation = createInvalidationScope();
  private readonly commentDrafts = new SessionCommentDraftController<VideoPanelCapture>({
    datasetKey: 'captureInput',
    inputSelector: '[data-capture-input]',
    getItems: () => this.captures,
    getRoot: () => this.renderRoot.shadowRoot,
    submitDraft: (id, draft) => this.options.callbacks.onSubmitCaptureEdit(id, draft),
    onChange: (drafts) => this.options.callbacks.onCommentDraftChange?.(drafts)
  });
  private readonly controller: VideoDialogPanelController;
  private disposeKeyboardIsolation: (() => void) | null = null;
  private texts: VideoPanelTexts;
  private captures: VideoPanelCapture[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private captureCount = 0;
  private editingCaptureId: string | null = null;
  private keepCollapsedForNextCaptureUpdate = false;

  constructor(private readonly options: VideoDialogPanelOptions) {
    this.texts = options.texts;
    this.keepCollapsedForNextCaptureUpdate = Boolean(options.initialCollapsed);
    this.collapsePersistence = new SessionPanelCollapsePersistence({
      initialCollapsed: Boolean(options.initialCollapsed),
      restoreFromStorage: !options.initialCollapsed,
      rerender: () => this.rerender()
    });
    const shadow = this.renderRoot.attachShadow({ mode: 'open' });
    prepareStyleHost(this.renderRoot);
    this.disposeKeyboardIsolation = bindVideoInputKeyboardIsolationBoundary(shadow);
    this.controller = new VideoDialogPanelController({
      host: this.renderRoot,
      shadow,
      popupOwner: this,
      popupCoordinator: resolveContentPopupCoordinator(),
      applyStyles: (root) => panelStyleSheetManager.applyVideoStyles(root),
      revealStyles: revealStyleHost,
      createHandle: () => renderVideoDialogSurface(this.surfaceContent()),
      createTemplate: () => renderVideoDialogSurfaceTemplate(this.surfaceContent()),
      isCollapsed: () => this.collapsePersistence.value,
      events: createVideoDialogPanelEventHandlers({
        callbacks: options.callbacks,
        root: this.renderRoot,
        drafts: this.commentDrafts,
        collapse: this.collapsePersistence,
        getEditing: () => this.editingCaptureId,
        setEditing: (id) => {
          this.editingCaptureId = id;
        },
        cancelActiveEditor: () => this.cancelActiveEditor()
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

  update(payload?: VideoUpdate): HTMLElement {
    if (!payload) return this.renderRoot;
    if (payload.texts) this.texts = payload.texts;
    if (typeof payload.count === 'number') this.captureCount = payload.count;
    if (typeof payload.hint === 'string') this.texts = { ...this.texts, hint: payload.hint };
    if (payload.captures) {
      this.applyCaptures(payload.captures);
      this.rerender({ captureDrafts: false });
    } else this.rerender();
    return this.renderRoot;
  }

  updateTexts(texts: VideoPanelTexts): void {
    this.texts = texts;
    this.rerender();
  }
  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.destination = destination;
    this.rerender();
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
    const id = captureId ?? this.editingCaptureId;
    this.commentDrafts.clear(id);
    if (!captureId || this.editingCaptureId === captureId) this.editingCaptureId = null;
    this.rerender({ captureDrafts: false });
  }
  snapshotCommentDrafts(): Record<string, string> {
    return this.commentDrafts.snapshot();
  }
  hydrateCommentDrafts(drafts: Record<string, string>): void {
    this.commentDrafts.hydrate(drafts);
    this.rerender({ captureDrafts: false });
  }
  collapse(): void {
    this.collapsePersistence.set(true, { rerender: false });
    this.keepCollapsedForNextCaptureUpdate = true;
    this.rerender();
  }

  destroy(): void {
    if (!this.invalidation.active) return;
    this.cancelActiveEditor();
    this.invalidation.dispose();
    this.collapsePersistence.destroy();
    this.controller.dispose();
    this.disposeKeyboardIsolation?.();
    this.disposeKeyboardIsolation = null;
  }

  private rerender(options: { captureDrafts?: boolean } = {}): void {
    if (options.captureDrafts !== false) this.commentDrafts.captureRenderedInputs();
    const focused = this.focusedCaptureId();
    this.controller.update();
    if (focused) this.queueCaptureInputFocus(focused);
  }
  private surfaceContent() {
    return createVideoDialogSurfaceContent({
      texts: this.texts,
      captures: this.captures.map((item) => this.commentDrafts.withDraft(item)),
      counter: this.formatCounter(this.captureCount),
      iconUrl: this.resolveAssetUrl(VIDEO_MODE_PANEL_ICON_PATH),
      destination: this.destination,
      editingCaptureId: this.editingCaptureId
    });
  }
  private applyCaptures(captures: VideoPanelCapture[]): void {
    this.commentDrafts.captureRenderedInputs();
    const shouldExpand = this.captures.length > 0 && captures.length > this.captures.length;
    if (this.collapsePersistence.value && shouldExpand && !this.keepCollapsedForNextCaptureUpdate)
      this.collapsePersistence.set(false, { persist: true, rerender: false });
    this.keepCollapsedForNextCaptureUpdate = false;
    this.captures = [...captures];
    this.captureCount = captures.length;
    this.commentDrafts.reconcile(this.captures);
  }
  private focusedCaptureId(): string | null {
    const active = this.renderRoot.shadowRoot?.activeElement;
    return active instanceof HTMLInputElement &&
      active.dataset.captureInput === this.editingCaptureId
      ? this.editingCaptureId
      : null;
  }
  private queueCaptureInputFocus(id: string): void {
    const token = this.invalidation.capture();
    queueContentDialogElementByDataset(
      this.renderRoot.shadowRoot,
      'captureInput',
      id,
      () => this.invalidation.isCurrent(token) && this.editingCaptureId === id
    );
  }
  private cancelActiveEditor(): void {
    const id = this.editingCaptureId;
    if (!id) return;
    this.options.callbacks.onCaptureEditorCancel?.(id);
    this.commentDrafts.clear(id);
    this.editingCaptureId = null;
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
