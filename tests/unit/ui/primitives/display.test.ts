/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createAlertElement } from '../../../../src/ui/primitives/alert';
import { createBadgeElement } from '../../../../src/ui/primitives/badge';
import {
  createContentSurfacePanel,
  createOptionsPanel
} from '../../../../src/ui/primitives/layout';

describe('ui display primitives', () => {
  it('badge supports icon and info/neutral variants', () => {
    const badge = createBadgeElement({
      label: 'Info',
      variant: 'info',
      iconName: 'Info',
      dataRole: 'status-badge'
    });

    expect(badge.className).toContain('badge-info');
    expect(badge.dataset.role).toBe('status-badge');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('alert supports dismiss contract', () => {
    const onDismiss = vi.fn();
    const alert = createAlertElement({
      type: 'warning',
      message: 'Heads up',
      description: 'Check this first',
      dismissible: true,
      onDismiss
    });

    const button = alert.querySelector('button');
    expect(alert.className).toContain('alert-warning');
    expect(alert.textContent).toContain('Heads up');
    expect(alert.textContent).toContain('Check this first');
    button?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('panel/layout aliases create stable surface primitives', () => {
    const optionsPanel = createOptionsPanel();
    const contentPanel = createContentSurfacePanel();

    expect(optionsPanel.className).toContain('rounded-lg');
    expect(contentPanel.className).toContain('rounded-xl');
  });
});
