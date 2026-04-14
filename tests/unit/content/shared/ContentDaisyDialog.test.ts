/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { panelStyleSheetManager } from '@content/shared/panels/styleSheetManager';

vi.mock('@content/shared/focusTrap', () => {
  return {
    FocusTrapController: class {
      private active = false;

      activate(): void {
        this.active = true;
      }

      deactivate(): void {
        this.active = false;
      }

      isActive(): boolean {
        return this.active;
      }
    }
  };
});

import { ContentDialogHost } from '../../../../src/ui/hosts/content';

describe('ContentDialogHost', () => {
  afterEach(() => {
    panelStyleSheetManager.destroy();
    document.body.innerHTML = '';
  });

  it('renders dialog markers and accessibility metadata', () => {
    const dialog = new ContentDialogHost({ title: 'Reader dialog' });
    const host = dialog.render();
    document.body.append(host);
    dialog.show();

    const shadow = host.shadowRoot;
    const modal = shadow?.querySelector<HTMLElement>('[data-element="dialog"]');
    expect(modal?.getAttribute('role')).toBe('dialog');
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(shadow?.querySelector('[data-element="header"]')).not.toBeNull();
    expect(shadow?.querySelector('[data-element="body"]')).not.toBeNull();
    expect(shadow?.querySelector('[data-element="footer"]')).not.toBeNull();
    expect(shadow?.querySelector('[data-action="close"]')?.getAttribute('aria-label')).toBe(
      'Close dialog'
    );
    expect(host.getAttribute('data-aiob-panel-theme')).toBe('tool');
    expect(dialog.isFocusTrapActive()).toBe(true);
  });

  it('invokes onClose from close button and backdrop', () => {
    const onClose = vi.fn();
    const dialog = new ContentDialogHost({
      title: 'Video dialog',
      closeOnBackdrop: true,
      onClose
    });
    const host = dialog.render();
    document.body.append(host);
    dialog.show();

    const shadow = host.shadowRoot;
    const overlay = shadow?.querySelector<HTMLDivElement>('.modal');
    const closeButton = shadow?.querySelector<HTMLButtonElement>('[data-action="close"]');
    closeButton?.click();
    expect(onClose).toHaveBeenCalledTimes(1);

    dialog.show();
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('supports non-modal floating panels without trapping focus', () => {
    const dialog = new ContentDialogHost({
      title: 'Reader panel',
      modal: false,
      trapFocus: false
    });
    const host = dialog.render();
    document.body.append(host);
    dialog.show();

    const shadow = host.shadowRoot;
    const overlay = shadow?.querySelector<HTMLDivElement>('.modal');
    const modal = shadow?.querySelector<HTMLElement>('[data-element="dialog"]');

    expect(overlay?.style.pointerEvents).toBe('none');
    expect(modal?.style.pointerEvents).toBe('auto');
    expect(modal?.getAttribute('aria-modal')).toBe('false');
    expect(dialog.isFocusTrapActive()).toBe(false);
  });
});
