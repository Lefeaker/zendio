/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { createBadgeElement } from '../../../../src/ui/primitives/badge';
import { DaisyCard } from '../../../../src/ui/primitives/card';
import { createTableElement } from '../../../../src/ui/primitives/table';

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

  it('card and table retain semantic element trees', () => {
    const host = document.createElement('div');
    const card = new DaisyCard(host).render({ title: 'Title', body: 'Body' });
    const table = createTableElement({
      columns: ['Name'],
      rows: [{ cells: [{ text: 'Zendio' }] }]
    });

    expect(card.querySelector('.card-body > .card-title')?.textContent).toBe('Title');
    expect(table.querySelector('table > tbody > tr > td')?.textContent).toBe('Zendio');
  });
});
