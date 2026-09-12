import { readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_IMPORT_PATTERN =
  /^\s*@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"')\s]+))\s*\)?\s*;/;

const stitchCss = [
  'src/options/stitch/styles/entries/options.css',
  'src/options/stitch/styles/entries/onboarding.css'
]
  .map((path) => readCssWithImports(resolve(process.cwd(), path)))
  .join('\n');
const previewFixtureCss = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/options-preview/styles/preview.css'),
  'utf8'
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

interface CssBlock {
  body: string;
  closeBraceIndex: number;
}

interface CssRule extends CssBlock {
  selector: string;
}

function readBalancedCssBlock(css: string, openBraceIndex: number): CssBlock {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let inComment = false;

  for (let index = openBraceIndex; index < css.length; index += 1) {
    const character = css[index];
    const nextCharacter = css[index + 1];

    if (inComment) {
      if (character === '*' && nextCharacter === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      inComment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          body: css.slice(openBraceIndex + 1, index),
          closeBraceIndex: index
        };
      }
    }
  }

  throw new Error(`Unclosed CSS block at index ${openBraceIndex}`);
}

function readMediaQueryBlocks(css: string, maxWidth: number): string[] {
  const mediaPattern = new RegExp(
    `@media\\s*\\(\\s*max-width\\s*:\\s*${maxWidth}px\\s*\\)\\s*\\{`,
    'gu'
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mediaPattern.exec(css))) {
    const openBraceIndex = match.index + match[0].lastIndexOf('{');
    const block = readBalancedCssBlock(css, openBraceIndex);
    blocks.push(block.body);
    mediaPattern.lastIndex = block.closeBraceIndex + 1;
  }

  return blocks;
}

