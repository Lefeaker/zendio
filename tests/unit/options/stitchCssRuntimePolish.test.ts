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

  it('keeps runtime surface fills clipped to their rounded borders', () => {
    expect(stitchCss).toContain('.clipper-footer-bar');
    expect(stitchCss).toContain('.resource-modal.resource-modal--session');
    expect(stitchCss).toContain('.resource-modal--clipper .surface-window-body');
    expect(stitchCss).toContain('border-radius: 0 0 var(--radius-xl) var(--radius-xl);');
    expect(stitchCss).toContain('overflow: hidden;');
    expect(stitchCss).not.toContain('background-clip: padding-box;');
  });

  it('keeps the YAML field table as an inline scrolling region with sticky headers', () => {
    expect(stitchCss).toContain('.yaml-table-shell.yaml-table-scroll');
    expect(stitchCss).toContain('max-height: 440px;');
    expect(stitchCss).toContain('overflow: auto;');
    expect(stitchCss).toContain('.yaml-table-scroll thead th');
    expect(stitchCss).toContain('position: sticky;');
    expect(stitchCss).toContain('top: 0;');
  });

  it('keeps Domain Mappings inline-scrolled and centers collapsed session headers', () => {
    expect(stitchCss).toContain('.domain-mapping-table-scroll');
    expect(stitchCss).toContain('max-height: 360px;');
    expect(stitchCss).toContain('.domain-mapping-table-scroll thead th');
    expect(stitchCss).toContain('.resource-modal--session.is-collapsed .surface-window-header');
    expect(stitchCss).toContain('grid-template-columns: auto minmax(0, auto);');
    expect(stitchCss).toContain('justify-content: center;');
  });

  it('uses green for active video screenshot timestamp dots', () => {
    expect(stitchCss).toContain('.video-screenshot-toggle.is-on');
    expect(stitchCss).toContain('background: var(--success);');
  });

  it('uses polished Stitch button treatments for YAML actions and deletes', () => {
    expect(stitchCss).toContain('.yaml-action-button,');
    expect(stitchCss).toContain('.yaml-delete-button');
    expect(stitchCss).toContain('min-height: var(--control-height-sm);');
    expect(stitchCss).toContain('.yaml-delete-button:not(:disabled)');
    expect(stitchCss).toContain('color: var(--danger);');
    expect(stitchCss).toContain('.yaml-actions .yaml-action-button');
  });
});
