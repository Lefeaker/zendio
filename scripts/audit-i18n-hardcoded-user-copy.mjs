#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const DEFAULT_ALLOWLIST_PATH = join(projectRoot, 'tools/i18n-hardcoded-user-copy-allowlist.json');
const DEFAULT_PRODUCTION_GRAPH_PATH = join(
  projectRoot,
  'build/reports/production-build-graph.json'
);

const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const SOURCE_ROOTS = ['src', 'public'];
const USER_VISIBLE_BOUNDARY_FIELDS = new Set([
  'label',
  'message',
  'error',
  'title',
  'description',
  'detail',
  'details',
  'summary'
]);
const DESCRIPTOR_BOUNDARY_PATH_RE =
  /(?:supportProgress|supportPrompt|connection|Connection|vaultConnection|runtimeMessages|clipPipeline|clipProcessor|AppError|errors|obsidianWriter)/;

function toPosixPath(value) {
  return value.split(sep).join('/');
}

function hasCjk(value) {
  return CJK_RE.test(value);
}

function normalizeRoot(root = projectRoot) {
  return resolve(root);
}

function shouldExclude(relativePath) {
  const path = toPosixPath(relativePath);
  const parts = path.split('/');

  if (
    parts.includes('node_modules') ||
    parts.includes('tests') ||
    parts.includes('docs') ||
    parts.includes('fixtures') ||
    parts.includes('__fixtures__') ||
    parts.includes('__snapshots__') ||
    parts.includes('.tmp') ||
    parts.includes('tmp') ||
    parts.includes('dist') ||
    parts.includes('build') ||
    parts.includes('.git')
  ) {
    return true;
  }

  if (path.startsWith('src/i18n/catalog/')) {
    return true;
  }

  if (path.startsWith('src/i18n/generated/')) {
    return true;
  }

  if (path.startsWith('src/i18n/locales/')) {
    return true;
  }

  if (path.startsWith('public/_locales/')) {
    return true;
  }

  if (/\.generated\.[cm]?[jt]sx?$/.test(path)) {
    return true;
  }

  return false;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root, productionSourcePaths = null) {
  const files = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relativePath = toPosixPath(relative(root, fullPath));

      if (shouldExclude(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        CHECKED_EXTENSIONS.has(extname(entry.name)) &&
        (!relativePath.startsWith('src/') ||
          !productionSourcePaths ||
          productionSourcePaths.has(relativePath))
      ) {
        files.push(fullPath);
      }
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) {
    const fullRoot = join(root, sourceRoot);
    if (await pathExists(fullRoot)) {
      await walk(fullRoot);
    }
  }

  return files.sort();
}

function lineAndColumn(sourceFile, pos) {
  const location = sourceFile.getLineAndCharacterOfPosition(pos);
  return {
    line: location.line + 1,
    column: location.character + 1
  };
}

function getPropertyNameText(name) {
  if (!name) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function getLiteralText(node) {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  return null;
}

function isModuleSpecifier(node) {
  const parent = node.parent;
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node)
  );
}

function isObjectLiteralSiblingDescriptor(property) {
  const objectLiteral = property.parent;
  if (!ts.isObjectLiteralExpression(objectLiteral)) {
    return false;
  }

  const propertyName = getPropertyNameText(property.name);
  const descriptorNames = new Set([
    `${propertyName}Descriptor`,
    'messageDescriptor',
    'labelDescriptor',
    'errorDescriptor',
    'titleDescriptor'
  ]);

  return objectLiteral.properties.some((sibling) => {
    if (!ts.isPropertyAssignment(sibling) && !ts.isShorthandPropertyAssignment(sibling)) {
      return false;
    }
    return descriptorNames.has(getPropertyNameText(sibling.name) ?? '');
  });
}

