import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { StorageService } from '@platform/interfaces/storage';
import type { ErrorHandler } from '@shared/errors';
import type { IClipRepository } from '@shared/repositories/IClipRepository';
import { ContentDialogHost } from '@ui/hosts/content';
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
  buildDialogPresenter,
  setInitialDialogPosition,
  renderShortcutHint,
  updateDialogPosition
} from './dialogPresenter';
import { DialogSessionState } from './dialogSessionState';
import {
  DOUBLE_ENTER_TIMEOUT,
  detectReaderMode,
  getModifierLabel,
  isModifierSubmitEvent,
  isPlainEnter,
  normalizeDialogComment
} from './dialogShortcuts';
import { clipperStyleSheetManager } from '../shared/styleSheetManager';
import { DragController } from '../shared/dragController';
import type { ReaderModeBehavior } from './dialogTypes';
import type { PopupCoordinator } from '../../runtime/popupCoordinator';

export type ClipperDialogAction = 'clip' | 'cancel' | 'reader' | 'video';

export interface ClipperDialogResult {
  action: ClipperDialogAction;
  comment: string;
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
  private dialogHost: ContentDialogHost | null = null;
  private host: HTMLElement | null = null;
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
  private unsubscribeFragmentConfig: (() => void) | null = null;

  private get keyboardShortcutsEnabled(): boolean {
    return this.sessionState.keyboardShortcutsEnabled;
  }

  constructor(deps: Partial<ClipperDialogDependencies> = {}) {
    if (deps.storage && deps.errorHandler && deps.runtime && deps.clipRepo) {
      this.storageService = deps.storage;
      this.errorHandler = deps.errorHandler;
      this.runtimeService = deps.runtime;
      this.clipRepo = deps.clipRepo;
      return;
    }

    const resolved = createClipperDialogDependencies();
    this.storageService = deps.storage ?? resolved.storage;
    this.errorHandler = deps.errorHandler ?? resolved.errorHandler;
    this.runtimeService = deps.runtime ?? resolved.runtime;
    this.clipRepo = deps.clipRepo ?? resolved.clipRepo;
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
    this.detachDragHandlers();
    this.sessionState.resetPendingEnter();

    if (this.textarea) {
      this.textarea.removeEventListener('keydown', this.onTextareaKeydown);
    }
    window.removeEventListener('keydown', this.onWindowKeydown);
    this.dialogSurface?.removeEventListener('keydown', this.onWindowKeydown);
    this.dialogHost?.destroy();
    this.dialogHost = null;
    this.dialogSurface = null;
    this.textarea = null;
    this.hintElement = null;
    this.host = null;
    delete document.documentElement.dataset.aiobClipperDialog;

    if (this.previousActiveElement) {
      const target = this.previousActiveElement;
      this.previousActiveElement = null;
      queueMicrotask(() => target.focus());
    }
  }

  destroy(): void {
    this.remove();
  }

  private async buildDialog(selectedText: string): Promise<void> {
    await ensureContentI18n(document);
    const binder = getContentI18nBinder();
    this.messages = await safeGetDialogMessages(this.errorHandler);
    this.disposeI18nHandles();

    await clipperStyleSheetManager.initialize();
    this.dialogHost?.destroy();
    this.dialogHost = new ContentDialogHost({
      title: this.getMessage('clipDialogTitle', this.getFallback('clipDialogTitle')),
      showHeader: false,
      closeOnBackdrop: false,
      closeOnEscape: false,
      trapFocus: true,
      initialFocus: '#clipper-comment-input',
      modalClassName: 'modal fixed inset-0 bg-transparent z-[2147483647]',
      modalBoxClassName:
        'obsidian-clipper-content absolute max-h-[80vh] max-w-[600px] w-[90%] translate-0 transform rounded-[14px] border border-white/20 bg-black/90 p-0 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl pointer-events-auto transition-shadow duration-200 ease-out animate-[scaleIn_0.2s_ease_0.2s_1] text-[#f2f4ff]',
      bodyClassName: 'clipper-dialog-body p-0',
      footerClassName: 'hidden',
      onClose: () => this.finalize('cancel', '')
    });

    const presenter = buildDialogPresenter({
      selectedText,
      initialComment: this.sessionState.initialComment,
      allowReaderMode: this.sessionState.allowReaderMode,
      allowVideoMode: this.sessionState.allowVideoMode,
      readerModeBehavior: this.sessionState.readerModeBehavior,
      binder,
      getFallback: (key) => this.getFallback(key),
      resolveAssetUrl: (path) => this.resolveAssetUrl(path),
      bindings: {
        applyText: (element, key, fallback, activeBinder) =>
          this.applyText(element, key, fallback, activeBinder),
        applyAttr: (element, attribute, datasetKey, key, fallback, activeBinder) =>
          this.applyAttr(element, attribute, datasetKey, key, fallback, activeBinder)
      },
      registerI18nHandles: (handles) => {
        this.i18nHandles.push(...handles);
      },
      onReader: () => this.finalize('reader', this.getCurrentComment()),
      onVideo: () => this.finalize('video', this.getCurrentComment()),
      onCancel: () => this.finalize('cancel', ''),
      onConfirm: () => this.finalize('clip', this.getCurrentComment())
    });

    this.dialogHost.setContent(presenter.content);
    this.host = this.dialogHost.render();
    this.host.id = 'obsidian-clipper-dialog';
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    clipperStyleSheetManager.applyTo(this.dialogHost.getShadowRoot());
    this.textarea = presenter.textarea;
    this.hintElement = presenter.hintElement;
    this.dialogHost.mount(document.body);
    this.dialogSurface = this.dialogHost.getDialogElement();
    setInitialDialogPosition(this.dialogSurface);
    this.dialogHost.show();
    document.documentElement.dataset.aiobClipperDialog = 'open';

    this.dragController = new DragController({
      handle: presenter.header,
      initialPosition: { x: 0, y: 0 },
      onMove: ({ x, y }) => this.updatePosition(x, y)
    });
    this.dragController.setPosition({ x: 0, y: 0 });
    this.dragController.attach();

    this.textarea?.addEventListener('keydown', this.onTextareaKeydown);
    window.addEventListener('keydown', this.onWindowKeydown);
    this.dialogSurface.addEventListener('keydown', this.onWindowKeydown);

    queueMicrotask(() => {
      this.textarea?.focus();
      this.textarea?.select();
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

  private readonly onWindowKeydown = (event: KeyboardEvent): void => {
    if (!this.dialogSurface) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.finalize('cancel', '');
      return;
    }

    if (event.altKey) {
      const step = event.shiftKey ? 40 : 20;
      switch (event.key) {
        case 'ArrowUp':
          this.updatePosition(0, -step, true);
          event.preventDefault();
          break;
        case 'ArrowDown':
          this.updatePosition(0, step, true);
          event.preventDefault();
          break;
        case 'ArrowLeft':
          this.updatePosition(-step, 0, true);
          event.preventDefault();
          break;
        case 'ArrowRight':
          this.updatePosition(step, 0, true);
          event.preventDefault();
          break;
        default:
          break;
      }
    }
  };

  private finalize(action: ClipperDialogAction, comment: string): void {
    const resolver = this.resolve;
    this.resolve = null;
    resolver?.({ action, comment });
    this.remove();
  }

  private updatePosition(deltaX: number, deltaY: number, relative = false): void {
    if (!this.dialogSurface) {
      return;
    }

    const nextPosition = updateDialogPosition(this.dialogSurface, deltaX, deltaY, relative);
    this.dragController?.setPosition(nextPosition);
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
