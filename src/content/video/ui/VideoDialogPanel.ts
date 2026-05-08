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
import { bindSessionItemPreviewExpansion } from '@content/shared/panels/sessionItemPreviewExpansion';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

interface VideoDialogPanelOptions {
  callbacks: VideoPanelCallbacks;
  texts: VideoPanelTexts;
  initialCollapsed?: boolean;
}

export class VideoDialogPanel
  implements
    UiMountable<
      HTMLElement | undefined,
      | { texts?: VideoPanelTexts; count?: number; hint?: string; captures?: VideoPanelCapture[] }
      | undefined,
      HTMLElement
    >
{
  readonly popupLifecycle = { preserveOnTransientClose: true };

  private renderRoot: HTMLElement;
  private readonly popupCoordinator: PopupCoordinator | null;
  private unregisterPopup: (() => void) | null = null;
  private resizeDisposer: (() => void) | null = null;
  private previewExpansionDisposer: (() => void) | null = null;
  private texts: VideoPanelTexts;
  private captures: VideoPanelCapture[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private captureCount = 0;
  private editingCaptureId: string | null = null;
  private editingDraft = '';
  private collapsed = false;
  private keepCollapsedForNextCaptureUpdate = false;

  constructor(private readonly options: VideoDialogPanelOptions) {
    this.texts = options.texts;
    this.collapsed = Boolean(options.initialCollapsed);
    this.keepCollapsedForNextCaptureUpdate = this.collapsed;
    this.popupCoordinator = resolveContentPopupCoordinator();
    this.renderRoot = document.createElement('div');
    this.renderRoot.style.position = 'fixed';
    this.renderRoot.style.inset = '0';
    this.renderRoot.style.zIndex = '2147483647';
    this.renderRoot.style.pointerEvents = 'none';
    const shadow = this.renderRoot.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    this.rerender();
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
      if (
        this.collapsed &&
        payload.captures.length > this.captures.length &&
        !this.keepCollapsedForNextCaptureUpdate
      ) {
        this.collapsed = false;
      }
      this.keepCollapsedForNextCaptureUpdate = false;
      this.captures = [...payload.captures];
      this.captureCount = payload.captures.length;
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
    if (
      this.collapsed &&
      captures.length > this.captures.length &&
      !this.keepCollapsedForNextCaptureUpdate
    ) {
      this.collapsed = false;
    }
    this.keepCollapsedForNextCaptureUpdate = false;
    this.captures = [...captures];
    this.captureCount = captures.length;
    this.rerender();
  }

  beginEditingCapture(id: string, draft: string): void {
    this.editingCaptureId = id;
    this.editingDraft = draft;
    this.rerender();
    queueMicrotask(() => {
      const input =
        Array.from(
          this.renderRoot.shadowRoot?.querySelectorAll<HTMLInputElement>('[data-capture-input]') ??
            []
        ).find((candidate) => candidate.dataset.captureInput === id) ?? null;
      input?.focus();
    });
  }

  stopEditing(): void {
    this.editingCaptureId = null;
    this.editingDraft = '';
    this.rerender();
  }

  collapse(): void {
    this.collapsed = true;
    this.keepCollapsedForNextCaptureUpdate = true;
    this.rerender();
  }

  destroy(): void {
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    this.renderRoot.remove();
  }

  private rerender(): void {
    const shadow = this.renderRoot.shadowRoot;
    if (!shadow) {
      return;
    }
    this.resizeDisposer?.();
    this.resizeDisposer = null;
    this.previewExpansionDisposer?.();
    this.previewExpansionDisposer = null;
    const surface = this.renderSurface();
    shadow.replaceChildren(surface);
    panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
    this.resizeDisposer = bindSessionPanelResize(surface);
    this.previewExpansionDisposer = bindSessionItemPreviewExpansion(surface);
  }

  private renderSurface(): HTMLElement {
    const content = createVideoSurfaceContent({
      texts: this.texts,
      captures: this.captures,
      counter: this.formatCounter(this.captureCount),
      ...(this.destination ? { destination: this.destination } : {}),
      actions: [
        { id: 'video:finish', label: this.texts.finish, variant: 'primary' },
        { id: 'video:cancel', label: this.texts.cancel, variant: 'ghost' }
      ]
    });
    if (this.collapsed) {
      content.surfaces.video.labels.subtitle = '';
    }
    content.surfaces.video.captures = content.surfaces.video.captures.map((capture) =>
      capture.id === this.editingCaptureId
        ? { ...capture, editing: true, draft: this.editingDraft }
        : capture
    );
    const surface = renderStitchRuntimeSurface({
      surfaceId: 'video',
      appData: content,
      actions: {
        'video:add': () => this.options.callbacks.onAddCapture('button'),
        'video:add-note': () => this.options.callbacks.onAddCapture('note-input'),
        'video:finish': () => this.options.callbacks.onFinish(),
        'video:cancel': () => this.options.callbacks.onCancel(),
        'export-destination:select': (event) => {
          const id = this.resolveActionId(event, 'destinationId');
          if (id) {
            void this.options.callbacks.onSelectDestination?.(id);
          }
        },
        'session:toggleCollapse': () => {
          this.collapsed = !this.collapsed;
          this.rerender();
        },
        'resource:close': () => this.options.callbacks.onCancel(),
        'video:delete': (event) => {
          const id = this.resolveActionId(event, 'captureId');
          if (id) {
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
    this.applyCompatibilityAttributes(surface);
    this.bindCaptureInteractions(surface);
    return surface;
  }

  private applyCompatibilityAttributes(surface: HTMLElement): void {
    surface.style.pointerEvents = 'none';
    const modal = surface.querySelector<HTMLElement>('.resource-modal--session');
    modal?.classList.toggle('is-collapsed', this.collapsed);
    const surfaceWindow = surface.querySelector<HTMLElement>('.video-surface-window');
    surfaceWindow?.classList.toggle('is-collapsed', this.collapsed);
    const dialog = surface.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      dialog.dataset.element = 'dialog';
      dialog.style.pointerEvents = 'auto';
    }
    surfaceWindow?.style.setProperty('pointer-events', 'auto');
    if (this.collapsed && surfaceWindow) {
      surfaceWindow.addEventListener('click', () => {
        this.collapsed = false;
        this.rerender();
      });
    }
    surface
      .querySelector<HTMLElement>('[data-action-id="video:finish"]')
      ?.setAttribute('data-role', 'finish-btn');
    surface
      .querySelector<HTMLElement>('[data-action-id="video:cancel"]')
      ?.setAttribute('data-role', 'close-btn');
    surface
      .querySelector<HTMLElement>('[data-action-id="video:add"]')
      ?.setAttribute('data-role', 'add-btn');
    surface
      .querySelector<HTMLElement>('[data-action-id="video:add-note"]')
      ?.setAttribute('data-role', 'add-note-input');
    const collapseTrigger = surface.querySelector<HTMLButtonElement>(
      '[data-action-id="session:toggleCollapse"]'
    );
    if (collapseTrigger) {
      collapseTrigger.hidden = this.collapsed;
      collapseTrigger.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true');
      collapseTrigger.setAttribute(
        'aria-label',
        this.collapsed ? 'Expand panel' : 'Collapse panel'
      );
      collapseTrigger.textContent = this.collapsed ? '⌃' : '⌄';
    }
    surface.querySelectorAll<HTMLElement>('article[data-capture-id]').forEach((item) => {
      item.dataset.role = 'capture-item';
    });
  }

  private currentSurface(): HTMLElement | null {
    return (
      this.renderRoot.shadowRoot?.querySelector<HTMLElement>('[data-stitch-surface="video"]') ??
      null
    );
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
      input?.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        void this.options.callbacks.onSubmitCaptureEdit(id, input.value);
      });
    });
  }

  private isInteractiveCaptureTarget(target: Element | null): boolean {
    return Boolean(
      target?.closest(
        'button, input, textarea, select, a, [contenteditable="true"], [data-action-id]'
      )
    );
  }

  private formatCounter(count: number): string {
    if (count <= 0) {
      return this.texts.counterZero;
    }
    return this.texts.counter.replace('{count}', String(count));
  }
}
