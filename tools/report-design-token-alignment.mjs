import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const designPath = join(root, 'src/styles/design-tokens.css');
const themePath = join(root, 'src/options/stitch/styles/runtime/theme-tokens.css');
const entryPath = join(root, 'src/options/stitch/styles/stitch.css');
const design = readFileSync(designPath, 'utf8');
const theme = readFileSync(themePath, 'utf8');
const entry = readFileSync(entryPath, 'utf8');
const aliases = {
  '--bg': '--zendio-stitch-bg',
  '--text': '--zendio-stitch-text',
  '--accent': '--zendio-stitch-accent',
  '--line': '--zendio-stitch-line',
  '--radius-md': '--zendio-stitch-radius-md',
  '--motion-fast': '--zendio-stitch-motion-fast'
};

const failures = [];
if (!entry.includes("@import '../../../styles/design-tokens.css';")) failures.push('production Stitch entry omits design tokens');
for (const [legacy, canonical] of Object.entries(aliases)) {
  if (!design.includes(`${canonical}:`)) failures.push(`design authority missing ${canonical}`);
  if (!theme.includes(`${legacy}: var(${canonical})`)) failures.push(`theme alias missing ${legacy} -> ${canonical}`);
}

console.log(JSON.stringify({ authority: 'src/styles/design-tokens.css', aliases, failures }, null, 2));
if (failures.length) process.exitCode = 1;
