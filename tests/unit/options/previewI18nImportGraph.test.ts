import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface PreviewImportGraphAudit {
  reachableOptionsFiles: string[];
  violations: PreviewImportViolation[];
}

interface PreviewImportViolation {
  file: string;
  moduleSpecifier: string;
  reason: string;
}

interface PreviewImportGraphAuditOptions {
  entryPoints?: string[];
  readSource?: (filePath: string) => string | null;
}

interface RuntimeImportEdge {
  moduleSpecifier: string;
  runtimeNames: string[];
  shouldTraverse: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../');
const sourceExtensions = ['.ts', '.tsx', '.js', '.mjs'] as const;
const aliasPrefixes = [
  ['@shared/', 'src/shared/'],
  ['@content/', 'src/content/'],
  ['@options/', 'src/options/'],
  ['@ui/', 'src/ui/'],
  ['@i18n/', 'src/i18n/'],
  ['@platform/', 'src/platform/'],
  ['@third-party/', 'src/third_party/']
] as const;

const realPreviewEntryPoints = [
  path.join(repoRoot, 'tests/fixtures/options-preview/entries/index.ts'),
  path.join(repoRoot, 'tests/fixtures/options-preview/entries/onboarding.ts')
] as const;

const expectedPreviewReachableFiles = [
  'src/options/yaml-config-editor/labels.ts',
  'src/options/app/fragmentModifierOptions.ts',
  'src/options/stitch/schema/settings/output.ts',
  'src/options/yaml-config-editor/widgetAdapter.ts'
] as const;

function collectPreviewI18nRuntimeImportViolations(
  options: PreviewImportGraphAuditOptions = {}
): PreviewImportGraphAudit {
  const entryPoints = options.entryPoints ?? [...realPreviewEntryPoints];
  const readSource = options.readSource ?? defaultReadSource;
  const reachableOptionsFiles = new Set<string>();
  const visited = new Set<string>();
  const violations = new Map<string, PreviewImportViolation>();

  function addViolation(filePath: string, moduleSpecifier: string, reason: string): void {
    const file = toRepoRelative(filePath);
    violations.set(`${file}\0${moduleSpecifier}\0${reason}`, {
      file,
      moduleSpecifier,
      reason
    });
  }

  function visit(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) {
      return;
    }

    const source = readSource(absolutePath);
    if (source === null) {
      return;
    }

    visited.add(absolutePath);
    const relativePath = toRepoRelative(absolutePath);
    if (relativePath.startsWith('src/options/')) {
      reachableOptionsFiles.add(relativePath);
    }

    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    for (const edge of collectRuntimeImportEdges(sourceFile)) {
      const resolvedPath = resolveModuleSpecifier(edge.moduleSpecifier, absolutePath, readSource);
      const forbiddenReason = describeForbiddenRuntimeImport(edge, resolvedPath);

      if (forbiddenReason) {
        addViolation(absolutePath, edge.moduleSpecifier, forbiddenReason);
      }

      if (edge.shouldTraverse && resolvedPath && !forbiddenReason) {
        visit(resolvedPath);
      }
    }
  }

  for (const entryPoint of entryPoints) {
    visit(entryPoint);
  }

  return {
    reachableOptionsFiles: Array.from(reachableOptionsFiles).sort(),
    violations: Array.from(violations.values()).sort((left, right) => {
      const fileCompare = left.file.localeCompare(right.file);
      if (fileCompare !== 0) {
        return fileCompare;
      }
      return left.moduleSpecifier.localeCompare(right.moduleSpecifier);
    })
  };
}

function defaultReadSource(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function toRepoRelative(filePath: string): string {
  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  return relativePath.startsWith('..') ? filePath.replace(/\\/g, '/') : relativePath;
}

function collectRuntimeImportEdges(sourceFile: ts.SourceFile): RuntimeImportEdge[] {
  const edges: RuntimeImportEdge[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = readModuleSpecifier(node.moduleSpecifier);
      if (moduleSpecifier) {
        const hasRuntimeBindings = importDeclarationHasRuntimeBindings(node);
        if (hasRuntimeBindings) {
          edges.push({
            moduleSpecifier,
            runtimeNames: getRuntimeImportNames(node),
            shouldTraverse: true
          });
        }
      }
      return;
    }

    if (ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
        ? readModuleSpecifier(node.moduleSpecifier)
        : null;
      if (moduleSpecifier) {
        const hasRuntimeBindings = exportDeclarationHasRuntimeBindings(node);
        if (hasRuntimeBindings) {
          edges.push({
            moduleSpecifier,
            runtimeNames: getRuntimeExportNames(node),
            shouldTraverse: true
          });
        }
      }
      return;
    }

    if (isDynamicImportCall(node)) {
      const [argument] = node.arguments;
      const moduleSpecifier = argument ? readModuleSpecifier(argument) : null;
      if (moduleSpecifier) {
        edges.push({
          moduleSpecifier,
          runtimeNames: [],
          shouldTraverse: false
        });
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return edges;
}

function readModuleSpecifier(node: ts.Node): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function importDeclarationHasRuntimeBindings(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) {
    return true;
  }
  if (clause.isTypeOnly) {
    return false;
  }
  if (clause.name) {
    return true;
  }

  const bindings = clause.namedBindings;
  if (!bindings) {
    return true;
  }
  if (ts.isNamespaceImport(bindings)) {
    return true;
  }

  return bindings.elements.length === 0 || bindings.elements.some((element) => !element.isTypeOnly);
}

function getRuntimeImportNames(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly) {
    return [];
  }

  const names: string[] = [];
  if (clause.name) {
    names.push(clause.name.text);
  }

  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) {
        names.push((element.propertyName ?? element.name).text);
      }
    }
  }
  if (bindings && ts.isNamespaceImport(bindings)) {
    names.push('*');
  }

  return names;
}

