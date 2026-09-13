/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { previewUi, syncSegmentedNav } from '@options/stitch/ui/components';

describe('Stitch UI components', () => {
  it('prevents mouse focus scrolling on action buttons while preserving click actions', () => {
    const onClick = vi.fn();
    const button = previewUi.Button('测试连接', { variant: 'primary', onClick });
    document.body.append(button);

    const pointerEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(pointerEvent);
    button.click();

    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps swatch names and the visible caption in sync with user and stored choices', () => {
    const onChange = vi.fn();
    const field = previewUi.SegmentedNav(
      [
        {
          value: 'gradient',
          label: 'Gradiente púrpura-azul',
          swatchClassName: 'highlight-gradient'
        },
        { value: 'yellow', label: 'Amarillo neón', swatchClassName: 'highlight-neon-yellow' }
      ],
      'yellow',
      onChange,
      'segmented-control'
    );
    const group = field.querySelector<HTMLElement>('.segmented-control');
    const caption = field.querySelector('.segment-caption');
    const buttons = field.querySelectorAll('button');
    if (!group || !buttons[0] || !buttons[1]) throw new Error('Missing swatch controls');
    expect(caption?.textContent).toBe('Amarillo neón');
    expect(buttons[1].title).toBe('Amarillo neón');
    expect(buttons[1].querySelector('.sr-only')?.textContent).toBe('Amarillo neón');
    expect(buttons[1].querySelector('.segment-swatch')?.getAttribute('aria-hidden')).toBe('true');
    buttons[0].click();
    expect(onChange).toHaveBeenCalledWith('gradient');
    expect(caption?.textContent).toBe('Gradiente púrpura-azul');
    syncSegmentedNav(group, 'yellow');
    expect(caption?.textContent).toBe('Amarillo neón');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('retains semantic select, switch and table slots through primitive entries', () => {
    const select = previewUi.Select(
      [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' }
      ],
      'b'
    );
    const switchRow = previewUi.SwitchRow({ checked: true });
    const table = previewUi.Table({
      columns: ['Name'],
      rows: [{ cells: [{ text: 'Zendio' }] }]
    });

    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(select.value).toBe('b');
    expect(switchRow.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(table.querySelector('table > thead th')?.getAttribute('scope')).toBe('col');
  });

  it('renders zero-state usage chart coordinates without NaN SVG attributes', () => {
    const root = document.createElement('section');

    previewUi.renderUsageChart(root, [
      { label: '06-27', value: 0 },
      { label: '06-28', value: 0 },
      { label: '06-29', value: 0 }
    ]);

    const svg = root.querySelector<SVGSVGElement>('#usageWave');
    const gridLines = Array.from(root.querySelectorAll<SVGLineElement>('#usageGrid line'));
    const axis = root.querySelector<HTMLElement>('#usageAxis');
    const fillPath = root.querySelector<SVGPathElement>('#usageFillPath');
    const wavePath = root.querySelector<SVGPathElement>('#usageWavePath');
    const xAxis = root.querySelector<SVGGElement>('#usageXAxis');

    expect(root.querySelector('.usage-axis')).toBeTruthy();
    expect(root.querySelector('.usage-graph')).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 480 180');
    expect(gridLines).toHaveLength(4);
    expect(axis?.textContent).toContain('20');
    expect(xAxis?.textContent).toContain('06-29');
    expect(fillPath?.getAttribute('d')).not.toContain('NaN');
    expect(wavePath?.getAttribute('d')).not.toContain('NaN');
    gridLines.forEach((line) => {
      expect(line.getAttribute('y1')).not.toContain('NaN');
      expect(line.getAttribute('y2')).not.toContain('NaN');
    });
  });
});
