/* @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withDomEnvironment } from '../../../utils/domEnvironment';
import { clipperStyleSheetManager } from '@content/clipper/shared/styleSheetManager';

vi.mock('@content/shared/focusTrap', () => {
  return {
    FocusTrapController: class {
      private active = false;
      private readonly options?: { onDeactivate?: () => void };

      constructor(_container: HTMLElement, options?: { onDeactivate?: () => void }) {
        this.options = options;
      }

      activate(): void {
        this.active = true;
      }

      deactivate(): void {
        if (!this.active) {
          return;
        }
        this.active = false;
        this.options?.onDeactivate?.();
      }

      isActive(): boolean {
        return this.active;
      }
    }
  };
});

import { ShadowDialogHost } from '../../../../src/ui/hosts/shadow';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('ShadowDialogHost', () => {
  afterEach(() => {
    clipperStyleSheetManager.destroy();
  });

  it('creates shadow DOM with modal content', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const dialog = new ShadowDialogHost({ title: 'Test', body: 'Content' });
      const host = dialog.render();
      document.body.append(host);

      const shadow = host.shadowRoot;
      expect(shadow).toBeTruthy();
      expect(shadow?.querySelector('.modal-box')).not.toBeNull();
      expect(shadow?.querySelector('[data-element="body"]')?.textContent).toContain('Content');
    });
  });

  it('renders custom HTMLElement body and footer slot', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const bodyEl = document.createElement('div');
      bodyEl.textContent = 'Custom body';
      const footerButton = document.createElement('button');
      footerButton.textContent = 'Confirm';

      const dialog = new ShadowDialogHost({
        title: 'Slots',
        body: bodyEl,
        footer: footerButton
      });
      const host = dialog.render();
      document.body.append(host);

      const shadow = host.shadowRoot;
      expect(shadow?.querySelector('[data-element="body"]')?.textContent).toContain('Custom body');
      expect(shadow?.querySelector('[data-element="footer"]')?.textContent).toContain('Confirm');
    });
  });

  it('invokes onClose callback when close button clicked', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document, window }) => {
      const onClose = vi.fn();
      const dialog = new ShadowDialogHost({ title: 'Close', body: 'Body', onClose });
      const host = dialog.render();
      document.body.append(host);

      const closeButton =
        host.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="close"]');
      expect(closeButton).not.toBeNull();
      closeButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      expect(onClose).toHaveBeenCalledOnce();
      expect(document.body.contains(host)).toBe(false);
    });
  });

  it('activates focus trap after mounting', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const dialog = new ShadowDialogHost({ title: 'Trap', body: 'Focus' });
      const host = dialog.render();
      document.body.append(host);

      expect(dialog.isFocusTrapActive()).toBe(true);
    });
  });
});
