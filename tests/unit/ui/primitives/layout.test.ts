/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  createContentActionRow,
  createContentSurfacePanel,
  createOptionsMessageList,
  createOptionsSettingRow
} from '../../../../src/ui/primitives/layout';

describe('ui layout primitives', () => {
  it('creates options setting rows and message lists with shared contracts', () => {
    const row = createOptionsSettingRow();
    const list = createOptionsMessageList(['one', 'two'], { role: 'status' });

    expect(row.className).toContain('grid');
    expect(list.getAttribute('role')).toBe('status');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('creates content action rows and surface panels', () => {
    const actions = createContentActionRow();
    const panel = createContentSurfacePanel({ children: [actions] });

    expect(actions.className).toContain('flex');
    expect(panel.className).toContain('rounded-xl');
    expect(panel.firstElementChild).toBe(actions);
  });
});
