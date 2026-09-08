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

    const { showTransferMessage, clearTransferMessage } =
      await import('../../../src/options/components/messages');
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

    const host = document.getElementById('msg');
    const element = host?.querySelector<HTMLElement>('[data-message-lane="general"]');
    expect(host?.className).toBe('aobx-status-message is-error');
    expect(host?.getAttribute('role')).toBe('status');
    expect(host?.getAttribute('aria-live')).toBe('polite');
    expect(element?.textContent).toBe('Something went wrong');
    expect(element?.dataset.i18n).toBeUndefined();
    expect(element?.className).toBe('aobx-status-message__lane is-general is-error');
    expect(element?.getAttribute('role')).toBe('status');
    expect(element?.getAttribute('aria-live')).toBe('polite');
  });

  it('keeps the autosave alert persistent and coalesces its busy retry action', async () => {
    getOptionsI18nBinderMock.mockReturnValue(null);
    getOptionsI18nResourceMock.mockReturnValue(null);
    let releaseRetry: (() => void) | undefined;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseRetry = resolve;
        })
    );
    const { clearAutoSaveFailure, showAutoSaveFailure, showStatusMessage } =
      await import('../../../src/options/components/messages');

    showAutoSaveFailure({
      message: 'Changes are still unsaved.',
      guidance: 'Shorten the value.',
      retryLabel: 'Retry saving',
      retry
    });
    showStatusMessage('success', 'Unrelated success');
    vi.advanceTimersByTime(2000);

    const lane = document.querySelector<HTMLElement>('[data-message-lane="autosave"]');
    const button = lane?.querySelector<HTMLButtonElement>('button');
    expect(lane?.hidden).toBe(false);
    expect(lane?.getAttribute('role')).toBe('alert');
    expect(lane?.getAttribute('aria-live')).toBe('assertive');
    expect(lane?.textContent).toContain('Changes are still unsaved.');
    expect(lane?.textContent).toContain('Shorten the value.');
    expect(button?.textContent).toBe('Retry saving');

    button?.click();
    button?.click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');

    releaseRetry?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(button?.disabled).toBe(false);
    expect(button?.hasAttribute('aria-busy')).toBe(false);

    clearAutoSaveFailure();
    expect(lane?.hidden).toBe(true);
  });
});
