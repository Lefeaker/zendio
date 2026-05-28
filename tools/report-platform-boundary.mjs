import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, 'src');
const FINALIZED_ALLOWLIST = false;

const PLATFORM_ADAPTER_ROOTS = ['src/platform/chrome/', 'src/platform/firefox/'];
const PLATFORM_ADAPTER_FILES = new Set(['src/platform/services.ts']);
const COMPOSITION_ROOT_FILES = new Set([
  'src/background/index.ts',
  'src/content/index.ts',
  'src/options/index.ts',
  'src/onboarding/index.ts',
  'src/options/runtimeEntry.ts'
]);
const OFFSCREEN_PERMISSION_ROOT_FILES = new Set([
  'src/offscreen/localVault.ts',
  'src/content/runtime/localVaultPermissionFrame.ts'
]);
const SHARED_RUNTIME_HELPER_FILES = new Set([
  'src/shared/types/result.ts',
  'src/shared/utils/browserDetection.ts',
  'src/utils/trial-manager-ports.ts'
]);

const REQUIRED_ACTIONS = {
  'platform-adapter':
    'Allowed adapter root; keep direct platform access isolated to platform ownership.',
  'composition-root':
    'Allowed composition root; keep direct API access limited to bootstrap wiring.',
  'offscreen-local-vault-permission-root':
    'Review as offscreen/local-vault permission root; retain only with explicit extension document rationale.',
  'type-only': 'Keep type-only reference; do not treat as runtime platform dependency.',
  'shared-runtime-helper':
    'Review shared helper; add a platform-neutral dependency or an explicit allowlist reason.',
  'migration-needed':
    'Migrate direct runtime usage through an explicit platform port or dependency.'
};

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function toRelativePath(file) {
  return relative(ROOT, file).split(sep).join('/');
}

function classifyUsage(file, typeOnly) {
  if (
    PLATFORM_ADAPTER_FILES.has(file) ||
    PLATFORM_ADAPTER_ROOTS.some((root) => file.startsWith(root))
  ) {
    return 'platform-adapter';
  }

  if (COMPOSITION_ROOT_FILES.has(file)) {
    return 'composition-root';
  }

  if (OFFSCREEN_PERMISSION_ROOT_FILES.has(file)) {
    return 'offscreen-local-vault-permission-root';
  }

  if (typeOnly && isAllowedTypeOnlyFile(file)) {
    return 'type-only';
  }

  if (SHARED_RUNTIME_HELPER_FILES.has(file)) {
    return 'shared-runtime-helper';
  }

  return 'migration-needed';
}

function isAllowedTypeOnlyFile(file) {
  if (file.startsWith('src/platform/interfaces/')) {
    return true;
  }

  if (file === 'src/shared/notifications/types.ts') {
    return true;
  }

  return (
    file.endsWith('.d.ts') ||
    (file.startsWith('src/shared/') &&
      (file.endsWith('/types.ts') || file.endsWith('/types.tsx') || file.includes('/types/')))
  );
}

function isTypeOnlyNode(node) {
  let current = node;
  while (current) {
    if (
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isImportTypeNode(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function tokenFromQualifiedName(node) {
  const parts = [];
  let current = node;

  while (ts.isQualifiedName(current)) {
    parts.unshift(current.right.text);
    current = current.left;
  }

  if (ts.isIdentifier(current)) {
    parts.unshift(current.text);
  }

  if (parts[0] !== 'chrome' && parts[0] !== 'browser') {
    return null;
  }

  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
}

function tokenFromPropertyAccess(node) {
  if (ts.isIdentifier(node.expression) && ['chrome', 'browser'].includes(node.expression.text)) {
    return `${node.expression.text}.${node.name.text}`;
  }

  if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'globalThis' &&
    node.name.text === 'chrome'
  ) {
    return 'globalThis.chrome';
  }

  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'globalThis' &&
    node.expression.name.text === 'chrome'
  ) {
    return 'globalThis.chrome';
  }

  return null;
}

function shouldSkipIdentifier(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && (parent.left === node || parent.right === node)) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node)
  );
}

function nearestStatement(node) {
  let current = node;
  while (current && !ts.isStatement(current)) {
    current = current.parent;
  }
  return current ?? node;
}

function containsChromeOrBrowserMember(node) {
  let found = false;

  function visit(current) {
    if (found) {
      return;
    }

    if (ts.isIdentifier(current) && ['chrome', 'browser'].includes(current.text)) {
      found = true;
      return;
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return found;
}

function createFinding(file, sourceFile, node, token, typeOnly) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const classification = classifyUsage(file, typeOnly);

  return {
    file,
    line: line + 1,
    token,
    classification,
    requiredAction: REQUIRED_ACTIONS[classification]
  };
}

export function collectPlatformBoundaryFindingsFromSource(file, source) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const findings = [];
  const seen = new Set();

  function add(node, token, typeOnly = isTypeOnlyNode(node)) {
    const finding = createFinding(file, sourceFile, node, token, typeOnly);
    const key = `${finding.line}:${finding.token}:${finding.classification}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    findings.push(finding);
  }

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const token = tokenFromPropertyAccess(node);
      if (token) {
        add(node, token);
      }
    } else if (ts.isQualifiedName(node)) {
      const token = tokenFromQualifiedName(node);
      if (token) {
        add(node, token, true);
      }
    } else if (
      ts.isIdentifier(node) &&
      node.text === 'globalThis' &&
      containsChromeOrBrowserMember(nearestStatement(node))
    ) {
      add(node, 'globalThis.chrome');
    } else if (
      ts.isIdentifier(node) &&
      ['chrome', 'browser'].includes(node.text) &&
      !shouldSkipIdentifier(node) &&
      (!ts.isTypeQueryNode(node.parent) || isAllowedTypeOnlyFile(file))
    ) {
      add(node, node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return findings.sort(
    (left, right) => left.line - right.line || left.token.localeCompare(right.token)
  );
}

export async function collectPlatformBoundaryFindings() {
  const files = await collectFiles(TARGET_DIR);
  const findings = [];

  for (const file of files) {
    const relativeFile = toRelativePath(file);
    const source = await readFile(file, 'utf8');
    findings.push(...collectPlatformBoundaryFindingsFromSource(relativeFile, source));
  }

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.token.localeCompare(right.token)
  );
}

export function formatPlatformBoundaryReport(rows) {
  if (rows.length === 0) {
    return 'No direct platform/global API usages found.';
  }

  const lines = rows.map(
    (row) =>
      `${row.file}:${row.line} token=${row.token} classification=${row.classification} requiredAction=${row.requiredAction}`
  );
  const counts = new Map();

  for (const row of rows) {
    counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  }

  lines.push('');
  lines.push(`Total findings: ${rows.length}`);
  for (const [classification, count] of [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    lines.push(`${classification}: ${count}`);
  }

  return lines.join('\n');
}

export function evaluatePlatformBoundaryCheck(rows) {
  const violations = FINALIZED_ALLOWLIST
    ? rows.filter((row) => row.classification === 'migration-needed')
    : [];

  return {
    ok: violations.length === 0,
    violations
  };
}

function parseArgs(argv) {
  return {
    checkMode: argv.includes('--check')
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await collectPlatformBoundaryFindings();
  console.log(formatPlatformBoundaryReport(rows));

  if (!options.checkMode) {
    return;
  }

  const result = evaluatePlatformBoundaryCheck(rows);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
