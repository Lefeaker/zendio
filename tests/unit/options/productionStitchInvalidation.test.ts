/* @vitest-environment jsdom */

import {
  SECTION_INVALIDATION_SCOPES,
  captureSectionDomSnapshot,
  createSectionInvalidationOwner,
  restoreSectionDomSnapshot,
  type SectionInvalidationScope
} from '@ui/stitch-runtime/render/sectionInvalidation';
import { describe, expect, it, vi } from 'vitest';

describe('section invalidation owner', () => {
  it('publishes the closed Options invalidation union', () => {
    expect(SECTION_INVALIDATION_SCOPES).toEqual([
      'theme',
      'sidebar',
      'resource-modal',
      'overview-usage',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance',
      'locale-schema',
      'all-invariant-recovery'
    ]);
  });

  it('coalesces reentrant same-scope work without dropping cross-key scopes', () => {
    const applied: SectionInvalidationScope[] = [];
    let reentered = false;
    function invalidateReentrantScopes(): void {
      owner.invalidate(['storage', 'maintenance']);
    }
    const owner: ReturnType<typeof createSectionInvalidationOwner> = createSectionInvalidationOwner(
      {
        handlers: {
          storage: () => {
            applied.push('storage');
            if (!reentered) {
              reentered = true;
              invalidateReentrantScopes();
            }
          },
          maintenance: () => applied.push('maintenance'),
          output: () => applied.push('output')
        }
      }
    );

    owner.invalidate(['storage', 'output']);

    expect(applied).toEqual(['storage', 'output', 'storage', 'maintenance']);
  });

  it('rejects empty and unknown scopes instead of rebuilding the whole shell', () => {
    const owner = createSectionInvalidationOwner({ handlers: {} });

    expect(() => owner.invalidate([])).toThrow('SECTION_INVALIDATION_SCOPE_REQUIRED');
    expect(() => owner.invalidate('unknown' as SectionInvalidationScope)).toThrow(
      'UNKNOWN_SECTION_INVALIDATION_SCOPE:unknown'
    );
  });

  it('uses explicit invariant recovery as the only dominant full-render scope', () => {
    const calls: string[] = [];
    const owner = createSectionInvalidationOwner({
      handlers: {
        storage: () => calls.push('storage'),
        'all-invariant-recovery': () => calls.push('all')
      }
    });

    owner.invalidate(['storage', 'all-invariant-recovery']);

    expect(calls).toEqual(['all']);
  });

  it('restores text-input focus, selection, and scroll after owner replacement', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<main class="main"><section><label>Prefix<input value="abcdef"></label></section></main>';
    document.body.append(root);
    const main = root.querySelector<HTMLElement>('.main');
    const input = root.querySelector<HTMLInputElement>('input');
    if (!main || !input) throw new Error('Expected invalidation fixture nodes.');
    main.scrollTop = 88;
    input.focus();
    input.setSelectionRange(2, 5, 'forward');
    const snapshot = captureSectionDomSnapshot(root);

    root.querySelector('section')?.replaceWith(
      Object.assign(document.createElement('section'), {
        innerHTML: '<label>Prefix<input value="abcdef"></label>'
      })
    );
    main.scrollTop = 0;
    restoreSectionDomSnapshot(root, snapshot);

    const nextInput = root.querySelector<HTMLInputElement>('input');
    expect(document.activeElement).toBe(nextInput);
    expect(nextInput?.selectionStart).toBe(2);
    expect(nextInput?.selectionEnd).toBe(5);
    expect(main.scrollTop).toBe(88);
  });

  it('restores a true document selection without focusing an input first', () => {
    const root = document.createElement('div');
    root.innerHTML = '<main class="main"><section><p>selection</p></section></main>';
    document.body.append(root);
    const text = root.querySelector('p')?.firstChild;
    if (!text) throw new Error('Expected document selection text.');
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const snapshot = captureSectionDomSnapshot(root);

    root
      .querySelector('section')
      ?.replaceWith(
        Object.assign(document.createElement('section'), { innerHTML: '<p>selection</p>' })
      );
    selection?.removeAllRanges();
    restoreSectionDomSnapshot(root, snapshot);

    expect(window.getSelection()?.toString()).toBe('elec');
  });

  it.each(['checkbox', 'radio', 'number'])(
    'restores %s focus without text selection APIs',
    (type) => {
      const root = document.createElement('div');
      root.innerHTML = `<main class="main"><section><input type="${type}"></section></main>`;
      document.body.append(root);
      const input = root.querySelector<HTMLInputElement>('input');
      if (!input) throw new Error('Expected focus control.');
      input.focus();
      const snapshot = captureSectionDomSnapshot(root);
      const selectionSpy = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange');

      root.querySelector('section')?.replaceWith(
        Object.assign(document.createElement('section'), {
          innerHTML: `<input type="${type}">`
        })
      );
      restoreSectionDomSnapshot(root, snapshot);

      expect(document.activeElement).toBe(root.querySelector('input'));
      expect(selectionSpy).not.toHaveBeenCalled();
      selectionSpy.mockRestore();
    }
  );

  it('makes late completion after dispose an idempotent no-op', () => {
    const apply = vi.fn();
    const owner = createSectionInvalidationOwner({ handlers: { storage: apply } });
    owner.dispose();
    owner.dispose();

    owner.invalidate('storage');

    expect(owner.active).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
