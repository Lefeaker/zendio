/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModalController } from '@options/components/infrastructure/ModalController';

describe('ModalController', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="sampleTrigger">Open</button>
      <div id="sampleModal" class="sample-modal hidden" aria-hidden="true">
        <button data-modal-close>Close</button>
        <div data-modal-autofocus></div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens and closes modal via trigger and dispose cleans listeners', async () => {
    const controller = new ModalController({
      document,
      bindings: [{ triggerId: 'sampleTrigger', modalId: 'sampleModal' }]
    });

    const trigger = document.getElementById('sampleTrigger');
    const modal = document.getElementById('sampleModal');
    const close = modal?.querySelector('[data-modal-close]');
    if (!(trigger instanceof HTMLButtonElement) || !modal || !(close instanceof HTMLElement)) {
      throw new Error('Modal elements missing');
    }

    trigger.click();
    await Promise.resolve();
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.classList.contains('flex')).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('false');

    close.click();
    await Promise.resolve();
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.classList.contains('flex')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');

    controller.dispose();
    trigger.click();
    await Promise.resolve();
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.classList.contains('flex')).toBe(false);
  });

  it('closes open modals on overlay click and escape, and dispose stays idempotent', async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const controller = new ModalController({
      document,
      bindings: [{ triggerId: 'sampleTrigger', modalId: 'sampleModal', onOpen, onClose }]
    });

    const trigger = document.getElementById('sampleTrigger');
    const modal = document.getElementById('sampleModal');
    if (!(trigger instanceof HTMLButtonElement) || !(modal instanceof HTMLElement)) {
      throw new Error('Modal elements missing');
    }
    trigger.click();
    await Promise.resolve();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(modal.classList.contains('flex')).toBe(true);

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    trigger.click();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(modal.getAttribute('aria-hidden')).toBe('true');

    controller.dispose();
    controller.dispose();
  });

});
