import { resolveSessionPanelResizeStorage } from './sessionPanelResizeAdapter';
import type {
  SessionPanelResizeOptions,
  SessionPanelResizeStorage
} from './sessionPanelResizeTypes';

const MIN_WIDTH_RATIO = 0.6;
const WIDTH_STORAGE_KEY = 'aiob.sessionPanel.width';
const WIDTH_MAX_STORAGE_KEY = 'aiob.sessionPanel.maxWidth';
const HEIGHT_STORAGE_KEY = 'aiob.sessionPanel.height';
const MIN_VISIBLE_ITEMS = 3;
const MIN_ITEM_HEIGHT = 56;
const PANEL_CHROME_HEIGHT = 152;
const PANEL_DEFAULT_MAX_WIDTH = 576;
const PANEL_SIDE_GAP = 24;
let persistedPanelWidth = 0;
let persistedPanelMaxWidth = 0;
let persistedPanelHeight = 0;
const storageLoad: WeakMap<SessionPanelResizeStorage, Promise<void>> = new WeakMap();

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

function loadPersistedPanelWidth(storage: SessionPanelResizeStorage): Promise<void> {
  const existingLoad = storageLoad.get(storage);
  if (existingLoad) {
    return existingLoad;
  }
  const nextLoad = (async () => {
    try {
      const items = await storage.load();
      const width = items[WIDTH_STORAGE_KEY];
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        persistedPanelWidth = Math.round(width);
      }
      const maxWidth = items[WIDTH_MAX_STORAGE_KEY];
      if (typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0) {
        persistedPanelMaxWidth = Math.round(maxWidth);
      }
      const height = items[HEIGHT_STORAGE_KEY];
      if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        persistedPanelHeight = Math.round(height);
      }
    } catch {
      return;
    }
  })();
  storageLoad.set(storage, nextLoad);
  return nextLoad;
}

function saveSessionPanelStorage(
  storage: SessionPanelResizeStorage,
  items: Record<string, unknown>
): void {
  try {
    storage.save(items);
  } catch {
    return;
  }
}

function savePersistedPanelWidth(
  storage: SessionPanelResizeStorage,
  width: number,
  maxWidth = persistedPanelMaxWidth
): void {
  saveSessionPanelStorage(storage, {
    [WIDTH_STORAGE_KEY]: Math.round(width),
    [WIDTH_MAX_STORAGE_KEY]: Math.round(maxWidth)
  });
}

function savePersistedPanelHeight(storage: SessionPanelResizeStorage, height: number): void {
  saveSessionPanelStorage(storage, { [HEIGHT_STORAGE_KEY]: Math.round(height) });
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

export async function applyPersistedSessionPanelWidth(
  panel: HTMLElement,
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): Promise<void> {
  if (isCollapsedSessionPanel(panel)) {
    return;
  }
  if (persistedPanelWidth > 0) {
    panel.style.width = `${Math.round(persistedPanelWidth)}px`;
  }
  await loadPersistedPanelWidth(options.storage);
  if (!isCollapsedSessionPanel(panel) && persistedPanelWidth > 0) {
    panel.style.width = `${Math.round(persistedPanelWidth)}px`;
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
  const computed = window.getComputedStyle(panel);
  const computedMaxWidth = parsePixelValue(computed.maxWidth);
  const tokenMaxWidth = parsePixelValue(computed.getPropertyValue('--session-panel-max-width'));
  const knownMaxWidth = Math.max(
    currentWidth,
    persistedPanelMaxWidth,
    computedMaxWidth,
    tokenMaxWidth
  );
  if (knownMaxWidth > currentWidth) {
    return knownMaxWidth;
  }
  if (persistedPanelWidth > 0 && currentWidth <= persistedPanelWidth) {
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
  if (!isCollapsedSessionPanel(panel) && persistedPanelWidth > 0) {
    panel.style.width = `${Math.round(persistedPanelWidth)}px`;
  }
  if (!isCollapsedSessionPanel(panel) && persistedPanelHeight > 0) {
    applyPanelHeight(panel, persistedPanelHeight);
  }
  void loadPersistedPanelWidth(options.storage).then(() => {
    if (!isCollapsedSessionPanel(panel) && persistedPanelWidth > 0 && panel.isConnected) {
      panel.style.width = `${Math.round(persistedPanelWidth)}px`;
    }
    if (!isCollapsedSessionPanel(panel) && persistedPanelHeight > 0 && panel.isConnected) {
      applyPanelHeight(panel, persistedPanelHeight);
    }
  });

  let state: ResizeState | null = null;

  const stopResize = (): void => {
    const completedState = state;
    state = null;
    document.removeEventListener('pointermove', resize);
    document.removeEventListener('pointerup', stopResize);
    document.removeEventListener('pointercancel', stopResize);
    if (completedState?.axis === 'width' && persistedPanelWidth > 0) {
      savePersistedPanelWidth(options.storage, persistedPanelWidth, completedState.maxWidth);
    } else if (completedState?.axis === 'height' && persistedPanelHeight > 0) {
      savePersistedPanelHeight(options.storage, persistedPanelHeight);
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
      persistedPanelWidth = Math.round(width);
      panel.style.width = `${Math.round(width)}px`;
      return;
    }
    if (state.axis === 'height' && 'clientY' in event && typeof event.clientY === 'number') {
      const height = clamp(
        state.startHeight + state.startY - event.clientY,
        state.minHeight,
        state.maxHeight
      );
      persistedPanelHeight = Math.round(height);
      applyPanelHeight(panel, persistedPanelHeight);
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
    persistedPanelMaxWidth = Math.max(persistedPanelMaxWidth, Math.round(maxWidth));
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
