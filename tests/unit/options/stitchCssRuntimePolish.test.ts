import { readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_IMPORT_PATTERN =
  /^\s*@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"')\s]+))\s*\)?\s*;/;

const stitchCss = readCssWithImports(
  resolve(process.cwd(), 'src/options/stitch/styles/stitch.css')
);

function readCssWithImports(path: string, importStack = new Set<string>()): string {
  if (importStack.has(path)) {
    throw new Error(`Circular CSS import detected for "${path}"`);
  }

  importStack.add(path);
  try {
    let remainingCss = readFileSync(path, 'utf8');
    let resolvedCss = '';

    while (remainingCss.length > 0) {
      const match = CSS_IMPORT_PATTERN.exec(remainingCss);
      if (!match) {
        break;
      }

      const importPath = match[1] ?? match[2] ?? match[3];
      if (!importPath) {
        throw new Error(`Invalid CSS import in "${path}"`);
      }
      resolvedCss += readCssWithImports(normalize(resolve(dirname(path), importPath)), importStack);
      remainingCss = remainingCss.slice(match[0].length);
    }

    return resolvedCss + remainingCss;
  } finally {
    importStack.delete(path);
  }
}

describe('Stitch runtime polish CSS contracts', () => {
  it('sizes the three-option interface theme segmented control evenly', () => {
    expect(stitchCss).toContain('grid-template-columns: repeat(3, minmax(86px, 1fr));');
    expect(stitchCss).toContain('width: calc((100% - var(--space-2)) / 3);');
    expect(stitchCss).toContain(".interface-theme-grid .chips[data-active-value='dark']::before");
    expect(stitchCss).toContain(".interface-theme-grid .chips[data-active-value='light']::before");
  });

  it('keeps the Options brand website link visually unadorned', () => {
    expect(stitchCss).toMatch(
      /\.brand-title-link\s*{[\s\S]*?color:\s*inherit;[\s\S]*?text-decoration:\s*none;/
    );
    expect(stitchCss).toMatch(
      /\.brand-title-link:hover,\s*\.brand-title-link:focus-visible\s*{[\s\S]*?color:\s*inherit;[\s\S]*?text-decoration:\s*none;/
    );
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

  it('centers option table headers and cells while keeping narrow tables scrollable in-place', () => {
    expect(stitchCss).toMatch(
      /\.table-wrap,\s*\.schema-table-wrap\s*{[^}]*max-width:\s*100%;[^}]*overflow:\s*auto;/
    );
    expect(stitchCss).toMatch(
      /th,\s*td\s*{[^}]*text-align:\s*center;[^}]*vertical-align:\s*middle;/
    );
    expect(stitchCss).toMatch(
      /\.table-wrap\s+:is\(\.input,\s*\.select\),\s*\.yaml-table-shell\s+:is\(\.input,\s*\.select\)\s*{[^}]*text-align:\s*center;/
    );
  });

  it('uses dedicated table width contracts for storage, routing, domain mapping, and YAML fields', () => {
    expect(stitchCss).toMatch(
      /\.storage-vault-table-scroll\s+table\s*{[^}]*table-layout:\s*fixed;[^}]*min-width:\s*1000px;/
    );
    expect(stitchCss).toMatch(
      /\.storage-vault-table-scroll\s+:is\(th,\s*td\):nth-child\(2\)\s*{[^}]*width:\s*120px;/
    );
    expect(stitchCss).toMatch(
      /\.storage-vault-table-scroll\s+:is\(th,\s*td\):nth-child\(3\)\s*{[^}]*width:\s*148px;/
    );
    expect(stitchCss).toMatch(
      /\.routing-rules-table-scroll\s+table\s*{[^}]*table-layout:\s*fixed;[^}]*min-width:\s*860px;/
    );
    expect(stitchCss).toMatch(
      /\.routing-rules-table-scroll\s+:is\(th,\s*td\):nth-child\(4\)\s*{[^}]*width:\s*140px;/
    );
    expect(stitchCss).toMatch(
      /\.domain-mapping-table-scroll\s+table\s*{[^}]*table-layout:\s*fixed;[^}]*min-width:\s*720px;/
    );
    expect(stitchCss).toMatch(
      /\.domain-mapping-table-scroll\s+:is\(th,\s*td\):nth-child\(2\)\s*{[^}]*width:\s*148px;/
    );
    expect(stitchCss).toMatch(
      /\.yaml-table-scroll\s+table\s*{[^}]*table-layout:\s*fixed;[^}]*min-width:\s*900px;/
    );
    expect(stitchCss).toMatch(
      /\.stitch-widget-host,\s*\.stitch-widget-host\s*>\s*\*\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/
    );
    expect(stitchCss).toMatch(
      /\.stitch-yaml-config-widget,\s*\.stitch-yaml-config-widget\s*>\s*\*\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/
    );
    expect(stitchCss).toMatch(
      /\.yaml-table-shell\s*{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/
    );
    expect(stitchCss).toMatch(
      /\.yaml-domain-fields-shell\s+table\s*{[^}]*table-layout:\s*fixed;[^}]*min-width:\s*760px;/
    );
    expect(stitchCss).toMatch(
      /\.stitch-yaml-config-table\s+:is\(th,\s*td\):nth-child\(7\)\s*{[^}]*width:\s*132px;/
    );
    expect(stitchCss).toMatch(
      /\.stitch-yaml-domain-fields-table\s+:is\(th,\s*td\):nth-child\(1\)\s*{[^}]*width:\s*88px;/
    );
  });

  it('keeps reading path controls and helper copy responsive inside their control column', () => {
    expect(stitchCss).toMatch(
      /\.reading-template-row\s*{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/
    );
    expect(stitchCss).toMatch(
      /\.reading-mode-select\s*{[^}]*flex:\s*0\s+0\s+auto;[^}]*max-width:\s*100%;/
    );
    expect(stitchCss).toMatch(
      /\.reading-template-row\s+\.input\s*{[^}]*flex:\s*1\s+1\s+220px;[^}]*min-width:\s*0;/
    );
    expect(stitchCss).toMatch(
      /\.template-row-helper,\s*\.modifier-key-description,\s*\.keyboard-shortcuts-description\s*{[^}]*min-width:\s*0;/
    );
  });

  it('keeps Domain Mappings inline-scrolled and centers collapsed session headers', () => {
    expect(stitchCss).toContain('.domain-mapping-table-scroll');
    expect(stitchCss).toContain('max-height: 360px;');
    expect(stitchCss).toContain('.domain-mapping-table-scroll thead th');
    expect(stitchCss).toContain('.resource-modal--session.is-collapsed .surface-window-header');
    expect(stitchCss).toContain('grid-template-columns: minmax(0, max-content);');
    expect(stitchCss).toContain('justify-content: center;');
    expect(stitchCss).toContain('justify-items: center;');
    expect(stitchCss).toMatch(
      /\.resource-modal--session\.is-collapsed\s+\.surface-window-brand\s*{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/
    );
    expect(stitchCss).toMatch(
      /\.resource-modal--session\.is-collapsed\s+\.surface-window-icon\s*{[^}]*flex:\s*0\s+0\s+var\(--session-header-icon-size\);[^}]*transform:\s*none;/
    );
    expect(stitchCss).toMatch(
      /\.resource-modal--session\.is-collapsed\s+\.surface-window-title\s*{[^}]*left:\s*auto;[^}]*top:\s*auto;[^}]*text-align:\s*center;/
    );
  });

  it('uses green for active video screenshot timestamp dots', () => {
    expect(stitchCss).toContain('.video-screenshot-toggle.is-on');
    expect(stitchCss).toContain('.video-screenshot-toggle.is-on::before');
    expect(stitchCss).toContain('.video-screenshot-toggle.is-pending::before');
    expect(stitchCss).toContain('background: var(--success);');
    expect(stitchCss).toContain('var(--warning)');
    expect(stitchCss).toContain('.video-timestamp-marker');
    expect(stitchCss).toContain('gap: 0;');
    expect(stitchCss).toContain('--session-video-screenshot-dot-size: 8px;');
    expect(stitchCss).toContain('--session-video-screenshot-hit-size: 24px;');
    expect(stitchCss).toContain('--session-video-screenshot-hit-inset: 8px;');
    expect(stitchCss).toContain('var(--session-video-screenshot-dot-offset, -2px) -');
    expect(stitchCss).toContain('(var(--session-video-screenshot-hit-inset, 8px) * 2)');
    expect(stitchCss).toContain('height: var(--session-video-screenshot-hit-size, 24px);');
    expect(stitchCss).toContain('z-index: 5;');
    expect(stitchCss).toMatch(
      /\.video-screenshot-toggle::before\s*{[^}]*left:\s*var\(--session-video-screenshot-hit-inset,\s*8px\);/
    );
    expect(stitchCss).toContain('transform: translateY(-50%);');
  });

  it('keeps video timestamp rows centered and uses one gap into fragments', () => {
    expect(stitchCss).toContain('--session-comment-height: 27px;');
    expect(stitchCss).toContain('--session-reader-highlight-weight: 610;');
    expect(stitchCss).toContain('--session-video-fragment-weight: 480;');
    expect(stitchCss).toContain('--session-video-timestamp-row-min-height: 28px;');
    expect(stitchCss).toContain('--session-video-timestamp-adjacent-gap: 1px;');
    expect(stitchCss).toMatch(
      /\.session-item-card\[data-capture-kind='timestamp'\]\s+\+\s+\.session-item-card\[data-capture-kind='timestamp'\]/
    );
    expect(stitchCss).toContain(
      ".session-item-card[data-capture-kind='timestamp'] + .video-fragment-session-item-card"
    );
    expect(stitchCss).toContain('margin-top: var(--session-video-timestamp-adjacent-gap, 0);');
    expect(stitchCss).toContain('min-height: var(--session-video-timestamp-row-min-height, 28px);');
  });

  it('keeps the video add-note row aligned with timestamp note inputs', () => {
    expect(stitchCss).toMatch(
      /\.video-surface-window\s+\.session-add-capture-card\s*{[^}]*grid-template-columns:\s*var\(--session-video-marker-track-width,\s*40px\)\s+minmax\(0,\s*1fr\);/
    );
    expect(stitchCss).toMatch(
      /\.video-surface-window\s+\.session-add-capture-card\s*{[^}]*align-items:\s*center;/
    );
    expect(stitchCss).toMatch(
      /\.video-surface-window\s+\.session-add-capture-card\s+\.session-item-content\s*{[^}]*align-items:\s*center;/
    );
    expect(stitchCss).toMatch(
      /\.video-surface-window\s+\.session-add-capture-card\s+\.session-item-comment-input\s*{[^}]*margin-top:\s*0;/
    );
  });

  it('centers video fragment marker chips inside the video marker track', () => {
    expect(stitchCss).toMatch(
      /\.video-surface-window\s+\.video-fragment-session-item-card\s+\.session-item-marker\s*{[^}]*justify-content:\s*center;/
    );
  });

  it('applies the tuned clipper content radii and spacing tokens', () => {
    expect(stitchCss).toContain('--clipper-selection-radius: 5px;');
    expect(stitchCss).toContain('--clipper-comment-radius: 4px;');
    expect(stitchCss).toContain('--clipper-comment-height: 40px;');
    expect(stitchCss).toContain(
      'padding: var(--clipper-selection-padding-y) var(--clipper-selection-padding-x);'
    );
    expect(stitchCss).toContain('border-radius: var(--clipper-selection-radius);');
    expect(stitchCss).toContain('height: var(--clipper-comment-height);');
  });

  it('uses polished Stitch button treatments for YAML actions and deletes', () => {
    expect(stitchCss).toContain('.yaml-action-button,');
    expect(stitchCss).toContain('.yaml-delete-button');
    expect(stitchCss).toContain('min-height: var(--control-height-sm);');
    expect(stitchCss).toContain('.yaml-delete-button:not(:disabled)');
    expect(stitchCss).toContain('color: var(--danger);');
    expect(stitchCss).toContain('.yaml-actions .yaml-action-button');
  });

  it('brightens resource SVG icons in dark mode without filtering QR media', () => {
    expect(stitchCss).toMatch(
      /html\[data-preview-theme='dark'\]\s+\.resource-link-icon\[src\$='\.svg'\]\s*{[^}]*filter:\s*brightness\(0\)\s+invert\(1\);/
    );
    expect(stitchCss).toContain('.resource-inline-popover-media');
    expect(stitchCss).not.toMatch(/\.resource-link-preview\s*{[^}]*filter:/);
    expect(stitchCss).not.toMatch(/\.resource-image-modal-media\s*{[^}]*filter:/);
    expect(stitchCss).not.toMatch(/\.resource-inline-popover-media\s*{[^}]*filter:/);
  });

  it('keeps QR popovers readable above modal chrome with the requested Xiaohongshu sizing', () => {
    expect(stitchCss).toContain('.resource-inline-popover-host');
    expect(stitchCss).toMatch(/\.resource-inline-popover-trigger\s*{[^}]*font-weight:\s*700;/);
    expect(stitchCss).toMatch(
      /\.resource-inline-popover\s*{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100%\s*\+\s*var\(--space-3\)\);[^}]*z-index:\s*2147483646;/
    );
    expect(stitchCss).not.toMatch(
      /\.resource-inline-popover\s*{[^}]*position:\s*fixed;[^}]*top:\s*50%;/
    );
    expect(stitchCss).toContain('.resource-modal:has(.resource-inline-popover-host:hover),');
    expect(stitchCss).toContain(
      '.resource-modal-body:has(.resource-inline-popover-host:focus-within)'
    );
    expect(stitchCss).toContain('.resource-inline-popover-caption');
    expect(stitchCss).toContain('.prompt-toast .support-prompt-reward-qr-caption');
    expect(stitchCss).toMatch(
      /\.support-prompt-toast\.reward-qr--xiaohongshu\s*{[^}]*width:\s*min\(calc\(var\(--toast-max-width\)\s*\/\s*2\),\s*calc\(100vw\s+-\s+var\(--space-16\)\)\);[^}]*max-width:\s*calc\(var\(--toast-max-width\)\s*\/\s*2\);/
    );
  });

  it('keeps localized Options layouts inside the viewport and constrains diagnostics output', () => {
    expect(stitchCss).toMatch(
      /\.shell\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*calc\(100vw\s+-\s+var\(--shell-sidebar-width\)\);/
    );
    expect(stitchCss).toMatch(/\.main\s*{[^}]*overflow-x:\s*hidden;/);
    expect(stitchCss).toMatch(/\.content\s*{[^}]*width:\s*100%;[^}]*min-width:\s*0;/);
    expect(stitchCss).toMatch(
      /\.panel-stack,\s*\.panel-section,\s*\.group,\s*\.card,\s*\.notice,\s*\.stack\s*{[^}]*min-width:\s*0;/
    );
    expect(stitchCss).toMatch(
      /\.interface-theme-grid\s+\.field\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/
    );
    expect(stitchCss).toMatch(/\.interface-theme-grid\s+\.select\s*{[^}]*max-width:\s*100%;/);
    expect(stitchCss).toMatch(
      /\.output-box\s*{[^}]*max-width:\s*100%;[^}]*max-height:\s*360px;[^}]*overflow:\s*auto;/
    );
    expect(stitchCss).toMatch(
      /\.output-box\s+pre\s*{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/
    );
    expect(stitchCss).toMatch(
      /\.yaml-preview,\s*\.output-box\s*{[^}]*max-width:\s*100%;[^}]*max-height:\s*360px;[^}]*overflow:\s*auto;/
    );
    expect(stitchCss).toMatch(
      /\.yaml-preview\s+pre,\s*\.output-box\s+pre\s*{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/
    );
  });

  it('keeps the Options sidebar adaptive instead of turning it into a stacked mobile block', () => {
    expect(stitchCss).toContain('--shell-sidebar-width: var(--sidebar-width);');
    expect(stitchCss).toMatch(
      /\.sidebar\s*{[^}]*width:\s*var\(--shell-sidebar-width\);[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/
    );
    expect(stitchCss).toMatch(
      /\.shell\s*{[^}]*margin-left:\s*var\(--shell-sidebar-width\);[^}]*width:\s*calc\(100vw\s+-\s+var\(--shell-sidebar-width\)\);[^}]*max-width:\s*calc\(100vw\s+-\s+var\(--shell-sidebar-width\)\);/
    );
    expect(stitchCss).toMatch(
      /\.sidebar-footer\s*{[^}]*position:\s*static;[^}]*margin-top:\s*auto;/
    );
    expect(stitchCss).toMatch(
      /@media\s*\(max-width:\s*1180px\)\s*{[^}]*:root\s*{[^}]*--shell-sidebar-width:\s*var\(--sidebar-compact-width\);/
    );
    expect(stitchCss).toMatch(
      /@media\s*\(max-width:\s*980px\)\s*{[^}]*:root\s*{[^}]*--shell-sidebar-width:\s*var\(--sidebar-narrow-width\);/
    );
    expect(stitchCss).toMatch(
      /@media\s*\(max-width:\s*760px\)\s*{[\s\S]*?\.sidebar\s*{[^}]*display:\s*none;/
    );
    expect(stitchCss).not.toMatch(
      /@media\s*\(max-width:\s*980px\)[\s\S]*?\.sidebar\s*{[^}]*position:\s*static;/
    );
    expect(stitchCss).not.toMatch(
      /@media\s*\(max-width:\s*980px\)[\s\S]*?\.main\s*{[^}]*height:\s*auto;/
    );
  });

  it('lets the onboarding document scroll and uses the Stitch page layout', () => {
    expect(stitchCss).toContain("html[data-route='onboarding'],");
    expect(stitchCss).toContain("body[data-route='onboarding']");
    expect(stitchCss).toContain('overflow-y: auto;');
    expect(stitchCss).toContain('grid-template-columns: auto minmax(0, 1fr);');
    expect(stitchCss).toContain('border-bottom: var(--border-default);');
  });
});
