import type { Messages } from '@i18n';
import type { StyleAttachmentHandle } from '@ui/foundation/style-host';
import {
  panelStyleSheetManager,
  prepareStyleHost,
  revealStyleHost
} from '../shared/panels/styleSheetManager';
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
type VideoPromptMount = {
  host: HTMLDivElement;
  element: HTMLElement;
  style: StyleAttachmentHandle;
};
export function createVideoPromptMountLifecycle(options: VideoPromptMountLifecycleOptions) {
  let promptMount: VideoPromptMount | null = null;
  let promptMountTask: Promise<void> | null = null;
  let promptMountGeneration = 0;
  let promptDebugState: VideoPromptDebugState | null = null;
  const layoutState = createPromptLayoutState();
  const promptDebugCounters = createVideoPromptDebugCounters();
  function getDebugCountersSnapshot(): VideoPromptDebugCounters {
    return { ...promptDebugCounters };
  }
  function getStateSnapshot() {
    return getLayoutStateSnapshot(layoutState);
  }
  function getDebugPositionFields() {
    const promptElement = promptMount?.element ?? null;
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
    promptMountGeneration += 1;
    const mount = promptMount;
    promptMount = null;
    if (mount) {
      mount.style.dispose();
      mount.host.remove();
    }
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
    if (promptMount) {
      applyStoredPosition(layoutState, promptMount.element);
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
    if (!promptMount) {
      return;
    }
    adjustLayoutForResize(layoutState, promptMount.element);
    updateDebugPosition();
  }
  async function mountPrompt(): Promise<void> {
    if (promptMount) {
      return;
    }
    if (promptMountTask !== null) {
      await promptMountTask;
      return;
    }
    const mountGeneration = ++promptMountGeneration;
    const shouldAbortMount = (): boolean =>
      Boolean(
        mountGeneration !== promptMountGeneration ||
        promptMount ||
        options.isPromptSuppressed() ||
        !options.isPromptEnabled() ||
        options.isVideoSessionActive() ||
        options.getWindow() !== options.getWindow().top
      );
    promptMountTask = (async () => {
      let pendingMount: { host: HTMLDivElement; styleAttachment: StyleAttachmentHandle } | null =
        null;
      try {
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
        const previewTheme = await options.getRuntimeTheme();
        if (shouldAbortMount()) {
          return;
        }
        const host = doc.createElement('div');
        prepareStyleHost(host);
        host.dataset.aiobStyleReveal = 'true';
        const shadow = host.attachShadow({ mode: 'open' });
        const styleAttachment = panelStyleSheetManager.applyVideoStyles(shadow);
        pendingMount = { host, styleAttachment };
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
        if (!(await revealStyleHost(host, styleAttachment)) || shouldAbortMount()) return;
        applyStoredPosition(layoutState, container);
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
          savePromptPosition: () => void savePromptPosition()
        });
        promptMount = { host, element: container, style: styleAttachment };
        pendingMount = null;
        promptDebugCounters.floatingPromptMountCount += 1;
        updateDebugPosition();
      } finally {
        if (pendingMount) {
          pendingMount.styleAttachment.dispose();
          pendingMount.host.remove();
        }
      }
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
    incrementControlButtonSyncCount: () => (promptDebugCounters.controlButtonSyncCount += 1),
    incrementEvaluateCount: () => (promptDebugCounters.evaluateCount += 1),
    loadPromptPosition,
    mountPrompt,
    removePrompt,
    resetDebugCounters: () => resetVideoPromptDebugCounters(promptDebugCounters),
    resetDebugState: () => (promptDebugState = null),
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
      if (promptMount) {
        applyStoredPosition(layoutState, promptMount.element);
        updateDebugPosition();
      }
    },
    updatePromptDomLabels: () => {
      if (promptMount) {
        updatePromptLabels(promptMount.element, options.getLabel(), options.getShortcut());
      }
    }
  };
}
