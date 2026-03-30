/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createOptionsButtonElement } from '../../../../src/ui/primitives/button';

describe('ui button primitive', () => {
  it('applies unified variant, icon and loading semantics', () => {
    const button = createOptionsButtonElement({
      label: 'Save',
      variant: 'danger',
      iconName: 'Save',
      loading: true
    });

    expect(button.className).toContain('btn-error');
    expect(button.classList.contains('loading')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('preserves click handlers and dataset contract', () => {
    const onClick = vi.fn();
    const button = createOptionsButtonElement({
      label: 'Open',
      dataRole: 'open-dialog',
      dataAttributes: { contractRole: 'open-button' },
      onClick
    });

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.dataset.role).toBe('open-dialog');
    expect(button.dataset.contractRole).toBe('open-button');
  });
});
