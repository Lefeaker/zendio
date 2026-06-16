#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const DEFAULT_ALLOWLIST_PATH = join(
  projectRoot,
  'tools/i18n-uncatalogued-user-copy-allowlist.json'
);
const DEFAULT_PRODUCTION_GRAPH_PATH = join(
  projectRoot,
  'build/reports/production-build-graph.json'
);

const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const SOURCE_ROOTS = ['src', 'public'];
const USER_VISIBLE_FIELDS = new Set([
  'ariaLabel',
  'description',
  'detail',
  'details',
  'emptyHint',
  'error',
  'helperText',
  'label',
  'message',
  'placeholder',
  'summary',
  'text',
  'title',
  'tooltip'
]);
const TECHNICAL_FIELDS = new Set([
  'api',
  'category',
  'class',
  'className',
  'code',
  'dataRole',
  'domain',
  'event',
  'eventName',
  'href',
  'icon',
  'id',
  'key',
  'method',
  'name',
  'path',
  'provider',
  'role',
  'scope',
  'type',
  'url',
  'value'
]);
const DESCRIPTOR_BOUNDARY_PATH_RE =
  /(?:supportProgress|supportPrompt|connection|Connection|vaultConnection|runtimeMessages|clipPipeline|clipProcessor|AppError|errors|obsidianWriter|notification)/;
