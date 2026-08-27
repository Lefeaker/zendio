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
