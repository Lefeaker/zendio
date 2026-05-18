/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const binderHandles: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
const binderMock = {
  bindText: vi.fn(() => {
    const handle = { dispose: vi.fn() };
    binderHandles.push(handle);
    return handle;
  }),
  bindAttr: vi.fn(() => ({ dispose: vi.fn() }))
};

const getOptionsI18nBinderMock = vi.fn();
const getOptionsI18nResourceMock = vi.fn();
const getOptionsMessagesMock = vi.fn();

vi.mock('../../../src/options/app/i18nContext', () => ({
  getOptionsI18nBinder: getOptionsI18nBinderMock,
  getOptionsI18nResource: getOptionsI18nResourceMock,
  getOptionsMessages: getOptionsMessagesMock
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  binderHandles.length = 0;
  binderMock.bindText.mockClear();
  binderMock.bindAttr.mockClear();
  getOptionsI18nBinderMock.mockReset();
  getOptionsI18nResourceMock.mockReset();
  getOptionsMessagesMock.mockReset();
  document.body.innerHTML = `
    <span id="configTransferMsg" class="aobx-transfer-message"></span>
    <span id="msg" class="aobx-status-message"></span>
  `;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('options messages i18n behavior', () => {
  it('binds transfer message text when binder is available', async () => {
    getOptionsI18nBinderMock.mockReturnValue(binderMock);
    getOptionsI18nResourceMock.mockReturnValue({
      messages: { importSuccess: 'Imported successfully' }
    });

    const { showTransferMessage, clearTransferMessage } = await import(
      '../../../src/options/components/messages'
    );
    showTransferMessage('success', { key: 'importSuccess', text: 'Imported successfully' });

    expect(binderMock.bindText).toHaveBeenCalledWith(expect.any(HTMLElement), 'importSuccess');
    const element = document.getElementById('configTransferMsg');
    expect(element?.dataset.i18n).toBe('importSuccess');
    // ✅ Phase 1 DaisyUI migration: 更新测试以匹配新的 Alert 类
    expect(element?.className).toBe('alert alert-success mt-3');

    clearTransferMessage();
    expect(binderHandles[0]?.dispose).toHaveBeenCalled();
    // ✅ Phase 1 DaisyUI migration: 更新测试以匹配新的基础 Alert 类
    expect(element?.className).toBe('alert mt-3');
    expect(element?.textContent).toBe('');
  });

  it('uses localized resource when binder is absent', async () => {
    getOptionsI18nBinderMock.mockReturnValue(null);
    getOptionsI18nResourceMock.mockReturnValue({
      messages: { importSuccess: 'Localized Import' }
    });

    const { showTransferMessage } = await import('../../../src/options/components/messages');
    showTransferMessage('success', { key: 'importSuccess' });

    const element = document.getElementById('configTransferMsg');
    expect(getOptionsMessagesMock).not.toHaveBeenCalled();
    expect(element?.textContent).toBe('Localized Import');
    expect(element?.dataset.i18n).toBe('importSuccess');
  });

  it('handles plain status text without binding metadata', async () => {
    getOptionsI18nBinderMock.mockReturnValue(null);
    getOptionsI18nResourceMock.mockReturnValue(null);
    getOptionsMessagesMock.mockResolvedValue({} as unknown);

    const { showStatusMessage } = await import('../../../src/options/components/messages');
    showStatusMessage('error', 'Something went wrong');

    const element = document.getElementById('msg');
    expect(element?.textContent).toBe('Something went wrong');
    expect(element?.dataset.i18n).toBeUndefined();
    expect(element?.className).toBe('aobx-status-message is-error');
    expect(element?.getAttribute('role')).toBe('status');
    expect(element?.getAttribute('aria-live')).toBe('polite');
  });
});
