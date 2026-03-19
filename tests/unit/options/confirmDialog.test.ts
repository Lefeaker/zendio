/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  vi.resetModules();
  binderHandles.length = 0;
  binderMock.bindText.mockClear();
  binderMock.bindAttr.mockClear();
  getOptionsI18nBinderMock.mockReset();
  getOptionsI18nResourceMock.mockReset();
  getOptionsMessagesMock.mockReset();
  document.body.innerHTML = '';
});

describe('showConfirmDialog i18n handling', () => {
  it('binds dialog content when binder is available', async () => {
    getOptionsI18nBinderMock.mockReturnValue(binderMock);
    getOptionsI18nResourceMock.mockReturnValue({
      messages: {
        deleteVaultDialogTitle: 'Delete vault',
        deleteVaultConfirm: 'Delete this vault?',
        deleteVaultButton: 'Delete',
        cancelButton: 'Cancel'
      }
    });

    const { showConfirmDialog } = await import('../../../src/options/components/controls/confirmDialog');
    const promise = showConfirmDialog({
      title: { key: 'deleteVaultDialogTitle', text: 'Delete vault' },
      message: { key: 'deleteVaultConfirm', text: 'Delete this vault?' },
      confirmLabel: { key: 'deleteVaultButton', text: 'Delete' },
      cancelLabel: { key: 'cancelButton', text: 'Cancel' },
      tone: 'danger'
    });

    const confirmButton = document.querySelector('button.btn-danger');
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error('Expected confirm button element');
    }
    confirmButton.click();
    const result = await promise;

    expect(result).toBe(true);
    expect(binderMock.bindText).toHaveBeenCalledTimes(4);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    binderHandles.forEach(handle => {
      expect(handle.dispose).toHaveBeenCalled();
    });
  });

  it('uses resource strings when binder is absent', async () => {
    getOptionsI18nBinderMock.mockReturnValue(null);
    getOptionsI18nResourceMock.mockReturnValue({
      messages: {
        deleteRuleDialogTitle: 'Remove Rule',
        ruleDeleteConfirm: 'Remove this rule?',
        deleteRuleButton: 'Remove',
        cancelButton: 'Cancel'
      }
    });

    const { showConfirmDialog } = await import('../../../src/options/components/controls/confirmDialog');
    const promise = showConfirmDialog({
      title: { key: 'deleteRuleDialogTitle' },
      message: { key: 'ruleDeleteConfirm' },
      confirmLabel: { key: 'deleteRuleButton' },
      cancelLabel: { key: 'cancelButton' }
    });

    const title = document.querySelector('h3');
    if (!(title instanceof HTMLElement)) {
      throw new Error('Expected modal title element');
    }
    expect(title.textContent).toBe('Remove Rule');
    expect(title.dataset.i18n).toBe('deleteRuleDialogTitle');
    expect(getOptionsMessagesMock).not.toHaveBeenCalled();

    const cancelButton = document.querySelector('.btn-ghost');
    if (!(cancelButton instanceof HTMLButtonElement)) {
      throw new Error('Expected cancel button element');
    }
    cancelButton.click();
    const result = await promise;

    expect(result).toBe(false);
  });
});
