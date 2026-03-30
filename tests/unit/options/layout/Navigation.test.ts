/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { Navigation } from '@options/components/layout/Navigation';

describe('Navigation', () => {
  let container: HTMLElement;
  let navigation: Navigation;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.append(container);
    navigation = new Navigation(container);
  });

  it('renders items and marks the active section', () => {
    navigation.setMessages({ settingsTitle: 'Settings nav' } as never);

    const element = navigation.render({
      items: [
        { id: 'usage', label: 'Usage' },
        { id: 'rest', label: 'REST' }
      ],
      activeId: 'rest'
    });

    expect(element.getAttribute('aria-label')).toBe('Settings nav');
    const activeItem = container.querySelector<HTMLElement>('[data-section-id="rest"]');
    expect(activeItem?.classList.contains('is-active')).toBe(true);
    expect(activeItem?.querySelector('a')?.hasAttribute('aria-current')).toBe(false);
    const inactiveItem = container.querySelector<HTMLElement>('[data-section-id="usage"]');
    expect(inactiveItem?.querySelector('a')?.hasAttribute('aria-current')).toBe(false);
  });

  it('updates the active section and invokes onNavigate when clicking a new item', () => {
    const calls: string[] = [];
    navigation.render({
      items: [
        { id: 'usage', label: 'Usage' },
        { id: 'rest', label: 'REST' }
      ],
      activeId: 'usage',
      onNavigate: (id) => calls.push(id)
    });

    const restLink = container.querySelector<HTMLAnchorElement>('[data-section-id="rest"] a');
    restLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(calls).toEqual(['rest']);
    expect(container.querySelector('[data-section-id="rest"]')?.classList.contains('is-active')).toBe(true);
    expect(container.querySelector('[data-section-id="rest"] a')?.getAttribute('aria-current')).toBe('true');
    expect(container.querySelector('[data-section-id="usage"] a')?.hasAttribute('aria-current')).toBe(false);
  });

  it('still invokes onNavigate when clicking the already-active item', () => {
    const calls: string[] = [];
    navigation.render({
      items: [{ id: 'usage', label: 'Usage' }],
      activeId: 'usage',
      onNavigate: (id) => calls.push(id)
    });

    const usageLink = container.querySelector<HTMLAnchorElement>('[data-section-id="usage"] a');
    usageLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(calls).toEqual(['usage']);
    expect(container.querySelector('[data-section-id="usage"] a')?.hasAttribute('aria-current')).toBe(false);
  });

  it('setActive updates classes after render', () => {
    navigation.render({
      items: [
        { id: 'usage', label: 'Usage' },
        { id: 'diagnosis', label: 'Diagnosis' }
      ],
      activeId: 'usage'
    });

    navigation.setActive('diagnosis');

    expect(container.querySelector('[data-section-id="diagnosis"]')?.classList.contains('aobx-navigation__item--active')).toBe(true);
    expect(container.querySelector('[data-section-id="diagnosis"] a')?.getAttribute('aria-current')).toBe('true');
    expect(container.querySelector('[data-section-id="usage"]')?.classList.contains('is-active')).toBe(false);
  });
});