function findContainingPropertyAssignment(node) {
  let current = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      return current;
    }
    if (ts.isStatement(current)) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function isTranslationCallee(calleeText) {
  return (
    calleeText === 't' ||
    calleeText.endsWith('.t') ||
    calleeText.endsWith('?.t') ||
    calleeText === 'translate' ||
    calleeText.endsWith('.translate') ||
    calleeText.endsWith('?.translate')
  );
}

function isNullishTranslationFallbackLiteral(node, sourceFile) {
  const parent = node.parent;
  if (
    !ts.isBinaryExpression(parent) ||
    parent.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken ||
    parent.right !== node
  ) {
    return false;
  }

  return /(?:\.t\b|\.t\?\.\(|translate)/.test(parent.left.getText(sourceFile));
}

function isTranslationFallbackLiteral(node, sourceFile) {
  const parent = node.parent;

  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.findIndex((argument) => argument === node);
    if (argumentIndex > 0 && isTranslationCallee(parent.expression.getText(sourceFile))) {
      return true;
    }
  }

  if (isNullishTranslationFallbackLiteral(node, sourceFile)) {
    return !hasCjk(parent.left.getText(sourceFile));
  }

  return false;
}

function isDescriptorBoundaryLiteral(node, sourceFile, relativePath) {
  if (!DESCRIPTOR_BOUNDARY_PATH_RE.test(relativePath)) {
    return false;
  }

  const property = findContainingPropertyAssignment(node);
  if (!property) {
    return false;
  }

  const propertyName = getPropertyNameText(property.name);
  if (!propertyName || !USER_VISIBLE_BOUNDARY_FIELDS.has(propertyName)) {
    return false;
  }

  return !isObjectLiteralSiblingDescriptor(property);
}

function createFinding({ sourceFile, relativePath, node, literal, kind, category, message }) {
  const { line, column } = lineAndColumn(sourceFile, node.getStart(sourceFile));
  const snippet = sourceFile.text.split(/\r?\n/)[line - 1]?.trim() ?? '';
  return {
    file: relativePath,
    line,
    column,
    kind,
    category,
    classification: 'unexpected',
    literal,
    message,
    snippet
  };
}

function inferCjkLiteralCategory(relativePath, snippet) {
  if (relativePath.startsWith('src/third_party/ai-chat-exporter/')) {
    return 'site-native-parser-token';
  }

  if (relativePath === 'src/options/stitch/content.ts') {
    return 'options-stitch-static-content';
  }

  if (relativePath === 'src/options/stitch/changelogResourceData.ts') {
    return 'retained-static-release-note-content';
  }

  if (relativePath === 'src/content/stitch/runtimeSurfaceContent.ts') {
    return 'content-stitch-static-content';
  }

  if (relativePath.startsWith('src/shared/errors/')) {
    return 'legacy-user-message-fallback';
  }

  if (relativePath.startsWith('src/content/clipper/components/')) {
    return 'content-clipper-i18n-fallback';
  }

  if (
    relativePath.startsWith('src/shared/config/') ||
    relativePath.startsWith('src/shared/constants/')
  ) {
    return 'legacy-default-config-copy';
  }

  if (relativePath.startsWith('src/shared/schemas/')) {
    return 'zod-validation-message';
  }

  if (/console\.(?:warn|error|info|log)/.test(snippet)) {
    return 'developer-log';
  }

  if (relativePath.includes('vault-router') || relativePath.includes('restCandidates')) {
    return 'legacy-vault-routing-copy';
  }

  return 'product-copy-literal';
}

