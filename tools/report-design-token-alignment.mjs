import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const primaryDesignTokenPath = join(root, 'src/styles/design-tokens.css');
const removedOptionsWrapperPath = join(root, 'src/options/styles/design-tokens.css');
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

const primaryDesignTokenSource = readFileSync(primaryDesignTokenPath, 'utf8');
const tailwindSharedSource = readFileSync(tailwindSharedPath, 'utf8');

const definedTokens = collectMatches(primaryDesignTokenSource, tokenDefinitionPattern);
const referencedTokens = collectMatches(tailwindSharedSource, tokenUsagePattern);

const missingTokens = [...referencedTokens].filter((token) => !definedTokens.has(token)).sort();
const referencedDefinedTokens = [...referencedTokens].filter((token) => definedTokens.has(token)).sort();
const wrapperExists = existsSync(removedOptionsWrapperPath);

console.log(`Defined CSS tokens: ${definedTokens.size}`);
console.log(`Tailwind-shared token references: ${referencedTokens.size}`);
console.log(`Matched token references: ${referencedDefinedTokens.length}`);
console.log(`Missing token references: ${missingTokens.length}`);
console.log(`Legacy options token wrapper removed: ${wrapperExists ? 'no' : 'yes'}`);

if (missingTokens.length > 0) {
  console.log('');
  console.log('Missing CSS token definitions:');
  for (const token of missingTokens) {
    console.log(`- --${token}`);
  }
  process.exitCode = 1;
}

if (wrapperExists) {
  console.log('');
  console.log('Legacy options token wrapper must be removed:');
  console.log(`- ${removedOptionsWrapperPath.replace(`${root}/`, '')}`);
  process.exitCode = 1;
}