function exportDeclarationHasRuntimeBindings(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return false;
  }

  const clause = node.exportClause;
  if (!clause) {
    return true;
  }
  if (ts.isNamespaceExport(clause)) {
    return true;
  }

  return clause.elements.length === 0 || clause.elements.some((element) => !element.isTypeOnly);
}

function getRuntimeExportNames(node: ts.ExportDeclaration): string[] {
  if (node.isTypeOnly || !node.exportClause || ts.isNamespaceExport(node.exportClause)) {
    return [];
  }

  return node.exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => (element.propertyName ?? element.name).text);
}

function isDynamicImportCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function resolveModuleSpecifier(
  moduleSpecifier: string,
  importerPath: string,
  readSource: (filePath: string) => string | null
): string | null {
  if (moduleSpecifier.startsWith('.')) {
    return resolveSourceCandidate(
      path.resolve(path.dirname(importerPath), moduleSpecifier),
      readSource
    );
  }

  if (moduleSpecifier === '@i18n') {
    return resolveSourceCandidate(path.join(repoRoot, 'src/i18n/index'), readSource);
  }

  for (const [prefix, targetRoot] of aliasPrefixes) {
    if (moduleSpecifier.startsWith(prefix)) {
      return resolveSourceCandidate(
        path.join(repoRoot, targetRoot, moduleSpecifier.slice(prefix.length)),
        readSource
      );
    }
  }

  return null;
}

function resolveSourceCandidate(
  candidatePath: string,
  readSource: (filePath: string) => string | null
): string | null {
  const extension = path.extname(candidatePath);
  const candidates = sourceExtensions.includes(extension as (typeof sourceExtensions)[number])
    ? [candidatePath]
    : [
        ...sourceExtensions.map((sourceExtension) => `${candidatePath}${sourceExtension}`),
        ...sourceExtensions.map((sourceExtension) =>
          path.join(candidatePath, `index${sourceExtension}`)
        )
      ];

  for (const candidate of candidates) {
    if (readSource(candidate) !== null) {
      return candidate;
    }
  }

  return null;
}

function describeForbiddenRuntimeImport(
  edge: RuntimeImportEdge,
  resolvedPath: string | null
): string | null {
  const resolvedRelativePath = resolvedPath ? toRepoRelative(resolvedPath) : '';

  if (edge.moduleSpecifier === '@i18n' || resolvedRelativePath === 'src/i18n/index.ts') {
    return 'runtime import from @i18n barrel';
  }
  if (edge.moduleSpecifier === '@i18n/locales' || resolvedRelativePath === 'src/i18n/locales.ts') {
    return 'runtime import from @i18n/locales';
  }
  if (
    edge.moduleSpecifier.includes('/runtime/localeService') ||
    resolvedRelativePath === 'src/i18n/runtime/localeService.ts'
  ) {
    return 'runtime import from full locale service';
  }
  if (
    edge.moduleSpecifier.includes('/generated/locales') ||
    resolvedRelativePath.startsWith('src/i18n/generated/locales/')
  ) {
    return 'runtime import from generated locale graph';
  }
  if (edge.runtimeNames.includes('DEFAULT_RUNTIME_MESSAGES')) {
    return 'runtime import of DEFAULT_RUNTIME_MESSAGES';
  }

  return null;
}

describe('preview i18n import graph', () => {
  it('checks the real preview entry static graph instead of hard-coded files', () => {
    const audit = collectPreviewI18nRuntimeImportViolations({
      entryPoints: [...realPreviewEntryPoints]
    });

    expect(audit.reachableOptionsFiles).toEqual(
      expect.arrayContaining([...expectedPreviewReachableFiles])
    );
    expect(audit.violations).toEqual([]);
  });

  it('allows type-only imports from the i18n barrel in preview-reachable modules', () => {
    const entryPath = path.join(repoRoot, 'tests/fixtures/options-preview-type-only/entry.ts');
    const typeOnlyPath = path.join(
      repoRoot,
      'tests/fixtures/options-preview-type-only/typeOnly.ts'
    );
    const virtualFiles = new Map<string, string>([
      [entryPath, "import './typeOnly';"],
      [typeOnlyPath, "import type { Messages } from '@i18n';\nexport type Local = Messages;"]
    ]);
    const audit = collectPreviewI18nRuntimeImportViolations({
      entryPoints: [entryPath],
      readSource: (filePath) => virtualFiles.get(filePath) ?? null
    });

    expect(audit.violations).toEqual([]);
  });

  it('fails when a preview-reachable module value-imports the i18n barrel', () => {
    const entryPath = path.join(repoRoot, 'tests/fixtures/options-preview-negative/entry.ts');
    const audit = collectPreviewI18nRuntimeImportViolations({
      entryPoints: [entryPath]
    });

    expect(audit.violations).toEqual([
      expect.objectContaining({
        file: 'tests/fixtures/options-preview-negative/bad.ts',
        moduleSpecifier: '@i18n',
        reason: 'runtime import from @i18n barrel'
      })
    ]);
  });

  it('uses the lightweight message formatter entry where formatting is needed', () => {
    const fragmentModifierSource = readFileSync(
      path.join(repoRoot, 'src/options/app/fragmentModifierOptions.ts'),
      'utf8'
    );
    const schemaI18nSource = readFileSync(
      path.join(repoRoot, 'src/options/stitch/schema/i18n.ts'),
      'utf8'
    );

    expect(fragmentModifierSource).toMatch(/from ['"]@i18n\/messageFormatter['"]/);
    expect(schemaI18nSource).toMatch(/from ['"]@i18n\/messageFormatter['"]/);
  });
});
