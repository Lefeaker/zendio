/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asType } from '../../utils/typeHelpers';

type SessionPanelStorageItems = Partial<
  Record<
    | 'aiob.sessionPanel.width'
    | 'aiob.sessionPanel.maxWidth'
    | 'aiob.sessionPanel.height'
    | 'aiob.sessionPanel.collapsed',
    number | boolean
  >
>;

interface MockStorage {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

interface SurfaceFixture {
  surface: HTMLElement;
  panel: HTMLElement;
  widthHandle: HTMLElement;
  heightHandle: HTMLElement;
}

function createSessionPanelStorage(
  loadImplementation: () => Promise<SessionPanelStorageItems> = () => Promise.resolve({})
): MockStorage {
  return {
    load: vi.fn(loadImplementation),
    save: vi.fn()
  };
}

function removeChromeApi(): void {
  delete asType<{ chrome?: typeof chrome }>(globalThis).chrome;
}

function createSurfaceFixture(
  options: {
    collapsed?: boolean;
    width?: number;
    height?: number;
    maxWidth?: number;
  } = {}
): SurfaceFixture {
  const width = options.width ?? 400;
  const height = options.height ?? 360;
  const surface = document.createElement('div');
  const panel = document.createElement('section');
  const widthHandle = document.createElement('button');
  const heightHandle = document.createElement('button');
  panel.className = 'resource-modal--session';
  if (options.collapsed) {
    panel.classList.add('is-collapsed');
  }
  panel.style.maxWidth = `${options.maxWidth ?? 500}px`;
  panel.getBoundingClientRect = () =>
    ({
      width,
      height,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({})
    }) as DOMRect;
  widthHandle.className = 'session-panel-resize-handle';
  heightHandle.className = 'session-panel-height-resize-handle';
  surface.append(panel, widthHandle, heightHandle);
  document.body.append(surface);
  return { surface, panel, widthHandle, heightHandle };
}

function dispatchPointer(target: EventTarget, type: string, init: MouseEventInit = {}): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init
    })
  );
}

async function importResizeModule(): Promise<
  typeof import('../../../src/content/shared/panels/sessionPanelResize')
> {
  return import('../../../src/content/shared/panels/sessionPanelResize');
}

