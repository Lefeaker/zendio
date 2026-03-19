import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const designTokenPaths = [
  join(root, 'src/styles/design-tokens.css'),
  join(root, 'src/options/styles/design-tokens.css')
];
const tailwindSharedPath = join(root, 'tailwind.shared.cjs');

const tokenDefinitionPattern = /--([a-zA-Z0-9_-]+)\s*:/g;
const tokenUsagePattern = /var\(--([a-zA-Z0-9_-]+)\)/g;

function collectMatches(source, pattern) {
  const values = new Set();
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }
  return values;
}

const [designTokenSources, tailwindSharedSource] = await Promise.all([
  Promise.all(designTokenPaths.map((filePath) => readFile(filePath, 'utf8'))),
  readFile(tailwindSharedPath, 'utf8')
]);

const definedTokens = new Set();
for (const source of designTokenSources) {
  const tokens = collectMatches(source, tokenDefinitionPattern);
  for (const token of tokens) {
    definedTokens.add(token);
  }
}
const referencedTokens = collectMatches(tailwindSharedSource, tokenUsagePattern);

const missingTokens = [...referencedTokens].filter((token) => !definedTokens.has(token)).sort();
const referencedDefinedTokens = [...referencedTokens].filter((token) => definedTokens.has(token)).sort();

console.log(`Defined CSS tokens: ${definedTokens.size}`);
console.log(`Tailwind-shared token references: ${referencedTokens.size}`);
console.log(`Matched token references: ${referencedDefinedTokens.length}`);
console.log(`Missing token references: ${missingTokens.length}`);

if (missingTokens.length > 0) {
  console.log('');
  console.log('Missing CSS token definitions:');
  for (const token of missingTokens) {
    console.log(`- --${token}`);
  }
  process.exitCode = 1;
}
