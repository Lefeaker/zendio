import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import type { UiMountable } from '@ui/hosts/shared/contract';
import type { PopupCoordinator } from '@content/runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '@content/runtime/popupCoordinatorAccess';
import { createReaderSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';
import { bindSessionPanelResize } from '@content/shared/panels/sessionPanelResize';
import { bindSessionItemPreviewExpansion } from '@content/shared/panels/sessionItemPreviewExpansion';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

interface ReaderDialogPanelOptions {
  callbacks: ReaderPanelCallbacks;
  texts: ReaderPanelTexts;
  resolveAssetUrl?: (path: string) => string;
}

export class ReaderDialogPanel
  implements
    UiMountable<
      HTMLElement | undefined,
      | {
          texts?: ReaderPanelTexts;
          count?: number;
          hint?: string;
          highlights?: ReaderPanelHighlight[];
        }
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
  private texts: ReaderPanelTexts;
  private highlights: ReaderPanelHighlight[] = [];
  private destination: ExportDestinationSurfacePreview | undefined;
  private highlightCount = 0;
  private editingHighlightId: string | null = null;
  private collapsed = false;

  constructor(private readonly options: ReaderDialogPanelOptions) {
    this.texts = options.texts;
    this.popupCoordinator = resolveContentPopupCoordinator();
    this.renderRoot = document.createElement('div');
    this.renderRoot.id = 'aiob-reader-panel';
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
      const previousCount = this.highlights.length;
      if (this.collapsed && payload.highlights.length > this.highlights.length) {
        this.collapsed = false;
      }
      this.highlights = [...payload.highlights];
      this.highlightCount = payload.highlights.length;
      const newestHighlight =
        payload.highlights.length > previousCount ? payload.highlights.at(-1) : undefined;
      this.rerender();
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
    const previousCount = this.highlights.length;
    if (this.collapsed && highlights.length > this.highlights.length) {
      this.collapsed = false;
    }
    this.highlights = [...highlights];
    this.highlightCount = highlights.length;
    const newestHighlight = highlights.length > previousCount ? highlights.at(-1) : undefined;
    this.rerender();
    this.focusHighlightNoteInput(newestHighlight?.id);
  }

  stopEditing(): void {
    this.editingHighlightId = null;
    this.rerender();
  }

  isEditing(): boolean {
    return this.editingHighlightId !== null;
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
    const content = createReaderSurfaceContent({
      texts: this.texts,
      highlights: this.highlights.map((highlight) => ({
        ...highlight,
        comment: this.editingHighlightId === highlight.id ? highlight.comment : highlight.comment
      })),
      counter: this.formatCounter(this.highlightCount),
      iconUrl: this.resolveAssetUrl('icons/60x60/allinob_icon_readingt.png'),
      ...(this.destination ? { destination: this.destination } : {}),
      actions: [
        { id: 'reader:finish', label: this.texts.finish, variant: 'primary' },
        { id: 'reader:cancel', label: this.texts.cancel, variant: 'ghost' }
      ]
    });
    if (this.collapsed) {
      content.surfaces.reader.labels.subtitle = '';
    }
    const surface = renderStitchRuntimeSurface({
      surfaceId: 'reader',
      appData: content,
      actions: {
        'reader:finish': () => this.options.callbacks.onFinish(),
        'reader:cancel': () => this.options.callbacks.onCancel(),
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
        'reader:delete': (event) => {
          const id = this.resolveActionId(event, 'highlightId');
          if (id) {
            this.options.callbacks.onDeleteHighlight(id);
          }
        },
        'reader:save': (event) => {
          const id = this.resolveActionId(event, 'highlightId');
          const input = id
            ? surface.querySelector<HTMLInputElement>(`[data-highlight-input="${CSS.escape(id)}"]`)
            : null;
          if (id && input) {
            void this.options.callbacks.onSubmitHighlightEdit(id, input.value);
          }
        }
      }
    });
    this.applyCompatibilityAttributes(surface);
    this.bindHighlightInteractions(surface);
    return surface;
  }

  private resolveAssetUrl(path: string): string {
    try {
      return this.options.resolveAssetUrl?.(path) ?? path;
    } catch {
      return path;
    }
  }

  private applyCompatibilityAttributes(surface: HTMLElement): void {
    surface.style.pointerEvents = 'none';
    const modal = surface.querySelector<HTMLElement>('.resource-modal--session');
    modal?.classList.toggle('is-collapsed', this.collapsed);
    const surfaceWindow = surface.querySelector<HTMLElement>('.reader-surface-window');
    surfaceWindow?.classList.toggle('is-collapsed', this.collapsed);
    const dialog = surface.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      dialog.dataset.role = 'dialog-title';
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
      .querySelector<HTMLElement>('[data-action-id="reader:finish"]')
      ?.setAttribute('data-role', 'export-btn');
    surface
      .querySelector<HTMLElement>('[data-action-id="reader:cancel"]')
      ?.setAttribute('data-role', 'close-btn');
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
    surface.querySelectorAll<HTMLElement>('article[data-highlight-id]').forEach((item) => {
      item.dataset.role = 'highlight-item';
    });
  }

  private currentSurface(): HTMLElement | null {
    return (
      this.renderRoot.shadowRoot?.querySelector<HTMLElement>('[data-stitch-surface="reader"]') ??
      null
    );
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

  private bindHighlightInteractions(surface: HTMLElement): void {
    surface.querySelectorAll<HTMLElement>('[data-highlight-id]').forEach((item) => {
      const id = item.dataset.highlightId;
      if (!id) {
        return;
      }
      item.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (this.isInteractiveHighlightTarget(target)) {
          return;
        }
        this.options.callbacks.onFocusHighlight(id);
      });
      const input = item.querySelector<HTMLInputElement>('[data-highlight-input]');
      input?.addEventListener('focus', () => {
        this.editingHighlightId = id;
      });
      input?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        void this.options.callbacks.onSubmitHighlightEdit(id, input.value);
      });
    });
  }

  private focusHighlightNoteInput(highlightId: string | undefined): void {
    if (!highlightId) {
      return;
    }
    const input = Array.from(
      this.renderRoot.shadowRoot?.querySelectorAll<HTMLInputElement>('[data-highlight-input]') ?? []
    ).find((element) => element.dataset.highlightInput === highlightId);
    input?.focus();
  }

  private isInteractiveHighlightTarget(target: Element | null): boolean {
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
