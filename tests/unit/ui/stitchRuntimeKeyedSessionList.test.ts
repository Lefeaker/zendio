/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  createKeyedSessionList,
  patchSessionElement
} from '../../../src/ui/stitch-runtime/render/keyedSessionList';

interface Item {
  id: string;
  label: string;
}

function template(item: Item): HTMLElement {
  const article = document.createElement('article');
  article.dataset.itemId = item.id;
  const input = document.createElement('input');
  input.value = item.label;
  article.append(input);
  return article;
}

function previewTemplate(item: Item, className = 'template-current'): HTMLElement {
  const article = document.createElement('article');
  article.dataset.itemId = item.id;
  const preview = document.createElement('p');
  preview.className = `session-item-primary-line ${className}`;
  preview.dataset.templateLabel = item.label;
  preview.textContent = item.label;
  article.append(preview);
  return article;
}

describe('keyed session list', () => {
  it('retains keyed nodes while inserting, moving, updating and removing in bounded work', () => {
    const container = document.createElement('div');
    const initial = template({ id: 'a', label: 'A' });
    container.append(initial);
    const list = createKeyedSessionList<Item>({
      container,
      keyOf: (item) => item.id,
      create: template,
      update: (element, item) => patchSessionElement(element, template(item)),
      initial: [{ key: 'a', element: initial }]
    });

    const first = list.reconcile([
      { id: 'a', label: 'A2' },
      { id: 'b', label: 'B' }
    ]);
    const retained = list.get('a');
    const second = list.reconcile([
      { id: 'b', label: 'B2' },
      { id: 'a', label: 'A3' }
    ]);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(list.get('a')).toBe(retained);
    expect(
      Array.from(container.children).map((node) => (node as HTMLElement).dataset.itemId)
    ).toEqual(['b', 'a']);

    const removed = list.reconcile([{ id: 'a', label: 'A4' }]);
    expect(removed.removed).toBe(1);
    expect(list.get('b')).toBeNull();
  });

  it('preserves the focused input value and selection during an item patch', () => {
    const current = template({ id: 'a', label: 'live draft' });
    document.body.append(current);
    const input = current.querySelector('input');
    if (!input) throw new Error('input missing');
    input.focus();
    input.setSelectionRange(2, 6);

    patchSessionElement(current, template({ id: 'a', label: 'server value' }));

    expect(current.querySelector('input')).toBe(input);
    expect(input.value).toBe('live draft');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(6);
  });

  it('preserves only interaction-owned preview state while applying fresh template attributes', () => {
    const current = previewTemplate({ id: 'a', label: 'before' }, 'template-stale');
    const preview = current.querySelector<HTMLElement>('.session-item-primary-line');
    if (!preview) throw new Error('preview missing');
    preview.classList.add('is-expanded', 'stale-template-class');
    preview.setAttribute('role', 'button');
    preview.setAttribute('tabindex', '0');
    preview.setAttribute('aria-expanded', 'true');
    preview.setAttribute('data-stale-template', 'remove-me');

    patchSessionElement(current, previewTemplate({ id: 'a', label: 'after' }, 'template-current'));

    expect(preview).toBe(current.querySelector('.session-item-primary-line'));
    expect(preview.classList.contains('is-expanded')).toBe(true);
    expect(preview.classList.contains('template-current')).toBe(true);
    expect(preview.classList.contains('template-stale')).toBe(false);
    expect(preview.classList.contains('stale-template-class')).toBe(false);
    expect(preview.getAttribute('role')).toBe('button');
    expect(preview.getAttribute('tabindex')).toBe('0');
    expect(preview.getAttribute('aria-expanded')).toBe('true');
    expect(preview.hasAttribute('data-stale-template')).toBe(false);
    expect(preview.dataset.templateLabel).toBe('after');
    expect(preview.textContent).toBe('after');
  });

  it('uses fresh template preview state after a keyed item is removed and recreated', () => {
    const container = document.createElement('div');
    const initial = previewTemplate({ id: 'a', label: 'before' });
    const preview = initial.querySelector<HTMLElement>('.session-item-primary-line');
    if (!preview) throw new Error('preview missing');
    preview.classList.add('is-expanded');
    preview.setAttribute('role', 'button');
    preview.setAttribute('tabindex', '0');
    preview.setAttribute('aria-expanded', 'true');
    container.append(initial);
    const list = createKeyedSessionList<Item>({
      container,
      keyOf: (item) => item.id,
      create: previewTemplate,
      update: (element, item) => patchSessionElement(element, previewTemplate(item)),
      initial: [{ key: 'a', element: initial }]
    });

    list.reconcile([]);
    list.reconcile([{ id: 'a', label: 'after' }]);

    const recreated = list.get('a')?.querySelector<HTMLElement>('.session-item-primary-line');
    expect(recreated).not.toBe(preview);
    expect(recreated?.classList.contains('is-expanded')).toBe(false);
    expect(recreated?.hasAttribute('role')).toBe(false);
    expect(recreated?.hasAttribute('tabindex')).toBe(false);
    expect(recreated?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('fails closed for missing and duplicate keys', () => {
    const container = document.createElement('div');
    const list = createKeyedSessionList<Item>({
      container,
      keyOf: (item) => item.id,
      create: template,
      update: () => undefined
    });
    expect(() => list.reconcile([{ id: '', label: 'empty' }])).toThrow(/non-empty key/);
    expect(() =>
      list.reconcile([
        { id: 'same', label: 'A' },
        { id: 'same', label: 'B' }
      ])
    ).toThrow(/Duplicate keyed session item/);
  });
});
