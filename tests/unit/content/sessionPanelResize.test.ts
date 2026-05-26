/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockStorage {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

interface SurfaceFixture {
  surface: HTMLElement;
  panel: HTMLElement;
  widthHandle: HTMLElement;
  heightHandle: HTMLElement;
}

function installChromeStorage(
  getImplementation: (
    keys: string[],
    callback: (items: Record<string, unknown>) => void
  ) => void = (_keys, callback) => callback({})
): MockStorage {
  const get = vi.fn(getImplementation);
  const set = vi.fn((_items: Record<string, unknown>, callback?: () => void) => {
    callback?.();
  });
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: { get, set }
    }
  };
  return { get, set };
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
    delete (globalThis as { chrome?: unknown }).chrome;
    vi.restoreAllMocks();
  });

  it('applies in-memory width immediately and storage width after async load', async () => {
    const loadStorage: { current?: (items: Record<string, unknown>) => void } = {};
    const storage = installChromeStorage((_keys, callback) => {
      loadStorage.current = callback;
    });
    const { bindSessionPanelResize, applyPersistedSessionPanelWidth } = await importResizeModule();
    const first = createSurfaceFixture();

    bindSessionPanelResize(first.surface);
    dispatchPointer(first.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 260 });
    dispatchPointer(document, 'pointerup');
    expect(storage.set).toHaveBeenCalledTimes(1);

    const secondPanel = document.createElement('section');
    const loadPromise = applyPersistedSessionPanelWidth(secondPanel);

    expect(secondPanel.style.width).toBe('440px');
    expect(loadStorage.current).toBeInstanceOf(Function);
    loadStorage.current?.({ 'aiob.sessionPanel.width': 512, 'aiob.sessionPanel.maxWidth': 576 });
    await loadPromise;
    expect(secondPanel.style.width).toBe('512px');
  });

  it('returns cleanup functions for complete or missing resize surfaces', async () => {
    installChromeStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const complete = createSurfaceFixture();
    const incomplete = document.createElement('div');

    expect(bindSessionPanelResize(complete.surface)).toBeInstanceOf(Function);
    expect(bindSessionPanelResize(incomplete)).toBeInstanceOf(Function);
    expect(() => bindSessionPanelResize(incomplete)()).not.toThrow();
  });

  it('updates width during pointermove but persists once at pointerup', async () => {
    const storage = installChromeStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface);
    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });

    expect(fixture.panel.style.width).toBe('450px');
    expect(storage.set).not.toHaveBeenCalled();

    dispatchPointer(document, 'pointerup');

    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledWith({
      'aiob.sessionPanel.width': 450,
      'aiob.sessionPanel.maxWidth': 500
    });
  });

  it('updates height during pointermove but persists once at pointerup', async () => {
    const storage = installChromeStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface);
    dispatchPointer(fixture.heightHandle, 'pointerdown', { clientY: 500 });
    dispatchPointer(document, 'pointermove', { clientY: 440 });

    expect(fixture.panel.style.getPropertyValue('--aiob-session-panel-max-height')).toBe('90vh');
    expect(fixture.panel.style.height).toBe('420px');
    expect(storage.set).not.toHaveBeenCalled();

    dispatchPointer(document, 'pointerup');

    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledWith({ 'aiob.sessionPanel.height': 420 });
  });

  it('commits pointercancel once and removes active document listeners', async () => {
    const storage = installChromeStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();

    bindSessionPanelResize(fixture.surface);
    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });
    dispatchPointer(document, 'pointercancel');
    dispatchPointer(document, 'pointerup');
    dispatchPointer(document, 'pointermove', { clientX: 200 });

    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(fixture.panel.style.width).toBe('450px');
  });

  it('does not apply persisted dimensions to collapsed panels', async () => {
    installChromeStorage();
    const { bindSessionPanelResize, applyPersistedSessionPanelWidth } = await importResizeModule();
    const expanded = createSurfaceFixture();

    bindSessionPanelResize(expanded.surface);
    dispatchPointer(expanded.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });
    dispatchPointer(document, 'pointerup');
    dispatchPointer(expanded.heightHandle, 'pointerdown', { clientY: 500 });
    dispatchPointer(document, 'pointermove', { clientY: 440 });
    dispatchPointer(document, 'pointerup');

    const collapsed = createSurfaceFixture({ collapsed: true });
    bindSessionPanelResize(collapsed.surface);
    await applyPersistedSessionPanelWidth(collapsed.panel);

    expect(collapsed.panel.style.width).toBe('');
    expect(collapsed.panel.style.height).toBe('');
    expect(collapsed.panel.style.getPropertyValue('--aiob-session-panel-max-height')).toBe('');
  });

  it('commits and detaches listeners when cleanup runs during an active drag', async () => {
    const storage = installChromeStorage();
    const { bindSessionPanelResize } = await importResizeModule();
    const fixture = createSurfaceFixture();
    const cleanup = bindSessionPanelResize(fixture.surface);

    dispatchPointer(fixture.widthHandle, 'pointerdown', { clientX: 300 });
    dispatchPointer(document, 'pointermove', { clientX: 250 });

    expect(() => cleanup()).not.toThrow();
    dispatchPointer(document, 'pointerup');
    dispatchPointer(document, 'pointermove', { clientX: 200 });

    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(fixture.panel.style.width).toBe('450px');
  });
});
