/* @vitest-environment jsdom */

import {
  SECTION_INVALIDATION_SCOPES,
  captureSectionDomSnapshot,
  createSectionInvalidationOwner,
  restoreSectionDomSnapshot,
  type SectionDomSnapshot,
  type SectionInvalidationAcknowledgement,
  type SectionInvalidationScope
} from '@ui/stitch-runtime/render/sectionInvalidation';
import { describe, expect, it, vi } from 'vitest';

const DOMINANT_SCOPES: SectionInvalidationScope[] = ['locale-schema', 'all-invariant-recovery'];

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

  it('acknowledges only after the requested render and snapshot restore complete', async () => {
    const calls: string[] = [];
    const snapshot: SectionDomSnapshot = {
      activePath: null,
      inputSelection: null,
      mainScrollTop: 0,
      selection: null,
      windowScroll: { x: 0, y: 0 }
    };
    const owner = createSectionInvalidationOwner({
      handlers: { maintenance: () => calls.push('render') },
      capture: () => {
        calls.push('capture');
        return snapshot;
      },
      restore: () => calls.push('restore')
    });

    const acknowledgement = owner.invalidateAndWait('maintenance').then((result) => {
      calls.push(result.status);
      return result;
    });

    await expect(acknowledgement).resolves.toEqual({ status: 'rendered' });
    expect(calls).toEqual(['capture', 'render', 'restore', 'rendered']);
  });

  it('settles reentrant acknowledged work after its later render batch', async () => {
    const calls: string[] = [];
    let reentrant: Promise<void> | null = null;
    const owner = createSectionInvalidationOwner({
      handlers: {
        storage: () => {
          calls.push('storage');
          reentrant = owner.invalidateAndWait('maintenance').then((result) => {
            calls.push(result.status);
          });
        },
        maintenance: () => calls.push('maintenance')
      }
    });

    owner.invalidate('storage');
    await (reentrant ?? Promise.reject(new Error('Missing reentrant acknowledgement.')));

    expect(calls).toEqual(['storage', 'maintenance', 'rendered']);
  });

  it.each(DOMINANT_SCOPES)(
    'settles acknowledged work after a dominating %s batch',
    async (dominantScope) => {
      const maintenance = vi.fn();
      const dominant = vi.fn();
      let acknowledgement: Promise<SectionInvalidationAcknowledgement> | null = null;
      const owner = createSectionInvalidationOwner({
        handlers: {
          storage: () => {
            acknowledgement = owner.invalidateAndWait('maintenance');
            owner.invalidate(dominantScope);
          },
          maintenance,
          [dominantScope]: dominant
        }
      });

      owner.invalidate('storage');

      await expect(acknowledgement).resolves.toEqual({ status: 'rendered' });
      expect(dominant).toHaveBeenCalledTimes(1);
      expect(maintenance).not.toHaveBeenCalled();
    }
  );

  it('acknowledges handler failures without rejecting or replaying pending work', async () => {
    const failure = new Error('render failed');
    const maintenance = vi.fn(() => {
      throw failure;
    });
    const owner = createSectionInvalidationOwner({ handlers: { maintenance } });

    await expect(owner.invalidateAndWait('maintenance')).resolves.toEqual({
      status: 'failed',
      error: failure
    });
    expect(maintenance).toHaveBeenCalledTimes(1);
  });

  it('cancels acknowledged work when the canonical owner is disposed', async () => {
    let acknowledgement: Promise<SectionInvalidationAcknowledgement> | null = null;
    const owner = createSectionInvalidationOwner({
      handlers: {
        storage: () => {
          acknowledgement = owner.invalidateAndWait('maintenance');
          owner.dispose();
        },
        maintenance: vi.fn()
      }
    });

    owner.invalidate('storage');

    await expect(acknowledgement).resolves.toEqual({ status: 'cancelled' });
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
