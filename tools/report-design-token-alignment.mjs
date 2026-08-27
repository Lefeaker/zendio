import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const designPath = join(root, 'src/styles/design-tokens.css');
const themePath = join(root, 'src/ui/stitch-runtime/styles/runtime/theme-tokens.css');
const entryPaths = [
  'src/options/stitch/styles/entries/options.css',
  'src/options/stitch/styles/entries/onboarding.css',
  'src/ui/stitch-runtime/styles/entries/clipper.css',
  'src/ui/stitch-runtime/styles/entries/reader.css',
  'src/ui/stitch-runtime/styles/entries/video.css',
  'src/ui/stitch-runtime/styles/entries/prompt-task.css'
];
const design = readFileSync(designPath, 'utf8');
const theme = readFileSync(themePath, 'utf8');
const aliases = {
  '--bg': '--zendio-stitch-bg',
  '--text': '--zendio-stitch-text',
  '--accent': '--zendio-stitch-accent',
  '--line': '--zendio-stitch-line',
  '--radius-md': '--zendio-stitch-radius-md',
  '--motion-fast': '--zendio-stitch-motion-fast'
};
const surfaceCanonicalValues = {
  dark: {
    '--zendio-stitch-bg': '#09090b',
    '--zendio-stitch-text': '#fafafa',
    '--zendio-stitch-accent': '#a78bfa',
    '--zendio-stitch-line': '#27272a',
    '--zendio-stitch-radius-md': '8px',
    '--zendio-stitch-motion-fast': '140ms'
  },
  light: {
    '--zendio-stitch-bg': '#f5f6fb',
    '--zendio-stitch-text': '#111114',
    '--zendio-stitch-accent': '#7c3aed',
    '--zendio-stitch-line': '#e4e4eb',
    '--zendio-stitch-radius-md': '8px',
    '--zendio-stitch-motion-fast': '140ms'
  }
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function declarationBlock(source, selector) {
  return source.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'u'))?.[1] ?? null;
}

const failures = [];
for (const entryPath of entryPaths) {
  const entry = readFileSync(join(root, entryPath), 'utf8');
  if (!entry.includes('styles/design-tokens.css')) {
    failures.push(`production CSS entry omits design tokens: ${entryPath}`);
  }
}
for (const [legacy, canonical] of Object.entries(aliases)) {
  if (!design.includes(`${canonical}:`)) failures.push(`design authority missing ${canonical}`);
  if (!theme.includes(`${legacy}: var(${canonical})`))
    failures.push(`theme alias missing ${legacy} -> ${canonical}`);
}
for (const [themeName, values] of Object.entries(surfaceCanonicalValues)) {
  const selector =
    themeName === 'dark'
      ? '.stitch-runtime-surface'
      : ".stitch-runtime-surface[data-preview-theme='light']";
  const block = declarationBlock(theme, selector);
  if (block === null) {
    failures.push(`runtime surface canonical block missing: ${selector}`);
    continue;
  }
  for (const [name, value] of Object.entries(values)) {
    const declaration = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`,
      'u'
    );
    if (!declaration.test(block)) {
      failures.push(`runtime surface ${themeName} canonical value missing: ${name}: ${value}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      authority: 'src/styles/design-tokens.css',
      theme: 'src/ui/stitch-runtime/styles/runtime/theme-tokens.css',
      entries: entryPaths,
      aliases,
      surfaceCanonicalValues,
      failures
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
