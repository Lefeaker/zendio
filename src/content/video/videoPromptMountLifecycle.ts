import type { Messages } from '@i18n';
import { panelStyleSheetManager } from '../shared/panels/styleSheetManager';
import { attachDragHandlers, createPromptElement, updatePromptLabels } from './videoPromptRenderer';
import {
  applySideClass,
  applyStoredPosition,
  adjustLayoutForResize,
  createPromptLayoutState,
  deriveSideFromPosition,
  getLayoutStateSnapshot,
  setLayoutState,
  setPromptSide,
  type PromptLayoutState
} from './videoPromptLayout';
import type { PromptSide } from './videoPromptPosition';
import type { VideoPromptRuntimeTheme } from './videoPromptDependencies';
import {
  VIDEO_PROMPT_ID,
  createVideoPromptDebugCounters,
  resetVideoPromptDebugCounters,
  type VideoPromptDebugCounters,
  type VideoPromptDebugState
} from './videoPromptState';

interface VideoPromptMountLifecycleOptions {
  getDocument(): Document;
  getWindow(): Window;
  getMessages(): Promise<Messages>;
  getLabel(): string;
  getShortcut(): string;
  getIconUrl(): string | null;
  getRuntimeTheme(): VideoPromptRuntimeTheme | null | Promise<VideoPromptRuntimeTheme | null>;
  isPromptEnabled(): boolean;
  isPromptSuppressed(): boolean;
  isVideoSessionActive(): boolean;
  setPromptSuppressed(value: boolean): void;
  startVideoSession(): void;
  getStoredPromptPosition(): Promise<{ x: number; y: number } | null | undefined>;
  saveStoredPromptPosition(position: { x: number; y: number }): Promise<void>;
}

