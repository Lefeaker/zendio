import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stitchCss = readFileSync(
  resolve(process.cwd(), 'src/options/stitch/styles/stitch.css'),
  'utf8'
);

describe('Stitch runtime polish CSS contracts', () => {
  it('sizes the three-option interface theme segmented control evenly', () => {
    expect(stitchCss).toContain('grid-template-columns: repeat(3, minmax(86px, 1fr));');
    expect(stitchCss).toContain('width: calc((100% - var(--space-2)) / 3);');
    expect(stitchCss).toContain(".interface-theme-grid .chips[data-active-value='dark']::before");
    expect(stitchCss).toContain(".interface-theme-grid .chips[data-active-value='light']::before");
  });

  it('makes the clipper destination selector full-bleed and square-cornered', () => {
    expect(stitchCss).toContain("[data-stitch-surface='clipper'] .export-destination-row");
    expect(stitchCss).toContain('margin-inline: calc(var(--space-7) * -1);');
    expect(stitchCss).toContain('width: calc(100% + (var(--space-7) * 2));');
    expect(stitchCss).toContain("[data-stitch-surface='clipper'] .export-destination-summary");
    expect(stitchCss).toContain('border-radius: 0;');
  });
});