describe('session panel resize persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    window.innerHeight = 800;
    window.innerWidth = 900;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    removeChromeApi();
    vi.restoreAllMocks();
  });

  it('keeps committed in-memory width when an older async storage load resolves later', async () => {
    const loadStorage: { current?: (items: SessionPanelStorageItems) => void } = {};
    const storage = createSessionPanelStorage(() => {
      return new Promise((resolve) => {
        loadStorage.current = resolve;
      });
    });
    const { bindSessionPanelResize, applyPersistedSessionPanelWidth } = await importResizeModule();
    const first = createSurfaceFixture();

    bindSessionPanelResize(first.surface, { storage });
    dispatchPointer(first.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 260 });
    dispatchPointer(document, 'pointerup');
    expect(storage.save).toHaveBeenCalledTimes(1);

    const secondPanel = document.createElement('section');
    const loadPromise = applyPersistedSessionPanelWidth(secondPanel, { storage });

    expect(secondPanel.style.width).toBe('440px');
    expect(loadStorage.current).toBeInstanceOf(Function);
    loadStorage.current?.({ 'aiob.sessionPanel.width': 512, 'aiob.sessionPanel.maxWidth': 576 });
    await loadPromise;
    expect(secondPanel.style.width).toBe('440px');
  });

  it('applies stored width after async load when no local resize wins the race', async () => {
    const loadStorage: { current?: (items: SessionPanelStorageItems) => void } = {};
    const storage = createSessionPanelStorage(() => {
      return new Promise((resolve) => {
        loadStorage.current = resolve;
      });
    });
    const { applyPersistedSessionPanelWidth } = await importResizeModule();
    const panel = document.createElement('section');

    const loadPromise = applyPersistedSessionPanelWidth(panel, { storage });

    expect(loadStorage.current).toBeInstanceOf(Function);
    loadStorage.current?.({ 'aiob.sessionPanel.width': 512, 'aiob.sessionPanel.maxWidth': 576 });
    await loadPromise;
    expect(panel.style.width).toBe('512px');
  });

  it('returns cleanup functions for complete or missing resize surfaces', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const complete = createSurfaceFixture();
    const incomplete = document.createElement('div');

    expect(bindSessionPanelResize(complete.surface, { storage })).toBeInstanceOf(Function);
    expect(bindSessionPanelResize(incomplete, { storage })).toBeInstanceOf(Function);
    expect(() => bindSessionPanelResize(incomplete, { storage })()).not.toThrow();
  });

  it('updates width during pointermove but persists once at pointerup', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface, { storage });
    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });

    expect(fixture.panel.style.width).toBe('450px');
    expect(storage.save).not.toHaveBeenCalled();

    dispatchPointer(document, 'pointerup');

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith({
      'aiob.sessionPanel.width': 450,
      'aiob.sessionPanel.maxWidth': 500
    });
  });

  it('updates height during pointermove but persists once at pointerup', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface, { storage });
    dispatchPointer(fixture.heightHandle, 'pointerdown', { clientY: 500 });
    dispatchPointer(document, 'pointermove', { clientY: 440 });

    expect(fixture.panel.style.getPropertyValue('--aiob-session-panel-max-height')).toBe('90vh');
    expect(fixture.panel.style.height).toBe('420px');
    expect(storage.save).not.toHaveBeenCalled();

    dispatchPointer(document, 'pointerup');

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith({ 'aiob.sessionPanel.height': 420 });
  });

  it('loads persisted layout dimensions and collapsed state together', async () => {
    const storage = createSessionPanelStorage(() =>
      Promise.resolve({
        'aiob.sessionPanel.width': 512,
        'aiob.sessionPanel.maxWidth': 576,
        'aiob.sessionPanel.height': 480,
        'aiob.sessionPanel.collapsed': true
      })
    );
    const { applyPersistedSessionPanelLayout } = await importResizeModule();
    const fixture = createSurfaceFixture();

    const layout = await applyPersistedSessionPanelLayout(fixture.panel, { storage });

    expect(layout).toEqual({
      width: 512,
      maxWidth: 576,
      height: 480,
      collapsed: true
    });
    expect(fixture.panel.style.width).toBe('512px');
    expect(fixture.panel.style.height).toBe('480px');
    expect(fixture.panel.style.getPropertyValue('--aiob-session-panel-max-height')).toBe('90vh');
  });

  it('persists collapsed state and returns the current in-memory snapshot after an earlier load', async () => {
    const storage = createSessionPanelStorage(() =>
      Promise.resolve({ 'aiob.sessionPanel.collapsed': false })
    );
    const { loadPersistedSessionPanelLayout, saveSessionPanelCollapsed } =
      await importResizeModule();

    await expect(loadPersistedSessionPanelLayout({ storage })).resolves.toMatchObject({
      collapsed: false
    });
    saveSessionPanelCollapsed(true, { storage });

    expect(storage.save).toHaveBeenCalledWith({ 'aiob.sessionPanel.collapsed': true });
    await expect(loadPersistedSessionPanelLayout({ storage })).resolves.toMatchObject({
      collapsed: true
    });
  });

  it('commits pointercancel once and removes active document listeners', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface, { storage });
    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });
    dispatchPointer(document, 'pointercancel');
    dispatchPointer(document, 'pointerup');
    dispatchPointer(document, 'pointermove', { clientX: 200 });

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(fixture.panel.style.width).toBe('450px');
  });

  it('does not apply persisted dimensions to collapsed panels', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize, applyPersistedSessionPanelWidth } = await importResizeModule();
    const expanded = createSurfaceFixture();

    bindSessionPanelResize(expanded.surface, { storage });
    dispatchPointer(expanded.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });
    dispatchPointer(document, 'pointerup');
    dispatchPointer(expanded.heightHandle, 'pointerdown', { clientY: 500 });
    dispatchPointer(document, 'pointermove', { clientY: 440 });
    dispatchPointer(document, 'pointerup');

    const collapsed = createSurfaceFixture({ collapsed: true });
    bindSessionPanelResize(collapsed.surface, { storage });
    await applyPersistedSessionPanelWidth(collapsed.panel, { storage });

    expect(collapsed.panel.style.width).toBe('');
    expect(collapsed.panel.style.height).toBe('');
    expect(collapsed.panel.style.getPropertyValue('--aiob-session-panel-max-height')).toBe('');
  });

  it('commits and detaches listeners when cleanup runs during an active drag', async () => {
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();
    const cleanup = bindSessionPanelResize(fixture.surface, { storage });

    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });

    expect(() => cleanup()).not.toThrow();
    dispatchPointer(document, 'pointerup');
    dispatchPointer(document, 'pointermove', { clientX: 200 });

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(fixture.panel.style.width).toBe('450px');
  });

  it('persists through the injected storage dependency without extension globals', async () => {
    removeChromeApi();
    const storage = createSessionPanelStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface, { storage });
    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });
    dispatchPointer(document, 'pointerup');

    expect(globalThis.chrome).toBeUndefined();
    expect(storage.save).toHaveBeenCalledWith({
      'aiob.sessionPanel.width': 450,
      'aiob.sessionPanel.maxWidth': 500
    });
  });
});