function detectTypeScriptFindings({ content, relativePath, filePath }) {
  const scriptKind =
    extname(filePath) === '.tsx' || extname(filePath) === '.jsx'
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const findings = [];

  function visit(node) {
    const literal = getLiteralText(node);
    if (literal && hasCjk(literal) && !isModuleSpecifier(node)) {
      if (
        isNullishTranslationFallbackLiteral(node, sourceFile) &&
        hasCjk(node.parent.left.getText(sourceFile))
      ) {
        ts.forEachChild(node, visit);
        return;
      }

      if (isTranslationFallbackLiteral(node, sourceFile)) {
        findings.push(
          createFinding({
            sourceFile,
            relativePath,
            node,
            literal,
            kind: 'translation-fallback',
            category: 'translation-fallback',
            message: 'Chinese fallback text in a translation helper call'
          })
        );
      } else if (isDescriptorBoundaryLiteral(node, sourceFile, relativePath)) {
        findings.push(
          createFinding({
            sourceFile,
            relativePath,
            node,
            literal,
            kind: 'descriptor-boundary',
            category: 'descriptor-boundary',
            message: 'Chinese user-visible boundary payload without a descriptor sibling'
          })
        );
      } else {
        const snippet =
          sourceFile.text
            .split(/\r?\n/)
            [lineAndColumn(sourceFile, node.getStart(sourceFile)).line - 1]?.trim() ?? '';
        findings.push(
          createFinding({
            sourceFile,
            relativePath,
            node,
            literal,
            kind: 'cjk-literal',
            category: inferCjkLiteralCategory(relativePath, snippet),
            message: 'Chinese product-authored source literal outside the i18n catalog'
          })
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function detectHtmlFindings({ content, relativePath }) {
  const findings = [];
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '');
  const lines = withoutComments.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!hasCjk(line)) {
      continue;
    }

    const text = line
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    if (!hasCjk(text)) {
      continue;
    }

    findings.push({
      file: relativePath,
      line: index + 1,
      column: Math.max(1, line.search(CJK_RE) + 1),
      kind: 'cjk-literal',
      category: 'html-product-copy',
      classification: 'unexpected',
      literal: text.trim(),
      message: 'Chinese product-authored HTML text outside the i18n catalog',
      snippet: line.trim()
    });
  }

  return findings;
}

async function scanFile({ root, filePath }) {
  const relativePath = toPosixPath(relative(root, filePath));
  const content = await readFile(filePath, 'utf8');
  const extension = extname(filePath);

  if (extension === '.html') {
    return detectHtmlFindings({ content, relativePath });
  }

  return detectTypeScriptFindings({ content, relativePath, filePath });
}

async function readJsonFile(path) {
  const source = await readFile(path, 'utf8');
  return JSON.parse(source);
}

async function loadProductionSourcePaths(root, graphPath = DEFAULT_PRODUCTION_GRAPH_PATH) {
  const resolvedGraphPath = resolve(root, relative(projectRoot, graphPath));
  if (!(await pathExists(resolvedGraphPath))) {
    return null;
  }

  const graph = await readJsonFile(resolvedGraphPath);
  return new Set(Object.keys(graph.reachableSources ?? {}));
}

function normalizeAllowlist(allowlist) {
  const rules = Array.isArray(allowlist?.rules) ? allowlist.rules : [];
  return rules.map((rule) => ({
    ...rule,
    literalIncludes: Array.isArray(rule.literalIncludes) ? rule.literalIncludes : [],
    findingKinds: Array.isArray(rule.findingKinds) ? rule.findingKinds : []
  }));
}

function ruleHasRequiredMetadata(rule) {
  return Boolean(
    rule.id && rule.path && rule.category && rule.reason && rule.ownerPlan && rule.revisit
  );
}

function ruleHasLocator(rule) {
  return Boolean(
    Number.isInteger(rule.line) ||
    rule.pattern ||
    (Array.isArray(rule.literalIncludes) && rule.literalIncludes.length > 0)
  );
}

function ruleMatchesFinding(rule, finding) {
  if (!ruleHasRequiredMetadata(rule) || !ruleHasLocator(rule)) {
    return false;
  }

  if (toPosixPath(rule.path) !== finding.file) {
    return false;
  }

  if (rule.findingKinds.length > 0 && !rule.findingKinds.includes(finding.kind)) {
    return false;
  }

  if (Number.isInteger(rule.line) && rule.line !== finding.line) {
    return false;
  }

  if (rule.literalIncludes.length > 0) {
    const haystack = `${finding.literal}\n${finding.snippet}`;
    if (!rule.literalIncludes.some((literal) => haystack.includes(literal))) {
      return false;
    }
  }

  if (rule.pattern) {
    const pattern = new RegExp(rule.pattern);
    if (!pattern.test(`${finding.literal}\n${finding.snippet}`)) {
      return false;
    }
  }

  return true;
}

function applyAllowlist(findings, rules) {
  const matchedRuleIds = new Set();

  const classifiedFindings = findings.map((finding) => {
    const matchingRule = rules.find((rule) => ruleMatchesFinding(rule, finding));
    if (!matchingRule) {
      return finding;
    }

    matchedRuleIds.add(matchingRule.id);
    return {
      ...finding,
      category: matchingRule.category,
      classification: 'allowlisted',
      allowlistId: matchingRule.id
    };
  });

  const staleAllowlistEntries = rules
    .filter((rule) => !matchedRuleIds.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      path: rule.path,
      category: rule.category,
      reason: rule.reason,
      missingRequiredMetadata: !ruleHasRequiredMetadata(rule),
      missingLocator: !ruleHasLocator(rule)
    }));

  return { classifiedFindings, staleAllowlistEntries };
}

