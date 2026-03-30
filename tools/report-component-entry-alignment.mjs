import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [join(ROOT, 'src'), join(ROOT, 'tests')];
const MANUAL_BUTTON_SCAN_DIRS = [join(ROOT, 'src', 'options', 'components')];
const REMOVED_HELPER = join(ROOT, 'src', 'options', 'components', 'shared', 'DaisyUIHelpers.ts');
const ALLOWED_MANUAL_BUTTON_FILES = new Set([
  join(ROOT, 'src', 'options', 'components', 'shared', 'DaisyButton.ts')
]);

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (
      !fullPath.endsWith('.ts') &&
      !fullPath.endsWith('.tsx') &&
      !fullPath.endsWith('.js') &&
      !fullPath.endsWith('.mjs')
    ) {
      continue;
    }
    inspectFile(fullPath);
  }
}

function inspectFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const relativePath = relative(ROOT, filePath);

  [
    { pattern: /DaisyUIHelpers/g, message: 'legacy helper reference' },
    { pattern: /\bcreateButton\s*\(/g, message: 'legacy createButton() usage' },
    { pattern: /\bcreateInput\s*\(/g, message: 'legacy createInput() usage' },
    { pattern: /\bcreateAlert\s*\(/g, message: 'legacy createAlert() usage' }
  ].forEach(({ pattern, message }) => {
    for (const match of source.matchAll(pattern)) {
      findings.push(`${relativePath}:${lineFor(source, match.index ?? 0)} ${message}`);
    }
  });

  const shouldScanManualButtons = MANUAL_BUTTON_SCAN_DIRS.some((dir) => filePath.startsWith(dir));
  if (!shouldScanManualButtons || ALLOWED_MANUAL_BUTTON_FILES.has(filePath)) {
    return;
  }

  for (const match of source.matchAll(/document\.createElement\((['"])button\1\)/g)) {
    findings.push(
      `${relativePath}:${lineFor(source, match.index ?? 0)} manual button creation outside shared button entry`
    );
  }
}

function lineFor(source, index) {
  return source.slice(0, index).split('\n').length;
}

if (existsSync(REMOVED_HELPER)) {
  findings.push(`${relative(ROOT, REMOVED_HELPER)} legacy helper file still exists`);
}

TARGET_DIRS.forEach((dir) => walk(dir));

if (findings.length > 0) {
  console.error('Component entry alignment check failed:\n');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Component entry alignment passed.');
