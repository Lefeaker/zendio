const ESCAPE_KEY = 'Escape';

type CleanupFn = () => void;
type MaybePromise = void | Promise<void>;

export interface ModalBindingConfig {
  triggerId: string;
  modalId: string;
  closeSelector?: string;
  onOpen?: () => MaybePromise;
  onClose?: () => MaybePromise;
}

export interface ModalControllerOptions {
  bindings?: ModalBindingConfig[];
  document?: Document | null;
  window?: Window | null;
}

const DEFAULT_BINDINGS: ModalBindingConfig[] = [
  { triggerId: 'supportLink', modalId: 'supportModal' },
  { triggerId: 'suggestionsLink', modalId: 'suggestionsModal' },
  { triggerId: 'contactLink', modalId: 'contactModal' },
  { triggerId: 'versionLink', modalId: 'changelogModal' }
];

export class ModalController {
  private readonly document: Document | null;
  private readonly window: Window | null;
  private readonly cleanupFns: CleanupFn[] = [];
  private readonly openModals = new Set<HTMLElement>();
  private readonly modalConfigMap = new Map<HTMLElement, ModalBindingConfig>();
  private disposed = false;

  constructor(options: ModalControllerOptions = {}) {
    this.document = options.document ?? (typeof document !== 'undefined' ? document : null);
    this.window = options.window ?? this.document?.defaultView ?? (typeof window !== 'undefined' ? window : null);

    if (!this.document) {
      return;
    }

    const bindings = options.bindings && options.bindings.length > 0 ? options.bindings : DEFAULT_BINDINGS;
    this.initialize(bindings);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    while (this.cleanupFns.length) {
      try {
        this.cleanupFns.pop()?.();
      } catch (error) {
        console.error('[options][modalManager] 清理模态框事件时出错:', error);
      }
    }

    this.openModals.clear();
    this.modalConfigMap.clear();
  }

  private initialize(bindings: ModalBindingConfig[]): void {
    const documentRef = this.document;
    if (!documentRef) {
      return;
    }
    const prefersReducedMotion =
      this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const showModalElement = (modal: HTMLElement): void => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      modal.setAttribute('aria-hidden', 'false');
      this.openModals.add(modal);
    };

    const hideModalElement = (modal: HTMLElement): void => {
      modal.classList.remove('flex');
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      this.openModals.delete(modal);
    };

    const openModal = async (modal: HTMLElement, config: ModalBindingConfig): Promise<void> => {
      try {
        await config.onOpen?.();
      } catch (error) {
        console.error('[options][modalManager] 打开模态框前执行回调失败:', error);
      }

      showModalElement(modal);

      const focusable = modal.querySelector<HTMLElement>('[data-modal-autofocus]');
      focusable?.focus({ preventScroll: prefersReducedMotion });
    };

    const closeModal = async (modal: HTMLElement): Promise<void> => {
      if (!this.openModals.has(modal)) {
        return;
      }

      hideModalElement(modal);

      const config = this.modalConfigMap.get(modal);
      if (!config?.onClose) {
        return;
      }

      try {
        await config.onClose();
      } catch (error) {
        console.error('[options][modalManager] 关闭模态框后执行回调失败:', error);
      }
    };

    const bindModal = (config: ModalBindingConfig): void => {
      const trigger = documentRef.getElementById(config.triggerId);
      const modal = documentRef.getElementById(config.modalId);

      if (!(trigger instanceof HTMLElement) || !(modal instanceof HTMLElement)) {
        return;
      }

      this.modalConfigMap.set(modal, config);
      modal.setAttribute('aria-hidden', modal.classList.contains('hidden') ? 'true' : 'false');

      const onTriggerClick = (event: Event): void => {
        event.preventDefault();
        void openModal(modal, config);
      };

      const onOverlayClick = (event: Event): void => {
        if (event.target === modal) {
          event.preventDefault();
          void closeModal(modal);
        }
      };

      trigger.addEventListener('click', onTriggerClick);
      modal.addEventListener('click', onOverlayClick);

      this.cleanupFns.push(() => {
        trigger.removeEventListener('click', onTriggerClick);
        modal.removeEventListener('click', onOverlayClick);
      });

      const closeElements = config.closeSelector
        ? Array.from(modal.querySelectorAll<HTMLElement>(config.closeSelector))
        : Array.from(modal.querySelectorAll<HTMLElement>('[data-modal-close]'));

      closeElements.forEach((element) => {
        const handleClick = (event: Event): void => {
          event.preventDefault();
          void closeModal(modal);
        };
        element.addEventListener('click', handleClick);
        this.cleanupFns.push(() => element.removeEventListener('click', handleClick));
      });
    };

    bindings.forEach(bindModal);

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === ESCAPE_KEY) {
        for (const modal of Array.from(this.openModals)) {
          void closeModal(modal);
        }
      }
    };

    documentRef.addEventListener('keydown', handleEscape);
    this.cleanupFns.push(() => documentRef.removeEventListener('keydown', handleEscape));
  }
}