export async function scanI18nHardcodedUserCopy(options = {}) {
  const root = normalizeRoot(options.root);
  const allowlist =
    options.allowlist ?? (await readJsonFile(options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH));
  const rules = normalizeAllowlist(allowlist);
  const productionSourcePaths =
    options.productionSourcePaths instanceof Set
      ? options.productionSourcePaths
      : await loadProductionSourcePaths(
          root,
          options.productionGraphPath ?? DEFAULT_PRODUCTION_GRAPH_PATH
        );
  const files = await collectFiles(root, productionSourcePaths);
  const findings = [];

  for (const filePath of files) {
    findings.push(...(await scanFile({ root, filePath })));
  }

  const { classifiedFindings, staleAllowlistEntries } = applyAllowlist(findings, rules);
  const unexpectedFindings = classifiedFindings.filter(
    (finding) => finding.classification === 'unexpected'
  );

  return {
    ok: unexpectedFindings.length === 0 && staleAllowlistEntries.length === 0,
    root,
    scannedFiles: files.length,
    usedProductionBuildGraph: Boolean(productionSourcePaths),
    findings: classifiedFindings,
    unexpectedFindings,
    staleAllowlistEntries,
    allowlistEntries: rules.length
  };
}

function parseArgs(argv) {
  const args = {
    root: projectRoot,
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    json: false,
    check: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--check') {
      args.check = true;
    } else if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--allowlist') {
      args.allowlistPath = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function printFinding(finding) {
  const allowlist = finding.allowlistId ? ` allowlist=${finding.allowlistId}` : '';
  console.log(
    `${finding.classification.toUpperCase()} ${finding.kind} ${finding.file}:${finding.line}:${finding.column}${allowlist}`
  );
  console.log(`  ${finding.message}`);
  console.log(`  ${finding.snippet}`);
}

function printReport(result) {
  console.log(
    `i18n hardcoded user-copy audit: scanned=${result.scannedFiles} findings=${result.findings.length} unexpected=${result.unexpectedFindings.length} staleAllowlist=${result.staleAllowlistEntries.length}`
  );

  for (const finding of result.unexpectedFindings) {
    printFinding(finding);
  }

  for (const stale of result.staleAllowlistEntries) {
    console.log(`STALE_ALLOWLIST ${stale.id} ${stale.path}`);
    if (stale.missingRequiredMetadata) {
      console.log('  missing required metadata');
    }
    if (stale.missingLocator) {
      console.log('  missing stable locator');
    }
  }

  if (result.ok) {
    console.log('No unexpected hardcoded production user-copy findings.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await scanI18nHardcodedUserCopy(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  process.exitCode = args.check && !result.ok ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
