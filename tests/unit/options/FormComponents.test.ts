/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

import { AobFormGroup, AobTable } from '@options/components/shared/FormComponents';

describe('FormComponents', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
  });

  it('renders a form group with description, hint, and actions', () => {
    const host = document.getElementById('host');
    if (!(host instanceof HTMLElement)) throw new Error('missing host');
    const formGroup = new AobFormGroup(host);
    const control = document.createElement('input');
    const action = document.createElement('button');
    action.textContent = 'Save';

    const card = formGroup.render({
      id: 'group',
      label: 'General',
      description: 'Description',
      hint: 'Hint',
      control,
      actions: [action]
    });

    expect(card.id).toBe('group');
    expect(card.querySelector('.card-title')?.textContent).toBe('General');
    expect(card.textContent).toContain('Description');
    expect(card.textContent).toContain('Hint');
    expect(card.querySelector('button')?.textContent).toBe('Save');
  });

  it('renders populated and empty table states', () => {
    const host = document.getElementById('host');
    if (!(host instanceof HTMLElement)) throw new Error('missing host');
    const table = new AobTable(host);

    table.render({
      id: 'table',
      caption: 'Config table',
      columns: [
        { key: 'name', label: 'Name', width: '120px' },
        { key: 'value', label: 'Value', className: 'value-col' }
      ],
      rows: [
        { key: 'row-1', cells: [{ content: 'Alpha' }, { content: 'Enabled' }] }
      ]
    });

    expect(host.querySelector('caption')?.textContent).toBe('Config table');
    expect(host.querySelector('[data-row-key="row-1"]')).not.toBeNull();
    expect(host.querySelector('tbody [data-column-key="name"]')?.textContent).toContain('Alpha');

    host.replaceChildren();
    const emptyTable = new AobTable(host);
    emptyTable.render({
      columns: [{ key: 'name', label: 'Name' }],
      rows: [],
      emptyState: { title: 'No rows', description: 'Add one' }
    });
    expect(host.textContent).toContain('No rows');
    expect(host.textContent).toContain('Add one');
  });
});
