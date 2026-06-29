/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { previewUi } from '@options/stitch/ui/components';

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

  it('renders zero-state usage chart coordinates without NaN SVG attributes', () => {
    const root = document.createElement('section');
    root.innerHTML = `
      <div id="usageAxis"></div>
      <div class="usage-graph">
        <svg id="usageWave">
          <g id="usageGrid"></g>
          <path id="usageFillPath"></path>
          <path id="usageWavePath"></path>
          <g id="usageXAxis"></g>
        </svg>
      </div>
    `;

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
