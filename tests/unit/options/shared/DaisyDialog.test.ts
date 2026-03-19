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

import { DaisyDialog } from '@options/components/shared/DaisyDialog';

const MARKUP = '<!DOCTYPE html><html><body></body></html>';

describe('DaisyDialog', () => {
  afterEach(() => {
    clipperStyleSheetManager.destroy();
  });

  it('creates shadow DOM with modal content', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const dialog = new DaisyDialog({ title: 'Test', body: 'Content' });
      document.body.append(dialog);

      const shadow = dialog.shadowRoot;
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

      const dialog = new DaisyDialog({
        title: 'Slots',
        body: bodyEl,
        footer: footerButton
      });
      document.body.append(dialog);

      const shadow = dialog.shadowRoot;
      expect(shadow?.querySelector('[data-element="body"]')?.textContent).toContain('Custom body');
      expect(shadow?.querySelector('[data-element="footer"]')?.textContent).toContain('Confirm');
    });
  });

  it('invokes onClose callback when close button clicked', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document, window }) => {
      const onClose = vi.fn();
      const dialog = new DaisyDialog({ title: 'Close', body: 'Body', onClose });
      document.body.append(dialog);

      const closeButton = dialog.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="close"]');
      expect(closeButton).not.toBeNull();
      closeButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      expect(onClose).toHaveBeenCalledOnce();
      expect(document.body.contains(dialog)).toBe(false);
    });
  });

  it('activates focus trap after mounting', async () => {
    await withDomEnvironment(MARKUP, {}, ({ document }) => {
      const dialog = new DaisyDialog({ title: 'Trap', body: 'Focus' });
      document.body.append(dialog);

      expect(dialog.isFocusTrapActive()).toBe(true);
    });
  });
});
