import { resolveSessionPanelResizeStorage } from './sessionPanelResizeAdapter';
import {
  getSessionPanelLayoutSnapshot,
  loadPersistedSessionPanelLayout,
  savePersistedSessionPanelHeight,
  savePersistedSessionPanelWidth,
  saveSessionPanelCollapsed,
  updateSessionPanelHeightDraft,
  updateSessionPanelWidthDraft
} from './sessionPanelLayoutPersistence';
import type {
  SessionPanelLayoutSnapshot,
  SessionPanelResizeOptions
} from './sessionPanelResizeTypes';

export { loadPersistedSessionPanelLayout, saveSessionPanelCollapsed };

const MIN_WIDTH_RATIO = 0.6;
const MIN_VISIBLE_ITEMS = 3;
const MIN_ITEM_HEIGHT = 56;
const PANEL_CHROME_HEIGHT = 152;
const PANEL_DEFAULT_MAX_WIDTH = 576;
const PANEL_SIDE_GAP = 24;

interface ResizeState {
  axis: 'width' | 'height';
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function minPanelHeight(maxHeight: number): number {
  return Math.min(maxHeight, MIN_VISIBLE_ITEMS * MIN_ITEM_HEIGHT + PANEL_CHROME_HEIGHT);
}

function maxPanelHeight(): number {
  const viewportHeight =
    Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 800;
  return Math.max(1, Math.floor(viewportHeight * 0.9));
}

function applyPanelHeight(panel: HTMLElement, height: number): void {
  panel.style.setProperty('--aiob-session-panel-max-height', '90vh');
  panel.style.height = `${Math.round(height)}px`;
}

function isCollapsedSessionPanel(panel: HTMLElement): boolean {
  return panel.classList.contains('is-collapsed');
}

function applyPersistedPanelDimensions(panel: HTMLElement): void {
  const layout = getSessionPanelLayoutSnapshot();
  if (isCollapsedSessionPanel(panel)) {
    return;
  }
  if (layout.width > 0) {
    panel.style.width = `${layout.width}px`;
  }
  if (layout.height > 0) {
    applyPanelHeight(panel, layout.height);
  }
}

export async function applyPersistedSessionPanelLayout(
  panel: HTMLElement,
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): Promise<SessionPanelLayoutSnapshot> {
  applyPersistedPanelDimensions(panel);
  const layout = await loadPersistedSessionPanelLayout(options);
  applyPersistedPanelDimensions(panel);
  return layout;
}

export async function applyPersistedSessionPanelWidth(
  panel: HTMLElement,
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): Promise<void> {
  if (isCollapsedSessionPanel(panel)) {
    return;
  }
  const currentLayout = getSessionPanelLayoutSnapshot();
  if (currentLayout.width > 0) {
    panel.style.width = `${currentLayout.width}px`;
  }
  const loadedLayout = await loadPersistedSessionPanelLayout(options);
  if (!isCollapsedSessionPanel(panel) && loadedLayout.width > 0) {
    panel.style.width = `${loadedLayout.width}px`;
  }
}

function viewportPanelMaxWidth(): number {
  const viewportWidth =
    Number.isFinite(window.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : PANEL_DEFAULT_MAX_WIDTH + PANEL_SIDE_GAP;
  return Math.max(1, Math.min(PANEL_DEFAULT_MAX_WIDTH, viewportWidth - PANEL_SIDE_GAP));
}

function resolvePanelMaxWidth(panel: HTMLElement, currentWidth: number): number {
  const layout = getSessionPanelLayoutSnapshot();
  const computed = window.getComputedStyle(panel);
  const computedMaxWidth = parsePixelValue(computed.maxWidth);
  const tokenMaxWidth = parsePixelValue(computed.getPropertyValue('--session-panel-max-width'));
  const knownMaxWidth = Math.max(currentWidth, layout.maxWidth, computedMaxWidth, tokenMaxWidth);
  if (knownMaxWidth > currentWidth) {
    return knownMaxWidth;
  }
  if (layout.width > 0 && currentWidth <= layout.width) {
    return Math.max(currentWidth, viewportPanelMaxWidth());
  }
  return currentWidth;
}

export function bindSessionPanelResize(
  surface: HTMLElement,
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): () => void {
  const panel = surface.querySelector<HTMLElement>('.resource-modal--session');
  const handle = surface.querySelector<HTMLElement>('.session-panel-resize-handle');
  const heightHandle = surface.querySelector<HTMLElement>('.session-panel-height-resize-handle');
  if (!panel || !handle || !heightHandle) {
    return () => undefined;
  }
  applyPersistedPanelDimensions(panel);
  void loadPersistedSessionPanelLayout(options).then(() => {
    if (panel.isConnected) {
      applyPersistedPanelDimensions(panel);
    }
  });

  let state: ResizeState | null = null;

  const stopResize = (): void => {
    const completedState = state;
    state = null;
    document.removeEventListener('pointermove', resize);
    document.removeEventListener('pointerup', stopResize);
    document.removeEventListener('pointercancel', stopResize);
    const layout = getSessionPanelLayoutSnapshot();
    if (completedState?.axis === 'width' && layout.width > 0) {
      savePersistedSessionPanelWidth(layout.width, completedState.maxWidth, options);
    } else if (completedState?.axis === 'height' && layout.height > 0) {
      savePersistedSessionPanelHeight(layout.height, options);
    }
  };

  const resize = (event: Event): void => {
    if (!state) {
      return;
    }
    if (state.axis === 'width' && 'clientX' in event && typeof event.clientX === 'number') {
      const width = clamp(
        state.startWidth + state.startX - event.clientX,
        state.minWidth,
        state.maxWidth
      );
      const layout = updateSessionPanelWidthDraft(width);
      panel.style.width = `${layout.width}px`;
      return;
    }
    if (state.axis === 'height' && 'clientY' in event && typeof event.clientY === 'number') {
      const height = clamp(
        state.startHeight + state.startY - event.clientY,
        state.minHeight,
        state.maxHeight
      );
      const layout = updateSessionPanelHeightDraft(height);
      applyPanelHeight(panel, layout.height);
    }
  };

  const startResize = (event: Event): void => {
    if (!('clientX' in event) || typeof event.clientX !== 'number') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const currentWidth = Math.max(rect.width, parsePixelValue(panel.style.width), 1);
    const maxWidth = resolvePanelMaxWidth(panel, currentWidth);
    state = {
      axis: 'width',
      startX: event.clientX,
      startY: 0,
      startWidth: currentWidth,
      startHeight: 0,
      minWidth: maxWidth * MIN_WIDTH_RATIO,
      maxWidth,
      minHeight: 0,
      maxHeight: 0
    };
    document.addEventListener('pointermove', resize);
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);
  };

  const startHeightResize = (event: Event): void => {
    if (!('clientY' in event) || typeof event.clientY !== 'number') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const maxHeight = maxPanelHeight();
    state = {
      axis: 'height',
      startX: 0,
      startY: event.clientY,
      startWidth: 0,
      startHeight: Math.max(rect.height, 1),
      minWidth: 0,
      maxWidth: 0,
      minHeight: minPanelHeight(maxHeight),
      maxHeight
    };
    document.addEventListener('pointermove', resize);
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);
  };

  handle.addEventListener('pointerdown', startResize);
  heightHandle.addEventListener('pointerdown', startHeightResize);

  return () => {
    handle.removeEventListener('pointerdown', startResize);
    heightHandle.removeEventListener('pointerdown', startHeightResize);
    stopResize();
  };
}
