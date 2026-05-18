import type {
  ReaderSelectionController,
  ReaderSelectionPayload
} from './services/selectionController';
import type { ReaderPanelCoordinator } from './panelCoordinator';
import type { ReaderEnvironmentController, ReaderEnvironmentState } from './environmentController';
import type { ExternalHighlightPayload } from './types';

export interface ReaderSessionLifecycleDependencies {
  doc: Document;
  selectionController: ReaderSelectionController;
  panelCoordinator: ReaderPanelCoordinator;
  environment: ReaderEnvironmentController;
  externalHighlightEvent: string;
}

export interface ReaderSessionLifecycleHandlers {
  onSelection(payload: ReaderSelectionPayload): void;
  onExternalHighlight(payload: ExternalHighlightPayload): void;
  onKeydown(event: KeyboardEvent): void;
}

export class ReaderSessionLifecycle {
  private active = false;
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private highlightHandler: ((event: Event) => void) | null = null;

  constructor(
    private readonly deps: ReaderSessionLifecycleDependencies,
    private readonly handlers: ReaderSessionLifecycleHandlers
  ) {}

  async start(): Promise<ReaderEnvironmentState> {
    if (this.active) {
      throw new Error('ReaderSessionLifecycle has already been started.');
    }

    this.active = true;
    this.deps.doc.documentElement.dataset.aiobReaderActive = 'true';

    try {
      const envState = await this.deps.environment.start();
      this.deps.panelCoordinator.mount(envState.messages);
      this.deps.selectionController.start();

      this.keydownHandler = (event) => {
        this.handlers.onKeydown(event);
      };
      this.highlightHandler = (event: Event) => {
        const detail = (event as CustomEvent<ExternalHighlightPayload>).detail;
        if (detail) {
          this.handlers.onExternalHighlight(detail);
        }
      };

      this.deps.doc.addEventListener('keydown', this.keydownHandler, true);
      this.deps.doc.addEventListener(
        this.deps.externalHighlightEvent,
        this.highlightHandler as EventListener
      );

      return envState;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  cancel(): void {
    if (!this.active) {
      return;
    }
    this.cleanup();
  }

  cleanup(): void {
    if (this.keydownHandler) {
      this.deps.doc.removeEventListener('keydown', this.keydownHandler, true);
    }
    if (this.highlightHandler) {
      this.deps.doc.removeEventListener(
        this.deps.externalHighlightEvent,
        this.highlightHandler as EventListener
      );
    }
    this.keydownHandler = null;
    this.highlightHandler = null;

    this.deps.selectionController.stop();
    this.deps.environment.stop();
    this.deps.panelCoordinator.destroy();

    delete this.deps.doc.documentElement.dataset.aiobReaderActive;
    this.active = false;
  }
}
