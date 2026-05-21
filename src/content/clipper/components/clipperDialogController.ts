import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { StorageService } from '@platform/interfaces/storage';
import type { ErrorHandler } from '@shared/errors';
import type { IClipRepository } from '@shared/repositories/IClipRepository';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { ClipPayload } from '@shared/types';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import { ensureContentI18n, getContentI18nBinder } from '../../i18n/context';
import {
  createClipperDialogDependencies,
  type ClipperDialogDependencies
} from './dialogDependencies';
import {
  incrementShortcutUsage,
  initializeDialogFragmentConfig,
  loadShortcutUsageCount,
  safeGetDialogMessages,
  subscribeToDialogFragmentConfig
} from './dialogServices';
import {
  addButtonShortcutHints,
  applyReadonlyTextareaPresentation,
  renderShortcutHint,
  updateDialogPosition
} from './dialogPresenter';
import { ContentExportDestinationState } from '@content/shared/exportDestinationState';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import { DialogSessionState } from './dialogSessionState';
import {
  DOUBLE_ENTER_TIMEOUT,
  detectReaderMode,
  getModifierLabel,
  isModifierSubmitEvent,
  isPlainEnter,
  normalizeDialogComment
} from './dialogShortcuts';
import { DragController } from '../shared/dragController';
import type { ReaderModeBehavior } from './dialogTypes';
import type { PopupCoordinator } from '../../runtime/popupCoordinator';
import { generateClipperTitle } from '../utils/datetime';
import { mountClipperDialogHost, unmountClipperDialogHost } from './clipperDialogHostAdapter';
import { resolveClipperDialogKeyboardMove } from './clipperDialogInteractionController';
import {
  buildClipperDialogSurface,
  resolveSelectionPreviewLabel
} from './clipperDialogSurfaceAdapter';

export type ClipperDialogAction = 'clip' | 'cancel' | 'reader' | 'video';

export interface ClipperDialogResult {
  action: ClipperDialogAction;
  comment: string;
  destination?: ExportDestinationMetadata;
}

export interface ClipperDialogOptions {
  allowReaderMode?: boolean;
  readerModeBehavior?: ReaderModeBehavior;
  allowVideoMode?: boolean;
  initialComment?: string;
  dialogRegistry?: PopupCoordinator;
  storageService?: StorageService;
  errorHandler?: ErrorHandler;
}

const FALLBACK_MESSAGES: Partial<Messages> = {
  clipDialogTitle: 'Clip Selection',
  clipDialogInstructions:
    'Use Tab to move between controls. Press Alt + Arrow keys to reposition the dialog.',
  cancelButton: 'Cancel',
  clipButton: 'Save',
  openReaderButton: 'Open reader',
  addToReaderButton: 'Add to reader',
  openVideoModeButton: 'Enter video mode',
  commentLabel: 'Comment',
  commentPlaceholder: 'Add a note',
  clipperCommentEditCompleted: '批注编辑已完成，可以使用快捷键来完成以下操作：',
  clipperShortcutHintDoubleEnter: '双击回车',
  clipperShortcutDoubleEnter: '双击 ↵',
  clipperShortcutHintModifierEnter: '直接剪藏',
  clipperShortcutModifierEnter: 'Cmd ↵',
  clipperShortcutHintEscape: '取消',
  clipperShortcutEsc: 'Esc',
  clipperShortcutSetupLink: '设置快捷键，使用更丝滑'
};

export class ClipperDialog {
  readonly popupLifecycle = { preserveOnTransientClose: true };

  private host: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private dialogSurface: HTMLDivElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private hintElement: HTMLDivElement | null = null;
  private dragController: DragController | null = null;
  private previousActiveElement: HTMLElement | null = null;
  private resolve: ((result: ClipperDialogResult) => void) | null = null;
  private i18nHandles: I18nBindingHandle[] = [];
  private dialogRegistry: PopupCoordinator | null = null;
  private unregisterDialog: (() => void) | null = null;
  private messages: Messages | null = null;
  private readonly sessionState = new DialogSessionState();

