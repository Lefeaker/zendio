import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const primaryDesignTokenPath = join(root, 'src/styles/design-tokens.css');
const removedOptionsWrapperPath = join(root, 'src/options/styles/design-tokens.css');
const retiredTailwindPaths = [
  'tailwind.config.cjs',
  'tailwind.config.global.cjs',
  'tailwind.config.clipper.cjs',
  'tailwind.config.video.cjs',
  'tailwind.shared.cjs',
  'src/styles/tailwind.input.global.css',
  'src/styles/global.tailwind.css'
];

const tokenDefinitionPattern = /--([a-zA-Z0-9_-]+)\s*:/g;

function collectMatches(source, pattern) {
  const values = new Set();
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }
  return values;
}

const primaryDesignTokenSource = readFileSync(primaryDesignTokenPath, 'utf8');

const definedTokens = collectMatches(primaryDesignTokenSource, tokenDefinitionPattern);
const wrapperExists = existsSync(removedOptionsWrapperPath);
const lingeringTailwindPaths = retiredTailwindPaths.filter((path) => existsSync(join(root, path)));

console.log(`Defined CSS tokens: ${definedTokens.size}`);
console.log(`Legacy options token wrapper removed: ${wrapperExists ? 'no' : 'yes'}`);
console.log(
  `Retired Tailwind style chain removed: ${lingeringTailwindPaths.length === 0 ? 'yes' : 'no'}`
);

if (wrapperExists) {
  console.log('');
  console.log('Legacy options token wrapper must be removed:');
  console.log(`- ${removedOptionsWrapperPath.replace(`${root}/`, '')}`);
  process.exitCode = 1;
}

if (lingeringTailwindPaths.length > 0) {
  console.log('');
  console.log('Retired Tailwind files must be removed:');
  for (const path of lingeringTailwindPaths) {
    console.log(`- ${path}`);
  }
  process.exitCode = 1;
}
