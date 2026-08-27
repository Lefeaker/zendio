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

console.log(
  JSON.stringify(
    {
      authority: 'src/styles/design-tokens.css',
      theme: 'src/ui/stitch-runtime/styles/runtime/theme-tokens.css',
      entries: entryPaths,
      aliases,
      failures
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