  private storageService: StorageService;
  private errorHandler: ErrorHandler;
  private runtimeService: RuntimeService;
  private clipRepo: IClipRepository;
  private optionsRepository: IOptionsRepository;
  private destinationState: ContentExportDestinationState | null = null;
  private selectedText = '';
  private unsubscribeFragmentConfig: (() => void) | null = null;

  private get keyboardShortcutsEnabled(): boolean {
    return this.sessionState.keyboardShortcutsEnabled;
  }

  constructor(deps: Partial<ClipperDialogDependencies> = {}) {
    if (
      deps.storage &&
      deps.errorHandler &&
      deps.runtime &&
      deps.clipRepo &&
      deps.optionsRepository
    ) {
      this.storageService = deps.storage;
      this.errorHandler = deps.errorHandler;
      this.runtimeService = deps.runtime;
      this.clipRepo = deps.clipRepo;
      this.optionsRepository = deps.optionsRepository;
      return;
    }

    const resolved = createClipperDialogDependencies();
    this.storageService = deps.storage ?? resolved.storage;
    this.errorHandler = deps.errorHandler ?? resolved.errorHandler;
    this.runtimeService = deps.runtime ?? resolved.runtime;
    this.clipRepo = deps.clipRepo ?? resolved.clipRepo;
    this.optionsRepository = deps.optionsRepository ?? resolved.optionsRepository;
  }

  async show(selectedText: string, options?: ClipperDialogOptions): Promise<ClipperDialogResult> {
    if (options?.storageService) {
      this.storageService = options.storageService;
    }
    if (options?.errorHandler) {
      this.errorHandler = options.errorHandler;
    }

    this.sessionState.applyOptions(options);
    this.dialogRegistry = options?.dialogRegistry ?? null;
    this.selectedText = selectedText;
    this.destinationState = new ContentExportDestinationState(
      this.optionsRepository,
      () => this.createDestinationPayload(),
      this.runtimeService.getURL('options/index.html#storage')
    );

    await loadShortcutUsageCount(this.sessionState, this.storageService, this.errorHandler);
    await initializeDialogFragmentConfig({
      clipRepo: this.clipRepo,
      state: this.sessionState,
      errorHandler: this.errorHandler
    });
    this.unsubscribeFragmentConfig = subscribeToDialogFragmentConfig({
      clipRepo: this.clipRepo,
      state: this.sessionState,
      previous: this.unsubscribeFragmentConfig
    });

    if (this.dialogRegistry) {
      this.unregisterDialog = this.dialogRegistry.register(this);
    } else {
      const existing = document.getElementById('obsidian-clipper-dialog');
      if (existing) {
        existing.remove();
        delete document.documentElement.dataset.aiobClipperDialog;
      }
    }

    this.previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.sessionState.inReaderMode = detectReaderMode(document);

    await this.buildDialog(selectedText);
    this.attachLifecycleEventListeners();
    this.sessionState.shortcutsTemporarilyActivated = false;
    this.sessionState.resetPendingEnter();

    return new Promise<ClipperDialogResult>((resolve) => {
      this.resolve = resolve;
    });
  }

  remove(): void {
    this.unsubscribeFragmentConfig?.();
    this.unsubscribeFragmentConfig = null;
    if (this.unregisterDialog) {
      this.unregisterDialog();
      this.unregisterDialog = null;
    }

    this.disposeI18nHandles();
    this.detachDialogEventListeners();
    this.sessionState.resetPendingEnter();

    unmountClipperDialogHost(this.host);
    this.shadowRoot = null;
    this.host = null;
    this.destinationState = null;
    delete document.documentElement.dataset.aiobClipperDialog;

    if (this.previousActiveElement) {
      const target = this.previousActiveElement;
      this.previousActiveElement = null;
      queueMicrotask(() => target.focus());
    }
  }

