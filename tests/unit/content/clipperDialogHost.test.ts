/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMock = vi.hoisted(() => vi.fn());
const disposeScopeMock = vi.hoisted(() => vi.fn());
const closeAllMock = vi.hoisted(() => vi.fn());
const disposeMock = vi.hoisted(() => vi.fn());
const getActiveMock = vi.hoisted(() => vi.fn(() => ({ id: 'active-dialog' })));
const showMock = vi.hoisted(() => vi.fn<[string, unknown?], Promise<{ action: 'confirm'; comment: string }>>(
  () => Promise.resolve({ action: 'confirm', comment: 'ok' })
));

vi.mock('../../../src/shared/di/serviceRegistry', () => ({
  createScopedRegistry: () => ({ register: registerMock, disposeScope: disposeScopeMock })
}));
vi.mock('../../../src/content/clipper/shared/dialogRegistry', () => ({
  createDialogRegistry: () => ({ closeAll: closeAllMock, dispose: disposeMock, getActive: getActiveMock })
}));
vi.mock('../../../src/content/clipper/components/dialogFactory', () => ({
  createClipperDialog: () => ({ show: showMock })
}));

describe('ClipperDialogHost', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows dialog with injected registry and exposes active dialog', async () => {
    const { ClipperDialogHost } = await import('../../../src/content/clipper/shared/clipperDialogHost');
    const host = new ClipperDialogHost();
    await expect(host.showDialog('selected text')).resolves.toEqual({ action: 'confirm', comment: 'ok' });
    expect(registerMock).toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledWith('selected text', expect.anything());
    const dialogOptions = showMock.mock.calls[0]?.[1] as { dialogRegistry?: unknown } | undefined;
    expect(dialogOptions?.dialogRegistry).toBeTruthy();
    expect(host.getActiveDialog()).toMatchObject({ id: 'active-dialog' });
  });

  it('closes on visibility change and disposes on beforeunload', async () => {
    const { ClipperDialogHost, getGlobalDialogHost, resetGlobalDialogHost } = await import('../../../src/content/clipper/shared/clipperDialogHost');
    const host = new ClipperDialogHost();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(closeAllMock).toHaveBeenCalled();
    window.dispatchEvent(new Event('beforeunload'));
    expect(host.disposed).toBe(true);
    expect(disposeMock).toHaveBeenCalled();
    expect(disposeScopeMock).toHaveBeenCalled();

    const globalHost = getGlobalDialogHost();
    expect(globalHost.disposed).toBe(false);
    resetGlobalDialogHost();
  });
});
