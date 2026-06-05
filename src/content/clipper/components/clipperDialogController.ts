import type { I18nBindingHandle, Messages } from '@i18n';
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
import { updateDialogPosition } from './dialogPresenter';
import { restoreContentDialogFocus } from '@ui/hosts/content/contentDialogFocus';
import { ContentExportDestinationState } from '@content/shared/exportDestinationState';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import { DialogSessionState } from './dialogSessionState';
import {
  DOUBLE_ENTER_TIMEOUT,
  detectReaderMode,
  isModifierSubmitEvent,
  isPlainEnter,
  normalizeDialogComment
} from './dialogShortcuts';
import { DragController } from '../shared/dragController';
import type { ReaderModeBehavior } from './dialogTypes';
import type { PopupCoordinator } from '../../runtime/popupCoordinator';
import { mountClipperDialogHost, unmountClipperDialogHost } from './clipperDialogHostAdapter';
import { resolveClipperDialogKeyboardMove } from './clipperDialogInteractionController';
import { buildClipperDialogSurface } from './clipperDialogSurfaceAdapter';
import {
  createClipperDestinationPayload,
  createClipperDialogActions,
  createClipperDialogLabels,
  createClipperDialogSourceContext,
  resolveClipperDestinationId
} from './clipperDialogBuildContext';
import {
  disposeClipperDialogI18nHandles,
  getClipperDialogFallback,
  prepareClipperDialogI18nSurface,
  resolveClipperDialogMessage
} from './clipperDialogI18nBindings';
import {
  createClipperDialogLifecycleListeners,
  type ClipperDialogLifecycleListeners
} from './clipperDialogLifecycleListeners';
import {
  addClipperButtonShortcutHints,
  makeClipperTextareaReadonly,
  renderClipperShortcutHint,
  syncClipperTextareaHeight
} from './clipperDialogShortcutPresentation';

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
  private readonly lifecycleListeners: ClipperDialogLifecycleListeners;

  private get keyboardShortcutsEnabled(): boolean {
    return this.sessionState.keyboardShortcutsEnabled;
  }

  constructor(deps: Partial<ClipperDialogDependencies> = {}) {
    this.lifecycleListeners = createClipperDialogLifecycleListeners({
      getDocument: () => document,
      getWindow: () => window,
      getHost: () => this.host,
      getShadowRoot: () => this.shadowRoot,
      getDialogSurface: () => this.dialogSurface,
      getTextarea: () => this.textarea,
      onTextareaKeydown: this.onTextareaKeydown,
      onTextareaInput: this.onTextareaInput,
      onWindowKeydown: this.onWindowKeydown,
      closeRegisteredPopups: () => this.closeRegisteredPopups()
    });

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
    this.lifecycleListeners.attachLifecycleEventListeners();
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
      restoreContentDialogFocus(target);
    }
  }

  close(): void {
    this.finalize('cancel', '');
  }

  destroy(): void {
    this.remove();
  }

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
    const source = createClipperDialogSourceContext(document);

    this.detachDialogEventListeners();
    unmountClipperDialogHost(this.host);
    const destination = await this.destinationState?.refresh();

    const surface = buildClipperDialogSurface({
      selectedText,
      iconUrl: this.resolveAssetUrl('icons/60x60/zendio_icon_clipt.png'),
      commentPlaceholder: this.getMessage(
        'commentPlaceholder',
        this.getFallback('commentPlaceholder')
      ),
      labels: createClipperDialogLabels({
        messages: this.messages,
        getMessage: (key, fallback) => this.getMessage(key, fallback),
        getFallback: (key) => this.getFallback(key)
      }),
      source,
      ...(destination ? { destination } : {}),
      actions: createClipperDialogActions({
        allowReaderMode: this.sessionState.allowReaderMode,
        readerModeBehavior: this.sessionState.readerModeBehavior,
        allowVideoMode: this.sessionState.allowVideoMode,
        getMessage: (key, fallback) => this.getMessage(key, fallback),
        getFallback: (key) => this.getFallback(key)
      }),
      handlers: {
        reader: () => this.finalize('reader', this.getCurrentComment()),
        video: () => this.finalize('video', this.getCurrentComment()),
        cancel: () => this.finalize('cancel', ''),
        clip: () => this.finalize('clip', this.getCurrentComment()),
        'resource:close': () => this.finalize('cancel', ''),
        'export-destination:select': (event) => {
          const id = resolveClipperDestinationId(event);
          if (!id) {
            return;
          }
          void this.selectDestination(id);
        }
      }
    });

    prepareClipperDialogI18nSurface({
      surface,
      binder,
      handles: this.i18nHandles,
      initialComment: this.sessionState.initialComment,
      readerModeBehavior: this.sessionState.readerModeBehavior,
      getFallback: (key) => this.getFallback(key)
    });
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

    if (this.textarea?.value.trim()) {
      this.syncTextareaHeight();
    }
    this.lifecycleListeners.attachDialogEventListeners();

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
    syncClipperTextareaHeight(this.textarea);
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
    this.lifecycleListeners.detachDialogEventListeners();
    this.detachDragHandlers();
    this.lifecycleListeners.detachLifecycleEventListeners();
    this.textarea = null;
    this.hintElement = null;
    this.dialogSurface = null;
  }

  private createDestinationPayload(): ClipPayload {
    return createClipperDestinationPayload(document, this.selectedText);
  }

  private updatePosition(deltaX: number, deltaY: number, relative = false): void {
    if (!this.dialogSurface) {
      return;
    }

    const nextPosition = updateDialogPosition(this.dialogSurface, deltaX, deltaY, relative);
    this.dragController?.setPosition(nextPosition);
  }

  private makeTextareaReadonly(): void {
    makeClipperTextareaReadonly(this.textarea);
  }

  private renderShortcutHint(): void {
    renderClipperShortcutHint(this.hintElement, {
      getMessage: (key, fallback) => this.getMessage(key, fallback),
      getFallback: (key) => this.getFallback(key)
    });
  }

  private addButtonShortcutHints(): void {
    addClipperButtonShortcutHints(this.dialogSurface, {
      getMessage: (key, fallback) => this.getMessage(key, fallback),
      getFallback: (key) => this.getFallback(key)
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
    return getClipperDialogFallback(key);
  }

  private getMessage<Key extends keyof Messages>(key: Key, fallback: string): string {
    return resolveClipperDialogMessage(this.messages, key, fallback);
  }

  private disposeI18nHandles(): void {
    disposeClipperDialogI18nHandles(this.i18nHandles);
  }

  private detachDragHandlers(): void {
    this.dragController?.detach();
    this.dragController = null;
  }
}