export function createVideoPromptMountLifecycle(options: VideoPromptMountLifecycleOptions) {
  let promptHost: HTMLDivElement | null = null;
  let promptElement: HTMLElement | null = null;
  let promptMountTask: Promise<void> | null = null;
  let promptDebugState: VideoPromptDebugState | null = null;
  const layoutState = createPromptLayoutState();
  const promptDebugCounters = createVideoPromptDebugCounters();

  function getDebugCountersSnapshot(): VideoPromptDebugCounters {
    return { ...promptDebugCounters };
  }

  function getStateSnapshot(): {
    left: number;
    top: number;
    side: PromptSide;
    hasCustomPosition: boolean;
  } {
    return getLayoutStateSnapshot(layoutState);
  }

  function getDebugPositionFields(): Pick<
    VideoPromptDebugState,
    | 'hasPromptElement'
    | 'side'
    | 'hasCustomPosition'
    | 'storedTop'
    | 'storedLeft'
    | 'elementTop'
    | 'elementLeft'
  > {
    return {
      hasPromptElement: Boolean(promptElement),
      side: layoutState.side,
      hasCustomPosition: layoutState.hasCustomPosition,
      storedTop: layoutState.top,
      storedLeft: layoutState.left,
      elementTop: promptElement ? promptElement.getBoundingClientRect().top : null,
      elementLeft: promptElement ? promptElement.getBoundingClientRect().left : null
    };
  }

  function updateDebugPosition(): void {
    if (!promptDebugState) {
      return;
    }
    Object.assign(promptDebugState, getDebugPositionFields());
  }

  function removePrompt(): void {
    promptHost?.remove();
    promptHost = null;
    promptElement = null;
    if (promptDebugState) {
      promptDebugState.hasPromptElement = false;
      promptDebugState.elementTop = null;
      promptDebugState.elementLeft = null;
    }
  }

  async function savePromptPosition(): Promise<void> {
    try {
      await options.saveStoredPromptPosition({
        x: layoutState.left,
        y: layoutState.top
      });
    } catch (error) {
      console.warn('[VideoPrompt] Failed to save prompt position:', error);
    }
  }

  function applyPromptPositionFromConfig(
    position: { x: number; y: number } | null | undefined
  ): void {
    if (!position) {
      setLayoutState(layoutState, { hasCustomPosition: false });
      return;
    }

    setLayoutState(layoutState, {
      hasCustomPosition: true,
      left: position.x,
      top: position.y,
      side: deriveSideFromPosition(position.x)
    });

    if (promptElement) {
      applyStoredPosition(layoutState, promptElement);
      updateDebugPosition();
    }
  }

  async function loadPromptPosition(): Promise<void> {
    try {
      const position = await options.getStoredPromptPosition();
      applyPromptPositionFromConfig(position);
    } catch (error) {
      console.warn('[VideoPrompt] Failed to load prompt position:', error);
    }
  }

  function handleWindowResize(): void {
    if (!promptElement) {
      return;
    }
    adjustLayoutForResize(layoutState, promptElement);
    updateDebugPosition();
  }

  async function mountPrompt(): Promise<void> {
    if (promptElement) {
      return;
    }
    if (promptMountTask !== null) {
      await promptMountTask;
      return;
    }

    const shouldAbortMount = (): boolean =>
      Boolean(
        promptElement ||
          options.isPromptSuppressed() ||
          !options.isPromptEnabled() ||
          options.isVideoSessionActive() ||
          options.getWindow() !== options.getWindow().top
      );

    promptMountTask = (async () => {
      const messages = await options.getMessages();

      if (shouldAbortMount()) {
        return;
      }

      const doc = options.getDocument();
      if (!doc.body) {
        await new Promise<void>((resolve) => {
          doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
        });
        if (shouldAbortMount()) {
          return;
        }
      }

      if (promptElement) {
        return;
      }

      await panelStyleSheetManager.initialize();

      const host = doc.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      panelStyleSheetManager.applyStitchRuntimeStyles(shadow);
      const previewTheme = await options.getRuntimeTheme();

      const { container, bubble } = createPromptElement({
        id: VIDEO_PROMPT_ID,
        label: options.getLabel(),
        shortcut: options.getShortcut(),
        messages,
        ...(previewTheme ? { previewTheme } : {}),
        getIconUrl: () => options.getIconUrl(),
        onPrimaryAction: () => {
          options.setPromptSuppressed(true);
          removePrompt();
          options.startVideoSession();
        },
        onDismiss: () => {
          options.setPromptSuppressed(true);
          removePrompt();
        }
      });

      shadow.appendChild(container);
      doc.body.appendChild(host);
      promptHost = host;
      promptElement = container;
      promptDebugCounters.floatingPromptMountCount += 1;
      applyStoredPosition(layoutState, container);
      updateDebugPosition();

      attachDragHandlers({
        container,
        bubble,
        applySideClass,
        setPromptSide: (side, element) => setPromptSide(layoutState, side, element ?? null),
        applyStoredPosition: (element) => applyStoredPosition(layoutState, element),
        updateDebugValues: (values) => {
          if (!promptDebugState) {
            return;
          }
          if (typeof values.elementTop === 'number') {
            promptDebugState.elementTop = values.elementTop;
          }
          if (typeof values.elementLeft === 'number') {
            promptDebugState.elementLeft = values.elementLeft;
          }
          if (values.side) {
            promptDebugState.side = values.side;
          }
        },
        updateDebugPosition,
        onPositionCommitted: (placement) => {
          setLayoutState(layoutState, {
            hasCustomPosition: true,
            side: placement.side,
            left: placement.left,
            top: placement.top
          });
        },
        savePromptPosition: () => {
          void savePromptPosition();
        }
      });
    })();

    try {
      await promptMountTask;
    } finally {
      promptMountTask = null;
    }
  }

  return {
    applyPromptPositionFromConfig,
    getDebugCountersSnapshot,
    getDebugPositionFields,
    getDebugState: () => promptDebugState,
    getStateSnapshot,
    handleWindowResize,
    incrementControlButtonSyncCount: () => {
      promptDebugCounters.controlButtonSyncCount += 1;
    },
    incrementEvaluateCount: () => {
      promptDebugCounters.evaluateCount += 1;
    },
    loadPromptPosition,
    mountPrompt,
    removePrompt,
    resetDebugCounters: () => resetVideoPromptDebugCounters(promptDebugCounters),
    resetDebugState: () => {
      promptDebugState = null;
    },
    savePromptPosition,
    setDebugState: (state: VideoPromptDebugState) => {
      promptDebugState = state;
      updateDebugPosition();
    },
    setPromptSide: (side: PromptSide, element?: HTMLElement | null) =>
      setPromptSide(layoutState, side, element ?? null),
    setPromptState: (
      state: Partial<{
        left: number;
        top: number;
        side: PromptSide;
        hasCustomPosition: boolean;
      }>
    ) => {
      setLayoutState(layoutState, state as Partial<PromptLayoutState>);
      if (promptElement) {
        applyStoredPosition(layoutState, promptElement);
        updateDebugPosition();
      }
    },
    updatePromptDomLabels: () => {
      if (promptElement) {
        updatePromptLabels(promptElement, options.getLabel(), options.getShortcut());
      }
    }
  };
}