function requireMediaQueryBlockContaining(css: string, maxWidth: number, marker: string): string {
  const matches = readMediaQueryBlocks(css, maxWidth).filter((block) => block.includes(marker));
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${maxWidth}px media block containing "${marker}", received ${matches.length}`
    );
  }
  return matches[0];
}

function readTopLevelCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let ruleStart = 0;

  for (let index = 0; index < css.length; index += 1) {
    if (css[index] !== '{') {
      continue;
    }

    const block = readBalancedCssBlock(css, index);
    const selector = css
      .slice(ruleStart, index)
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .trim();
    rules.push({ selector, body: block.body, closeBraceIndex: block.closeBraceIndex });
    index = block.closeBraceIndex;
    ruleStart = block.closeBraceIndex + 1;
  }

  return rules;
}

function findExactCssRule(css: string, selector: string): CssRule | null {
  const matches = readTopLevelCssRules(css).filter((rule) => rule.selector === selector);
  if (matches.length > 1) {
    throw new Error(`Expected at most one exact "${selector}" rule, received ${matches.length}`);
  }
  return matches[0] ?? null;
}

function requireExactCssRule(css: string, selector: string): CssRule {
  const rule = findExactCssRule(css, selector);
  if (!rule) {
    throw new Error(`Missing exact "${selector}" rule`);
  }
  return rule;
}

function exactRuleHasDeclaration(css: string, selector: string, declaration: RegExp): boolean {
  const rule = findExactCssRule(css, selector);
  return rule ? declaration.test(rule.body) : false;
}

function injectDeclarationIntoExactRule(
  css: string,
  selector: string,
  declaration: string
): string {
  const rule = requireExactCssRule(css, selector);
  return `${css.slice(0, rule.closeBraceIndex)}\n    ${declaration}\n  ${css.slice(rule.closeBraceIndex)}`;
}

describe('Stitch runtime polish CSS contracts', () => {
  it('shares equal-width animated geometry across segmented controls', () => {
    const group = requireExactCssRule(stitchCss, '.chips.segmented-control').body;
    const track = requireExactCssRule(stitchCss, '.chips.segmented-control::before').body;
    expect(group).toContain('grid-template-columns: repeat(var(--segment-count), minmax(0, 1fr));');
    expect(track).toContain('width: calc((100% - var(--space-2)) / var(--segment-count));');
    expect(track).toContain('transform: translateX(calc(var(--segment-index) * 100%));');
    expect(track).toContain('transition: transform var(--motion-base) var(--ease-standard);');
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

  it('themes resource SVG icons only on dark document or runtime surfaces', () => {
    expect(stitchCss).toMatch(/\.resource-link-icon\s*{[^}]*filter:\s*none;/);
    expect(stitchCss).toMatch(
      /:is\(html\[data-preview-theme='dark'\],\s*\.stitch-runtime-surface\[data-preview-theme='dark'\]\)\s+\.resource-link-icon\[src\$='\.svg'\]\s*{[^}]*filter:\s*brightness\(0\)\s+invert\(1\);/
    );
    expect(stitchCss).toContain('.resource-inline-popover-media');
    expect(stitchCss).not.toMatch(/\.resource-link-preview\s*{[^}]*filter:/);
    expect(stitchCss).not.toMatch(/\.resource-image-modal-media\s*{[^}]*filter:/);
    expect(stitchCss).not.toMatch(/\.resource-inline-popover-media\s*{[^}]*filter:/);
  });

  it('themes task support SVG icons without inverting them in light mode', () => {
    expect(stitchCss).toMatch(/\.task-support-logo\s*{[^}]*filter:\s*none;/);
    expect(stitchCss).not.toMatch(/\.task-support-logo\s*{[^}]*filter:\s*invert\(/);
    expect(stitchCss).toMatch(
      /:is\(html\[data-preview-theme='dark'\],\s*\.stitch-runtime-surface\[data-preview-theme='dark'\]\)\s+\.task-support-logo\[src\$='\.svg'\]\s*{[^}]*filter:\s*brightness\(0\)\s+invert\(1\);[^}]*opacity:\s*0\.92;/
    );
  });

  it('keeps the preview fixture aligned with production icon theme contracts', () => {
    expect(previewFixtureCss).toMatch(/\.resource-link-icon\s*{[^}]*filter:\s*none;/);
    expect(previewFixtureCss).toMatch(/\.task-support-logo\s*{[^}]*filter:\s*none;/);
    expect(previewFixtureCss).not.toMatch(/\.task-support-logo\s*{[^}]*filter:\s*invert\(/);
    expect(previewFixtureCss).toMatch(
      /:is\(html\[data-preview-theme='dark'\],\s*\.stitch-runtime-surface\[data-preview-theme='dark'\]\)\s+\.resource-link-icon\[src\$='\.svg'\]\s*{[^}]*filter:\s*brightness\(0\)\s+invert\(1\);/
    );
    expect(previewFixtureCss).toMatch(
      /:is\(html\[data-preview-theme='dark'\],\s*\.stitch-runtime-surface\[data-preview-theme='dark'\]\)\s+\.task-support-logo\[src\$='\.svg'\]\s*{[^}]*filter:\s*brightness\(0\)\s+invert\(1\);/
    );
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

  it('keeps autosave failures fixed, assertive, interactive, and mobile visible', () => {
    expect(stitchCss).toMatch(
      /\.aobx-status-message\s*{[^}]*position:\s*fixed;[^}]*z-index:\s*var\(--z-notification\);[^}]*pointer-events:\s*none;/
    );
    expect(stitchCss).toMatch(/\.aobx-status-message__lane\s*{[^}]*pointer-events:\s*auto;/);
    expect(stitchCss).toMatch(
      /\.aobx-status-message__retry:focus-visible\s*{[^}]*box-shadow:\s*var\(--shadow-focus\);/
    );
    expect(stitchCss).toMatch(
      /\.aobx-status-message__retry:disabled,[\s\S]*?\[aria-busy='true'\]\s*{[^}]*cursor:\s*progress;/
    );
    expect(stitchCss).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.aobx-status-message\s*{[^}]*inset:\s*auto var\(--space-4\) var\(--space-4\);[^}]*width:\s*auto;/
    );
  });

  it('keeps one adaptive Options sidebar and presents it off-canvas on mobile', () => {
    const responsive980 = requireMediaQueryBlockContaining(
      stitchCss,
      980,
      '--shell-sidebar-width: var(--sidebar-narrow-width);'
    );
    const responsive760 = requireMediaQueryBlockContaining(
      stitchCss,
      760,
      '[data-mobile-navigation-fallback] .sidebar'
    );
    const staticPosition = /position:\s*static;/u;

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
      /@media\s*\(max-width:\s*760px\)\s*{[\s\S]*?\.sidebar\s*{[^}]*display:\s*flex;[^}]*transform:\s*translateX\(-100%\);/
    );
    expect(stitchCss).toMatch(/\.sidebar\.is-mobile-open\s*{[^}]*transform:\s*translateX\(0\);/);
    expect(stitchCss).toContain('.mobile-navigation-trigger');
    expect(stitchCss).toContain('.mobile-navigation-backdrop.is-visible');
    expect(requireExactCssRule(responsive980, '.sidebar').body).toMatch(
      /padding:\s*var\(--space-5\) var\(--space-3\);/u
    );
    expect(exactRuleHasDeclaration(responsive980, '.sidebar', staticPosition)).toBe(false);
    expect(exactRuleHasDeclaration(responsive980, '.main', /height:\s*auto;/u)).toBe(false);
    expect(
      exactRuleHasDeclaration(
        responsive760,
        '[data-mobile-navigation-fallback] .sidebar',
        staticPosition
      )
    ).toBe(true);
    expect(exactRuleHasDeclaration(responsive760, '.sidebar', staticPosition)).toBe(false);

    const ordinaryStaticSidebar980 = injectDeclarationIntoExactRule(
      responsive980,
      '.sidebar',
      'position: static;'
    );
    expect(exactRuleHasDeclaration(ordinaryStaticSidebar980, '.sidebar', staticPosition)).toBe(
      true
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