  close(): void {
    this.finalize('cancel', '');
  }

  destroy(): void {
    this.remove();
  }

  private readonly onPageHide = (): void => {
    this.closeRegisteredPopups();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.closeRegisteredPopups();
    }
  };

  private closeRegisteredPopups(): void {
    if (this.dialogRegistry) {
      this.dialogRegistry.closeAll();
      return;
    }
    this.close();
  }

  private async buildDialog(selectedText: string): Promise<void> {
    await ensureContentI18n(document);
    const binder = getContentI18nBinder();
    this.messages = await safeGetDialogMessages(this.errorHandler);
    this.disposeI18nHandles();
    const sourceUrl = document.location.href;
    const sourceHost = document.location.hostname || 'current page';
    const sourceTitle = document.title || sourceUrl;
    const sourceInitials =
      sourceHost
        .split('.')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 3) || 'PG';

    this.detachDialogEventListeners();
    unmountClipperDialogHost(this.host);
    const destination = await this.destinationState?.refresh();

    const surface = buildClipperDialogSurface({
      selectedText,
      iconUrl: this.resolveAssetUrl('icons/60x60/allinob_icon_clipt.png'),
      commentPlaceholder: this.getMessage(
        'commentPlaceholder',
        this.getFallback('commentPlaceholder')
      ),
      labels: {
        title: this.getMessage('clipDialogTitle', this.getFallback('clipDialogTitle')),
        selectionPreview: resolveSelectionPreviewLabel(this.messages),
        commentLabel: this.getMessage('commentLabel', this.getFallback('commentLabel'))
      },
      source: {
        title: sourceTitle,
        host: sourceHost,
        initials: sourceInitials,
        verifiedLabel: sourceUrl
      },
      ...(destination ? { destination } : {}),
      actions: [
        ...(this.sessionState.allowReaderMode
          ? [
              {
                id: 'reader' as const,
                label:
                  this.sessionState.readerModeBehavior === 'append'
                    ? this.getMessage('addToReaderButton', this.getFallback('addToReaderButton'))
                    : this.getMessage('openReaderButton', this.getFallback('openReaderButton')),
                variant: 'secondary' as const
              }
            ]
          : []),
        ...(this.sessionState.allowVideoMode
          ? [
              {
                id: 'video' as const,
                label: this.getMessage('openVideoModeButton', '进入视频模式'),
                variant: 'secondary' as const
              }
            ]
          : []),
        {
          id: 'clip',
          label: this.getMessage('clipButton', this.getFallback('clipButton')),
          variant: 'primary'
        }
      ],
      handlers: {
        reader: () => this.finalize('reader', this.getCurrentComment()),
        video: () => this.finalize('video', this.getCurrentComment()),
        cancel: () => this.finalize('cancel', ''),
        clip: () => this.finalize('clip', this.getCurrentComment()),
        'resource:close': () => this.finalize('cancel', ''),
        'export-destination:select': (event) => {
          const id = this.resolveDestinationId(event);
          if (!id) {
            return;
          }
          void this.selectDestination(id);
        }
      }
    });

    this.prepareStitchSurface(surface, binder);
    const hostParts = await mountClipperDialogHost(surface);
    this.host = hostParts.host;
    this.shadowRoot = hostParts.shadowRoot;
    this.textarea = surface.querySelector<HTMLTextAreaElement>('.clipper-comment-textarea');
    this.hintElement = surface.querySelector<HTMLDivElement>('.clipper-comment-completed-hint');
    this.dialogSurface =
      surface.querySelector<HTMLDivElement>('.resource-modal') ?? (surface as HTMLDivElement);

    const header = surface.querySelector<HTMLDivElement>('.clipper-dialog-header');
    if (header) {
      this.dragController = new DragController({
        handle: header,
        initialPosition: { x: 0, y: 0 },
        onMove: ({ x, y }) => this.updatePosition(x, y)
      });
      this.dragController.setPosition({ x: 0, y: 0 });
      this.dragController.attach();
    }

    this.textarea?.addEventListener('keydown', this.onTextareaKeydown);
    this.textarea?.addEventListener('input', this.onTextareaInput);
    if (this.textarea?.value.trim()) {
      this.syncTextareaHeight();
    }
    window.addEventListener('keydown', this.onWindowKeydown);
    document.addEventListener('focusin', this.onDocumentFocusIn, true);
    this.shadowRoot.addEventListener('keydown', this.onFocusTrapKeydown);
    this.dialogSurface.addEventListener('keydown', this.onWindowKeydown);

    queueMicrotask(() => {
      this.textarea?.focus();
      this.textarea?.select();
    });
  }

  private prepareStitchSurface(surface: HTMLElement, binder: I18nBinder | null): void {
    const textarea = surface.querySelector<HTMLTextAreaElement>('.clipper-comment-textarea');
    const title = surface.querySelector<HTMLElement>('.surface-window-title');
    if (title) {
      this.applyText(title, 'clipDialogTitle', this.getFallback('clipDialogTitle'), binder);
    }
    const instructions = document.createElement('p');
    instructions.id = 'clipper-dialog-instructions';
    instructions.className = 'sr-only';
    Object.assign(instructions.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0'
    });
    this.applyText(
      instructions,
      'clipDialogInstructions',
      this.getFallback('clipDialogInstructions'),
      binder
    );
    surface.appendChild(instructions);
    if (textarea) {
      textarea.id = 'clipper-comment-input';
      textarea.value = this.sessionState.initialComment;
      this.applyAttr(
        textarea,
        'aria-label',
        'i18nAriaLabel',
        'commentLabel',
        this.getFallback('commentLabel'),
        binder
      );
    }

    const bindings: Array<[string, keyof Messages]> = [
      [
        'reader',
        this.sessionState.readerModeBehavior === 'append' ? 'addToReaderButton' : 'openReaderButton'
      ],
      ['clip', 'clipButton']
    ];
    bindings.forEach(([actionId, key]) => {
      const button = surface.querySelector<HTMLElement>(`[data-action-id="${actionId}"]`);
      if (button) {
        this.applyText(
          button.querySelector<HTMLElement>('span') ?? button,
          key,
          button.textContent ?? '',
          binder
        );
      }
    });
  }

  private readonly onTextareaKeydown = (event: KeyboardEvent): void => {
    if (!this.textarea) {
      return;
    }

    if (this.handleModifierSubmit(event)) {
      return;
    }

    if (!isPlainEnter(event)) {
      this.sessionState.resetPendingEnter();
      return;
    }

    event.preventDefault();

    if (!this.sessionState.awaitingSecondEnter) {
      this.sessionState.beginPendingEnter(DOUBLE_ENTER_TIMEOUT, () => undefined);
      return;
    }

    this.sessionState.resetPendingEnter();

    if (this.sessionState.inReaderMode) {
      this.finalize('clip', this.getCurrentComment());
      return;
    }

    if (
      this.sessionState.keyboardShortcutsEnabled ||
      this.sessionState.shortcutsTemporarilyActivated
    ) {
      if (this.sessionState.shortcutsTemporarilyActivated) {
        void incrementShortcutUsage(this.sessionState, this.storageService, this.errorHandler);
      }
      this.finalize('reader', this.getCurrentComment());
      return;
    }

    this.sessionState.shortcutsTemporarilyActivated = true;
    this.makeTextareaReadonly();
    this.renderShortcutHint();
    void this.addButtonShortcutHints();
  };

  private readonly onTextareaInput = (): void => {
    this.syncTextareaHeight();
  };

  private async selectDestination(id: string): Promise<void> {
    const comment = this.getCurrentComment();
    this.destinationState?.select(id);
    this.sessionState.initialComment = comment;
    const destination = await this.destinationState?.refresh();
    const patched = this.shadowRoot
      ? patchExportDestinationRow(this.shadowRoot, destination)
      : false;
    if (!patched) {
      await this.buildDialog(this.selectedText);
    }
  }

  private syncTextareaHeight(): void {
    const textarea = this.textarea;
    if (!textarea) {
      return;
    }

    const style = getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    const padding =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const border =
      (Number.parseFloat(style.borderTopWidth) || 0) +
      (Number.parseFloat(style.borderBottomWidth) || 0);
    const oneLineHeight = Math.ceil(lineHeight + padding + border);
    const twoLineHeight = Math.ceil(lineHeight * 2 + padding + border);

    textarea.style.height = `${oneLineHeight}px`;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, oneLineHeight), twoLineHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > twoLineHeight ? 'auto' : 'hidden';
  }

  private readonly onWindowKeydown = (event: KeyboardEvent): void => {
    if (!this.dialogSurface) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.finalize('cancel', '');
      return;
    }

    const move = resolveClipperDialogKeyboardMove(event);
    if (move.handled) {
      this.updatePosition(move.deltaX, move.deltaY, true);
      event.preventDefault();
    }
  };

  private readonly onFocusTrapKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Tab') {
      return;
    }

    const focusables = this.getFocusableElements();
    if (!focusables.length) {
      event.preventDefault();
      return;
    }

    const active = this.shadowRoot?.activeElement;
    const first = focusables[0];
    const last = focusables.at(-1) ?? first;
    if (event.shiftKey) {
      if (active === first || !focusables.includes(active as HTMLElement)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !focusables.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  private readonly onDocumentFocusIn = (event: FocusEvent): void => {
    if (!this.host || !this.shadowRoot || !this.textarea) {
      return;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target instanceof Node ? event.target : null;
    if (path.includes(this.host) || (target && this.host.contains(target))) {
      return;
    }
    queueMicrotask(() => {
      if (this.textarea && this.host?.isConnected) {
        this.textarea.focus();
      }
    });
  };

  private finalize(action: ClipperDialogAction, comment: string): void {
    const resolver = this.resolve;
    this.resolve = null;
    resolver?.({
      action,
      comment,
      ...(this.destinationState?.metadata ? { destination: this.destinationState.metadata } : {})
    });
    this.remove();
  }

  private detachDialogEventListeners(): void {
    if (this.textarea) {
      this.textarea.removeEventListener('keydown', this.onTextareaKeydown);
      this.textarea.removeEventListener('input', this.onTextareaInput);
    }
    window.removeEventListener('keydown', this.onWindowKeydown);
    document.removeEventListener('focusin', this.onDocumentFocusIn, true);
    this.shadowRoot?.removeEventListener('keydown', this.onFocusTrapKeydown);
    this.dialogSurface?.removeEventListener('keydown', this.onWindowKeydown);
    this.detachDragHandlers();
    this.detachLifecycleEventListeners();
    this.textarea = null;
    this.hintElement = null;
    this.dialogSurface = null;
  }

  private attachLifecycleEventListeners(): void {
    window.addEventListener('pagehide', this.onPageHide, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private detachLifecycleEventListeners(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private createDestinationPayload(): ClipPayload {
    const url = document.location.href;
    const parsedDomain = document.location.hostname || undefined;
    const pageTitle = document.title || parsedDomain || 'Untitled';
    return {
      markdown: this.selectedText || pageTitle,
      title: generateClipperTitle(pageTitle, new Date()),
      type: 'clipper',
      meta: {
        url,
        sourceUrl: url,
        resolvedUrl: url,
        ...(parsedDomain ? { domain: parsedDomain } : {})
      }
    };
  }

  private resolveDestinationId(event: Event | undefined): string | null {
    const target = event?.currentTarget ?? event?.target;
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    return target.dataset.destinationId ?? null;
  }

  private updatePosition(deltaX: number, deltaY: number, relative = false): void {
    if (!this.dialogSurface) {
      return;
    }

    const nextPosition = updateDialogPosition(this.dialogSurface, deltaX, deltaY, relative);
    this.dragController?.setPosition(nextPosition);
  }

  private getFocusableElements(): HTMLElement[] {
    const root = this.shadowRoot;
    if (!root) {
      return [];
    }
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  }

  private makeTextareaReadonly(): void {
    if (!this.textarea) {
      return;
    }

    applyReadonlyTextareaPresentation(this.textarea);
  }

  private renderShortcutHint(): void {
    if (!this.hintElement) {
      return;
    }

    renderShortcutHint(this.hintElement, {
      header: this.getMessage(
        'clipperCommentEditCompleted',
        this.getFallback('clipperCommentEditCompleted')
      ),
      doubleEnterLabel: this.getMessage(
        'clipperShortcutHintDoubleEnter',
        this.getFallback('clipperShortcutHintDoubleEnter')
      ),
      doubleEnterAction: this.getMessage(
        'clipperShortcutDoubleEnter',
        this.getFallback('clipperShortcutDoubleEnter')
      ),
      modifierAction: this.getMessage(
        'clipperShortcutHintModifierEnter',
        this.getFallback('clipperShortcutHintModifierEnter')
      ),
      escapeAction: this.getMessage(
        'clipperShortcutHintEscape',
        this.getFallback('clipperShortcutHintEscape')
      )
    });
    this.hintElement.style.display = '';
  }

  private addButtonShortcutHints(): void {
    if (!this.dialogSurface) {
      return;
    }

    addButtonShortcutHints(this.dialogSurface, {
      doubleEnterAction: this.getMessage(
        'clipperShortcutDoubleEnter',
        this.getFallback('clipperShortcutDoubleEnter')
      ),
      modifierAction: this.getMessage('clipperShortcutModifierEnter', getModifierLabel('button')),
      escapeAction: this.getMessage('clipperShortcutEsc', this.getFallback('clipperShortcutEsc'))
    });
  }

  private handleModifierSubmit(event: KeyboardEvent): boolean {
    if (!this.textarea || !isModifierSubmitEvent(event)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    if (this.sessionState.shortcutsTemporarilyActivated) {
      void incrementShortcutUsage(this.sessionState, this.storageService, this.errorHandler);
    }
    this.finalize('clip', this.getCurrentComment());
    return true;
  }

  private getCurrentComment(): string {
    if (!this.textarea) {
      return '';
    }

    return normalizeDialogComment(this.textarea.value);
  }

  private resolveAssetUrl(path: string): string {
    try {
      return this.runtimeService.getURL(path);
    } catch {
      return path;
    }
  }

  private getFallback<Key extends keyof Messages>(key: Key): string {
    return (FALLBACK_MESSAGES[key] as string) ?? '';
  }

  private getMessage<Key extends keyof Messages>(key: Key, fallback: string): string {
    const source = this.messages?.[key];
    if (typeof source === 'string' && source.length > 0) {
      return source;
    }
    return fallback;
  }

  private applyText(
    element: HTMLElement,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ): void {
    element.textContent = fallback;
    element.dataset.i18n = key;
    if (binder) {
      this.i18nHandles.push(binder.bindText(element, key));
    }
  }

  private applyAttr(
    element: HTMLElement,
    attribute: string,
    datasetKey: string,
    key: keyof Messages,
    fallback: string,
    binder: I18nBinder | null
  ): void {
    element.setAttribute(attribute, fallback);
    (element.dataset as Record<string, string>)[datasetKey] = key;
    if (binder) {
      this.i18nHandles.push(binder.bindAttr(element, attribute, key));
    }
  }

  private disposeI18nHandles(): void {
    if (!this.i18nHandles.length) {
      return;
    }

    for (const handle of this.i18nHandles) {
      handle.dispose();
    }
    this.i18nHandles.length = 0;
  }

  private detachDragHandlers(): void {
    this.dragController?.detach();
    this.dragController = null;
  }
}