const TECHNICAL_LOG_RE = /console\.(?:debug|error|info|log|warn)|throw new Error|new Error\(/;
const URL_OR_PATH_RE =
  /^(?:https?:\/\/|chrome:\/\/|moz-extension:\/\/|data:|\/|\.\/|\.\.\/|[A-Za-z]:\\)|(?:[\w.-]+\/)+[\w.-]+$/;
const TOKEN_RE = /^[a-zA-Z0-9_.:/#?&=%@+-]+$/;
const EVENT_TOKEN_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const CSS_TOKEN_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const PUBLIC_DEV_HARNESS_RE = /^public\/[^/]*harness\.html$/;
const CSS_TEXT_RE = /(?:^|\s)[.#]?[a-z][a-z0-9-]*\s*\{|(?:^|\s)[a-z-]+\s*:/i;

function toPosixPath(value) {
  return value.split(sep).join('/');
}

function normalizeRoot(root = projectRoot) {
  return resolve(root);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

  if (
    path.startsWith('src/i18n/catalog/') ||
    path.startsWith('src/i18n/generated/') ||
    path.startsWith('src/i18n/locales/') ||
    path.startsWith('public/_locales/')
  ) {
    return true;
  }

  return /\.generated\.[cm]?[jt]sx?$/.test(path);
}

function resolveConfigPath(root, configPath) {
  if (isAbsolute(configPath)) {
    return configPath.startsWith(projectRoot)
      ? resolve(root, relative(projectRoot, configPath))
      : configPath;
  }
  return resolve(root, configPath);
}

function deriveExcludedPublicPathsFromGraph(graph) {
  const excluded = new Set();

  for (const entrypointName of Object.keys(graph?.excludedHarnessEntrypoints ?? {})) {
    excluded.add(`public/${entrypointName}.html`);
    excluded.add(`public/${entrypointName}.js`);
  }

  return excluded;
}

async function loadProductionBuildGraph(root, graphPath = DEFAULT_PRODUCTION_GRAPH_PATH) {
  const resolvedGraphPath = resolveConfigPath(root, graphPath);
  if (!(await pathExists(resolvedGraphPath))) {
    return null;
  }
  return readJsonFile(resolvedGraphPath);
}

async function collectFiles(root, productionSourcePaths = null, excludedPublicPaths = new Set()) {
  const files = [];

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relativePath = toPosixPath(relative(root, fullPath));
      if (shouldExclude(relativePath)) {
        continue;
      }
      if (
        relativePath.startsWith('public/') &&
        (excludedPublicPaths.has(relativePath) || PUBLIC_DEV_HARNESS_RE.test(relativePath))
      ) {
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

async function readJsonFile(path, fallback = null) {
  try {
    const source = await readFile(path, 'utf8');
    return JSON.parse(source);
  } catch (error) {
    if (fallback !== null) {
      return fallback;
    }
    throw error;
  }
}

async function loadProductionScope(root, graphPath = DEFAULT_PRODUCTION_GRAPH_PATH) {
  const graph = await loadProductionBuildGraph(root, graphPath);
  if (!graph) {
    return {
      productionSourcePaths: null,
      excludedPublicPaths: new Set()
    };
  }
  return {
    productionSourcePaths: new Set(Object.keys(graph.reachableSources ?? {})),
    excludedPublicPaths: deriveExcludedPublicPathsFromGraph(graph)
  };
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
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
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
    'titleDescriptor',
    'descriptionDescriptor'
  ]);

  return objectLiteral.properties.some((sibling) => {
    if (!ts.isPropertyAssignment(sibling) && !ts.isShorthandPropertyAssignment(sibling)) {
      return false;
    }
    return descriptorNames.has(getPropertyNameText(sibling.name) ?? '');
  });
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

function isTranslationFallbackLiteral(node, sourceFile) {
  const parent = node.parent;
  if (ts.isCallExpression(parent)) {
    const argumentIndex = parent.arguments.findIndex((argument) => argument === node);
    if (argumentIndex > 0 && isTranslationCallee(parent.expression.getText(sourceFile))) {
      return true;
    }
  }

  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    parent.right === node
  ) {
    return /(?:\.t\b|\.t\?\.\(|translate)/.test(parent.left.getText(sourceFile));
  }

  return false;
}

function isDomTextLiteral(node, sourceFile) {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && parent.right === node) {
    const left = parent.left.getText(sourceFile);
    if (/(?:^|\.)style\.textContent$/.test(left)) {
      return false;
    }
    return /\.(?:textContent|innerText|ariaLabel|placeholder|title)$/.test(left);
  }

  if (ts.isCallExpression(parent)) {
    const expression = parent.expression.getText(sourceFile);
    const argumentIndex = parent.arguments.findIndex((argument) => argument === node);
    if (argumentIndex === 0 && /(?:createTextNode|append|appendChild)$/.test(expression)) {
      return true;
    }
    if (
      argumentIndex === 1 &&
      /(?:setAttribute)$/.test(expression) &&
      ts.isStringLiteralLike(parent.arguments[0]) &&
      ['aria-label', 'placeholder', 'title'].includes(parent.arguments[0].text)
    ) {
      return true;
    }
  }

  return false;
}

function hasEnglishWords(value) {
  const words = value.match(/[A-Za-z][A-Za-z']+/g) ?? [];
  return words.length >= 2;
}

function isProbablyTechnicalLiteral(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (URL_OR_PATH_RE.test(trimmed)) {
    return true;
  }
  if (EVENT_TOKEN_RE.test(trimmed) || CSS_TOKEN_RE.test(trimmed)) {
    return true;
  }
  if (TOKEN_RE.test(trimmed) && !/\s/.test(trimmed)) {
    return true;
  }
  if (CSS_TEXT_RE.test(trimmed)) {
    return true;
  }
  if (isTechnicalTokenList(trimmed)) {
    return true;
  }
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return true;
  }
  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function isTechnicalTokenList(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return false;
  }
  if (!tokens.every((token) => TOKEN_RE.test(token))) {
    return false;
  }
  return tokens.some(
    (token) => EVENT_TOKEN_RE.test(token) || CSS_TOKEN_RE.test(token) || /\d/.test(token)
  );
}

function isPotentialUserCopy(value) {
  const trimmed = value.trim();
  return hasEnglishWords(trimmed) && !isProbablyTechnicalLiteral(trimmed);
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

function shouldIgnorePropertyLiteral(propertyName, literal, snippet, relativePath) {
  if (!propertyName) {
    return true;
  }
  if (TECHNICAL_FIELDS.has(propertyName)) {
    return true;
  }
  if (TECHNICAL_LOG_RE.test(snippet)) {
    return true;
  }
  if (relativePath.startsWith('src/third_party/ai-chat-exporter/platforms/')) {
    return true;
  }
  return !isPotentialUserCopy(literal);
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
    if (literal && !isModuleSpecifier(node)) {
      const snippet =
        sourceFile.text
          .split(/\r?\n/)
          [lineAndColumn(sourceFile, node.getStart(sourceFile)).line - 1]?.trim() ?? '';

      if (isTranslationFallbackLiteral(node, sourceFile) && isPotentialUserCopy(literal)) {
        findings.push(
          createFinding({
            sourceFile,
            relativePath,
            node,
            literal,
            kind: 'translation-fallback',
            category: 'english-translation-fallback',
            message: 'English fallback text in a translation helper call'
          })
        );
      } else if (isDomTextLiteral(node, sourceFile) && isPotentialUserCopy(literal)) {
        findings.push(
          createFinding({
            sourceFile,
            relativePath,
            node,
            literal,
            kind: 'english-literal',
            category: 'dom-text-copy',
            message: 'English DOM text literal outside the i18n catalog'
          })
        );
      } else {
        const property = findContainingPropertyAssignment(node);
        const propertyName = property ? getPropertyNameText(property.name) : null;
        if (
          property &&
          USER_VISIBLE_FIELDS.has(propertyName ?? '') &&
          !shouldIgnorePropertyLiteral(propertyName, literal, snippet, relativePath)
        ) {
          if (
            DESCRIPTOR_BOUNDARY_PATH_RE.test(relativePath) &&
            !isObjectLiteralSiblingDescriptor(property)
          ) {
            findings.push(
              createFinding({
                sourceFile,
                relativePath,
                node,
                literal,
                kind: 'descriptor-boundary',
                category: 'descriptor-boundary',
                message: 'English user-visible boundary payload without a descriptor sibling'
              })
            );
          } else if (!isObjectLiteralSiblingDescriptor(property)) {
            findings.push(
              createFinding({
                sourceFile,
                relativePath,
                node,
                literal,
                kind: 'english-literal',
                category: 'uncatalogued-ui-copy',
                message: 'English product-authored UI copy outside the i18n catalog'
              })
            );
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function detectHtmlFindings({ content, relativePath }) {
  const findings = [];
  const sanitized = content
    .replace(/<!--[\s\S]*?-->/g, preserveLineBreaks)
    .replace(/<script\b[\s\S]*?<\/script>/gi, preserveLineBreaks)
    .replace(/<style\b[\s\S]*?<\/style>/gi, preserveLineBreaks);
  const lines = sanitized.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!isPotentialUserCopy(text)) {
      continue;
    }
    findings.push({
      file: relativePath,
      line: index + 1,
      column: Math.max(1, line.search(/[A-Za-z]/) + 1),
      kind: 'english-literal',
      category: 'html-uncatalogued-copy',
      classification: 'unexpected',
      literal: text,
      message: 'English HTML text outside the i18n catalog',
      snippet: line.trim()
    });
  }

  return findings;
}

function preserveLineBreaks(value) {
  return '\n'.repeat((value.match(/\r?\n/g) ?? []).length);
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

export async function scanI18nUncataloguedUserCopy(options = {}) {
  const root = normalizeRoot(options.root);
  const allowlist =
    options.allowlist ??
    (await readJsonFile(options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH, { rules: [] }));
  const rules = normalizeAllowlist(allowlist);
  const productionScope =
    options.productionSourcePaths instanceof Set
      ? {
          productionSourcePaths: options.productionSourcePaths,
          excludedPublicPaths: new Set()
        }
      : await loadProductionScope(
          root,
          options.productionGraphPath ?? DEFAULT_PRODUCTION_GRAPH_PATH
        );
  const files = await collectFiles(
    root,
    productionScope.productionSourcePaths,
    productionScope.excludedPublicPaths
  );
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
    usedProductionBuildGraph: Boolean(productionScope.productionSourcePaths),
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

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function formatCounts(entries) {
  return entries.map(([key, count]) => `${key}=${count}`).join(' ');
}

function printReport(result) {
  console.log(
    `i18n uncatalogued user-copy audit: scanned=${result.scannedFiles} findings=${result.findings.length} unexpected=${result.unexpectedFindings.length} staleAllowlist=${result.staleAllowlistEntries.length}`
  );
  if (result.findings.length > 0) {
    console.log(`  byKind: ${formatCounts(countBy(result.findings, (finding) => finding.kind))}`);
    console.log(
      `  byCategory: ${formatCounts(countBy(result.findings, (finding) => finding.category))}`
    );
    console.log(
      `  topFiles: ${formatCounts(countBy(result.findings, (finding) => finding.file).slice(0, 10))}`
    );
  }

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
    console.log('No unexpected uncatalogued English production user-copy findings.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await scanI18nUncataloguedUserCopy(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }
  process.exitCode = args.check && !result.ok ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
