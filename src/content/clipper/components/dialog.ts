import type { I18nBinder, I18nBindingHandle, Messages } from '@i18n';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { StorageService } from '@platform/interfaces/storage';
import { contentErrors, type ErrorHandler } from '@shared/errors';
import type { IClipRepository, FragmentConfig } from '@shared/repositories/IClipRepository';
import { ensureContentI18n, getContentI18nBinder, getContentMessages } from '../../i18n/context';
import { FocusTrapController } from '../../shared/focusTrap';
import { createClipperDialogDependencies, type ClipperDialogDependencies } from './dialogDependencies';
import {
  addButtonShortcutHints,
  applyReadonlyTextareaPresentation,
  buildDialogPresenter,
  renderShortcutHint,
  updateDialogPosition
} from './dialogPresenter';
import { DialogSessionState } from './dialogSessionState';
import {
  DOUBLE_ENTER_TIMEOUT,
  SHORTCUT_USAGE_THRESHOLD,
  USAGE_COUNT_STORAGE_KEY,
  detectReaderMode,
  getModifierLabel,
  isModifierSubmitEvent,
  isPlainEnter,
  normalizeDialogComment
} from './dialogShortcuts';
import { clipperStyleSheetManager } from '../shared/styleSheetManager';
import type { DialogRegistry } from '../shared/dialogRegistry';
import { DragController } from '../shared/dragController';
import type { ReaderModeBehavior } from './dialogTypes';

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
  dialogRegistry?: DialogRegistry;
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
  private host: HTMLDivElement | null = null;
  private shadowRootRef: ShadowRoot | null = null;
  private renderRoot: ShadowRoot | HTMLElement | null = null;
  private dialog: HTMLDivElement | null = null;
  private content: HTMLDivElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private hintElement: HTMLDivElement | null = null;
  private focusTrap: FocusTrapController | null = null;
  private dragController: DragController | null = null;
  private previousActiveElement: HTMLElement | null = null;
  private resolve: ((result: ClipperDialogResult) => void) | null = null;
  private i18nHandles: I18nBindingHandle[] = [];
  private dialogRegistry: DialogRegistry | null = null;
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

    await this.loadShortcutUsageCount();
    await this.initializeFragmentConfig();
    this.subscribeToFragmentConfig();

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
    this.focusTrap?.deactivate();
    this.focusTrap = null;
    this.sessionState.resetPendingEnter();

    if (this.textarea) {
      this.textarea.removeEventListener('keydown', this.onTextareaKeydown);
    }
    window.removeEventListener('keydown', this.onWindowKeydown);
    this.dialog?.removeEventListener('keydown', this.onWindowKeydown);

    this.dialog?.remove();
    this.dialog = null;
    this.content = null;
    this.textarea = null;
    this.hintElement = null;

    if (this.shadowRootRef) {
      this.shadowRootRef.innerHTML = '';
      this.shadowRootRef = null;
    }

    if (this.host) {
      this.host.remove();
      this.host = null;
    }

    this.renderRoot = null;
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
    this.messages = await this.safeGetMessages();
    this.disposeI18nHandles();

    await clipperStyleSheetManager.initialize();

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

    this.host = presenter.host;
    this.shadowRootRef = presenter.shadowRoot;
    clipperStyleSheetManager.applyTo(this.shadowRootRef);
    this.renderRoot = this.shadowRootRef;
    this.dialog = presenter.dialog;
    this.content = presenter.content;
    this.textarea = presenter.textarea;
    this.hintElement = presenter.hintElement;

    document.body.appendChild(this.host);
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
    this.dialog.addEventListener('keydown', this.onWindowKeydown);

    this.activateFocusTrap();

    queueMicrotask(() => {
      this.textarea?.focus();
      this.textarea?.select();
    });
  }

  private activateFocusTrap(): void {
    if (!this.content) {
      return;
    }

    this.focusTrap?.deactivate();
    const container = this.content;

    this.focusTrap = new FocusTrapController(container, {
      initialFocus: '#clipper-comment-input',
      fallbackFocus: container,
      escapeDeactivates: false,
      clickOutsideDeactivates: false,
      returnFocusOnDeactivate: false,
      onActivate: () => {
        container.setAttribute('data-focus-trap-active', 'true');
      },
      onDeactivate: () => {
        container.removeAttribute('data-focus-trap-active');
      }
    });

    this.focusTrap.activate();
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
        void this.incrementShortcutUsage();
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
    if (!this.dialog) {
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
    if (!this.content) {
      return;
    }

    const nextPosition = updateDialogPosition(this.content, deltaX, deltaY, relative);
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
    if (!this.dialog) {
      return;
    }

    addButtonShortcutHints(this.dialog, {
      doubleEnterAction: this.getMessage(
        'clipperShortcutDoubleEnter',
        this.getFallback('clipperShortcutDoubleEnter')
      ),
      modifierAction: this.getMessage(
        'clipperShortcutModifierEnter',
        getModifierLabel('button')
      ),
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
      void this.incrementShortcutUsage();
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

  private async loadShortcutUsageCount(): Promise<void> {
    try {
      const stored = await this.storageService.local.get<number>(USAGE_COUNT_STORAGE_KEY);
      this.sessionState.shortcutUsageCount = stored ?? 0;
    } catch (error) {
      const appError = contentErrors.storageOperationFailed(
        'load',
        USAGE_COUNT_STORAGE_KEY,
        { component: 'ClipperDialog', action: 'loadShortcutUsageCount' },
        { cause: error }
      );
      await this.errorHandler.handle(appError, { suppressNotifications: true });
      this.sessionState.shortcutUsageCount = 0;
    }
  }

  private async saveShortcutUsageCount(): Promise<void> {
    try {
      await this.storageService.local.set(
        USAGE_COUNT_STORAGE_KEY,
        this.sessionState.shortcutUsageCount
      );
    } catch (error) {
      const appError = contentErrors.storageOperationFailed(
        'save',
        USAGE_COUNT_STORAGE_KEY,
        {
          component: 'ClipperDialog',
          action: 'saveShortcutUsageCount',
          value: this.sessionState.shortcutUsageCount
        },
        { cause: error }
      );
      await this.errorHandler.handle(appError, { suppressNotifications: true });
    }
  }

  private async incrementShortcutUsage(): Promise<void> {
    this.sessionState.shortcutUsageCount += 1;
    if (this.sessionState.shortcutUsageCount <= SHORTCUT_USAGE_THRESHOLD) {
      await this.saveShortcutUsageCount();
    }
  }

  private async safeGetMessages(): Promise<Messages | null> {
    try {
      return await getContentMessages();
    } catch (error) {
      const appError = contentErrors.componentInitializationFailed(
        'content-messages',
        { component: 'ClipperDialog', action: 'getContentMessages' },
        { cause: error }
      );
      await this.errorHandler.handle(appError, { suppressNotifications: true });
      return null;
    }
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

  private applyFragmentConfig(config: FragmentConfig): void {
    this.sessionState.keyboardShortcutsEnabled = config.keyboardShortcutsEnabled;
  }

  private async initializeFragmentConfig(): Promise<void> {
    try {
      const config = await this.clipRepo.getFragmentConfig();
      this.applyFragmentConfig(config);
    } catch (error) {
      const appError = contentErrors.componentInitializationFailed(
        'fragment-config',
        { component: 'ClipperDialog', action: 'initializeFragmentConfig' },
        { cause: error }
      );
      await this.errorHandler.handle(appError, { suppressNotifications: true });
      this.sessionState.keyboardShortcutsEnabled = true;
    }
  }

  private subscribeToFragmentConfig(): void {
    this.unsubscribeFragmentConfig?.();
    this.unsubscribeFragmentConfig = this.clipRepo.onConfigChange((config) => {
      this.applyFragmentConfig(config);
    });
  }
}
