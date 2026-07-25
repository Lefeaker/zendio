import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  createBrowserTestShardSuites,
  createE2eTestShards,
  createUnitTestShards
} from './testShards.mjs';

const TEST_MODULE_PATTERN = /^tests\/(?:[^/]+\/)*[^/]+\.(?:test|spec)\.ts(?![\s\S])/u;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const VITEST_CONFIG_PATHS = {
  unit: 'vitest.unit.config.ts',
  e2e: 'vitest.e2e.config.ts'
};
const PLAYWRIGHT_CONFIG_PATHS = ['playwright.config.ts', 'playwright.reader.config.ts'];

export function decodeNulDelimitedPaths(value, label = 'Git path inventory') {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let decoded;
  try {
    decoded = UTF8_DECODER.decode(buffer);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }

  if (decoded.length === 0) {
    return [];
  }
  if (!decoded.endsWith('\0')) {
    throw new Error(`${label} is not NUL terminated`);
  }

  const paths = decoded.slice(0, -1).split('\0');
  if (paths.some((entry) => entry.length === 0)) {
    throw new Error(`${label} contains an empty path entry`);
  }
  return paths;
}

export function listGitVisibleTestFiles({
  cwd = process.cwd(),
  runGit = runGitPathCommand,
  lstat = lstatSync
} = {}) {
  const visibleOutput = runGit(
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'tests'],
    { cwd }
  );
  const trackedOutput = runGit(['ls-files', '-z', '--cached', '--', 'tests'], { cwd });
  const visiblePaths = decodeNulDelimitedPaths(visibleOutput, 'Git-visible test inventory');
  const trackedPaths = new Set(
    decodeNulDelimitedPaths(trackedOutput, 'Tracked test inventory').map(normalizeRepositoryPath)
  );
  const uniquePaths = new Set();

  for (const rawPath of visiblePaths) {
    const file = normalizeRepositoryPath(rawPath);
    if (!TEST_MODULE_PATTERN.test(file)) {
      continue;
    }
    uniquePaths.add(file);
  }

  const files = [];
  for (const file of [...uniquePaths].sort(comparePaths)) {
    let stats;
    try {
      stats = lstat(path.resolve(cwd, ...file.split('/')));
    } catch (error) {
      if (isErrorCode(error, 'ENOENT') && trackedPaths.has(file)) {
        continue;
      }
      throw new Error(`Unable to lstat test candidate ${JSON.stringify(file)}`, { cause: error });
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`Test candidate must not be a symlink: ${JSON.stringify(file)}`);
    }
    if (!stats.isFile()) {
      throw new Error(`Test candidate is not a regular file: ${JSON.stringify(file)}`);
    }
    files.push(file);
  }

  return files;
}

export function analyzeTestModule(file, source, { allowGlobalTestApi = true } = {}) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${file} contains TypeScript parse errors`);
  }
  const testBindings = new Set(allowGlobalTestApi ? ['describe', 'it', 'test', 'suite'] : []);
  const suiteBindings = new Set(allowGlobalTestApi ? ['describe', 'suite'] : []);
  const testNamespaces = new Set();
  const imports = [];
  const importedBindings = new Map();
  const exportedRegistrars = new Set();
  const synchronousCollections = findSynchronousCollectionBindings(sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const bindings = [];
    const clause = statement.importClause;
    const clauseIsTypeOnly = Boolean(clause?.isTypeOnly);
    if (clause?.name && !clauseIsTypeOnly) {
      bindings.push({ imported: 'default', local: clause.name.text });
    }
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (clauseIsTypeOnly || element.isTypeOnly) continue;
        bindings.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text
        });
      }
    }
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) && !clauseIsTypeOnly) {
      bindings.push({ imported: '*', local: clause.namedBindings.name.text });
    }
    for (const binding of bindings) {
      importedBindings.set(binding.local, { specifier, imported: binding.imported });
      if (isTestBindingName(binding.local, binding.imported, specifier)) {
        testBindings.add(binding.local);
        if (binding.imported === 'describe' || binding.imported === 'suite') {
          suiteBindings.add(binding.local);
        }
      }
      if (binding.imported === '*' && isTestApiModule(specifier)) {
        testNamespaces.add(binding.local);
      }
    }
    if (!clause || bindings.length > 0) {
      imports.push({ specifier, bindings, dynamic: false });
    }
  }

  const discoverBindings = (node) => {
    if (node !== sourceFile && isDeferredFunctionNode(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (
        ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        node.initializer.expression.name.text === 'extend' &&
        isTestCallee(node.initializer.expression.expression, testBindings, testNamespaces)
      ) {
        testBindings.add(node.name.text);
      }
    }
    ts.forEachChild(node, discoverBindings);
  };
  discoverBindings(sourceFile);

  const localRegistrars = findLocalRegistrarNames(sourceFile, {
    testBindings,
    testNamespaces,
    synchronousCollections
  });
  for (const statement of sourceFile.statements) {
    const exportedFunctionName = getExportedFunctionName(statement);
    if (
      exportedFunctionName &&
      hasReachableRegistration(statement, {
        testBindings,
        testNamespaces,
        synchronousCollections
      })
    ) {
      exportedRegistrars.add(exportedFunctionName);
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && localRegistrars.has(declaration.name.text)) {
          exportedRegistrars.add(declaration.name.text);
        }
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (
        (ts.isIdentifier(statement.expression) && localRegistrars.has(statement.expression.text)) ||
        hasReachableRegistration(statement.expression, {
          testBindings,
          testNamespaces,
          synchronousCollections
        })
      ) {
        exportedRegistrars.add('default');
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const local = element.propertyName?.text ?? element.name.text;
        if (localRegistrars.has(local)) exportedRegistrars.add(element.name.text);
      }
    }
  }

  const directRegistration = hasReachableRegistration(sourceFile, {
    testBindings,
    testNamespaces,
    synchronousCollections
  });
  const potentialRegistration = hasPotentialRegistration(sourceFile, testBindings, testNamespaces);
  const dynamicImportSpecifiers = collectDynamicImportSpecifiers(sourceFile);
  const discoveryEffects = collectDiscoveryEffects(sourceFile, {
    testBindings,
    suiteBindings,
    testNamespaces,
    synchronousCollections,
    importedBindingNames: new Set(importedBindings.keys())
  });
  for (const [local, binding] of discoveryEffects.dynamicBindings) {
    importedBindings.set(local, { ...binding, dynamic: true });
  }
  imports.push(
    ...discoveryEffects.dynamicImports.map((specifier) => ({
      specifier,
      bindings: [],
      dynamic: true
    }))
  );

  return {
    file,
    source,
    directRegistration,
    potentialRegistration,
    dynamicImportSpecifiers,
    imports,
    importedBindings,
    calledIdentifiers: discoveryEffects.calledIdentifiers,
    calledProperties: discoveryEffects.calledProperties,
    dynamicRegistrarCalls: discoveryEffects.dynamicRegistrarCalls,
    exportedRegistrars
  };
}

export function parseVitestConfig(source, file = 'vitest.config.ts') {
  const config = findDefineConfigObject(source, file);
  const testObject = getObjectProperty(config, 'test');
  if (!testObject) {
    throw new Error(`${file} has no test configuration object`);
  }
  return {
    include: readStringArrayProperty(testObject, 'include', { required: true, file }),
    exclude: readStringArrayProperty(testObject, 'exclude', { required: false, file })
  };
}

export function parsePlaywrightConfig(source, file = 'playwright.config.ts') {
  const config = findDefineConfigObject(source, file);
  const testDirExpression = getPropertyInitializer(config, 'testDir');
  if (!testDirExpression) {
    throw new Error(`${file} has no testDir`);
  }
  const testDir = readRepositoryPathExpression(testDirExpression);
  if (!testDir) {
    throw new Error(`${file} testDir is not statically derivable`);
  }
  return {
    testDir,
    testMatch: readStringArrayProperty(config, 'testMatch', { required: false, file }),
    testIgnore: readStringArrayProperty(config, 'testIgnore', { required: false, file })
  };
}

export function buildTestSuiteOwnershipReport({
  files,
  sources,
  unitShards,
  e2eShards,
  browserSuites,
  packageScripts,
  vitestConfigs,
  playwrightConfigs
}) {
  const normalizedFiles = [...new Set(files.map(normalizeRepositoryPath))].sort(comparePaths);
  const fileSet = new Set(normalizedFiles);
  const vitestGlobalFiles = new Set([
    ...filterByVitestConfig(normalizedFiles, vitestConfigs.unit),
    ...filterByVitestConfig(normalizedFiles, vitestConfigs.e2e)
  ]);
  const modules = new Map(
    normalizedFiles.map((file) => {
      if (!sources.has(file)) {
        throw new Error(`Missing source for ${JSON.stringify(file)}`);
      }
      return [
        file,
        analyzeTestModule(file, sources.get(file), {
          allowGlobalTestApi: vitestGlobalFiles.has(file)
        })
      ];
    })
  );
  const runnableFiles = normalizedFiles.filter((file) => modules.get(file).directRegistration);
  const runnableSet = new Set(runnableFiles);
  const ownersByFile = new Map(runnableFiles.map((file) => [file, new Set()]));
  const emptyPatterns = [];
  const missingRouteMembers = [];
  const duplicateRouteMembers = [];
  const invalidDescriptors = [];

  const unitFiles = filterByVitestConfig(runnableFiles, vitestConfigs.unit);
  const e2eFiles = filterByVitestConfig(runnableFiles, vitestConfigs.e2e);
  assignShardOwners({
    kind: 'unit',
    shards: unitShards,
    eligibleFiles: unitFiles,
    allRunnableFiles: runnableFiles,
    ownersByFile,
    emptyPatterns,
    duplicateRouteMembers,
    invalidDescriptors
  });
  assignShardOwners({
    kind: 'e2e',
    shards: e2eShards,
    eligibleFiles: e2eFiles,
    allRunnableFiles: runnableFiles,
    ownersByFile,
    emptyPatterns,
    duplicateRouteMembers,
    invalidDescriptors
  });

  const browserRoutes = [
    ...createBrowserDescriptorRoutes(browserSuites, invalidDescriptors),
    ...createPackageScriptRoutes(packageScripts, invalidDescriptors)
  ].map((route) =>
    resolvePlaywrightRoute(route, {
      fileSet,
      runnableSet,
      playwrightConfigs,
      missingRouteMembers,
      duplicateRouteMembers,
      invalidDescriptors
    })
  );
  assignCanonicalBrowserOwners(browserRoutes, ownersByFile);

  const importLinks = buildImportLinks(modules, invalidDescriptors);
  const structurallyReachable = findStructurallyReachableModules(runnableSet, importLinks);

  const classifications = [];
  const unclassifiedModules = [];
  for (const file of normalizedFiles) {
    const module = modules.get(file);
    if (module.directRegistration) {
      classifications.push({ file, kind: 'runnable' });
      continue;
    }
    const registrarConsumption = findRegistrarConsumption(file, module, modules);
    if (module.exportedRegistrars.size > 0) {
      if (registrarConsumption.allConsumed) {
        classifications.push({
          file,
          kind: 'registrar',
          importedBy: registrarConsumption.callers
        });
      } else {
        unclassifiedModules.push(file);
        classifications.push({ file, kind: 'unclassified' });
      }
      continue;
    }
    if (module.potentialRegistration) {
      unclassifiedModules.push(file);
      classifications.push({ file, kind: 'unclassified' });
      continue;
    }
    const importedBy = importLinks
      .filter((link) => link.imported === file)
      .map((link) => link.importer)
      .sort(comparePaths);
    if (importedBy.length > 0 && structurallyReachable.has(file)) {
      classifications.push({ file, kind: 'support', importedBy });
      continue;
    }
    unclassifiedModules.push(file);
    classifications.push({ file, kind: 'unclassified' });
  }

  const zeroOwner = runnableFiles
    .filter((file) => ownersByFile.get(file).size === 0)
    .sort(comparePaths);
  const multipleOwners = runnableFiles
    .filter((file) => ownersByFile.get(file).size > 1)
    .map((file) => ({ file, owners: [...ownersByFile.get(file)].sort(comparePaths) }))
    .sort((left, right) => comparePaths(left.file, right.file));
  const owned = runnableFiles.length - zeroOwner.length - multipleOwners.length;
  const failures = [
    ...zeroOwner.map((file) => `zero-owner:${file}`),
    ...multipleOwners.map(({ file }) => `multiple-owner:${file}`),
    ...emptyPatterns.map(({ kind, shard, pattern }) => `empty-pattern:${kind}:${shard}:${pattern}`),
    ...missingRouteMembers.map(({ route, file }) => `missing-route-member:${route}:${file}`),
    ...duplicateRouteMembers.map(({ route, file }) => `duplicate-route-member:${route}:${file}`),
    ...invalidDescriptors.map((failure) => `invalid-descriptor:${failure}`),
    ...unclassifiedModules.map((file) => `unclassified:${file}`)
  ];

  return {
    ok: failures.length === 0,
    inventory: normalizedFiles,
    classifications,
    runnableFiles,
    owners: runnableFiles.map((file) => ({
      file,
      owners: [...ownersByFile.get(file)].sort(comparePaths)
    })),
    zeroOwner,
    multipleOwners,
    emptyPatterns,
    missingRouteMembers,
    duplicateRouteMembers,
    invalidDescriptors,
    unclassifiedModules,
    failures,
    counts: {
      inventory: normalizedFiles.length,
      runnable: runnableFiles.length,
      classified: normalizedFiles.length - runnableFiles.length,
      owned,
      zeroOwner: zeroOwner.length,
      multipleOwner: multipleOwners.length
    }
  };
}

export function auditRepositoryTestSuiteOwnership({
  cwd = process.cwd(),
  runGit,
  lstat,
  readFile = readFileSync
} = {}) {
  const files = listGitVisibleTestFiles({ cwd, runGit, lstat });
  const sources = new Map(
    files.map((file) => [file, readUtf8(readFile(path.resolve(cwd, ...file.split('/'))), file)])
  );
  const vitestConfigs = Object.fromEntries(
    Object.entries(VITEST_CONFIG_PATHS).map(([kind, file]) => [
      kind,
      parseVitestConfig(readUtf8(readFile(path.resolve(cwd, file)), file), file)
    ])
  );
  const playwrightConfigs = new Map(
    PLAYWRIGHT_CONFIG_PATHS.map((file) => [
      file,
      parsePlaywrightConfig(readUtf8(readFile(path.resolve(cwd, file)), file), file)
    ])
  );
  const packageJson = JSON.parse(
    readUtf8(readFile(path.resolve(cwd, 'package.json')), 'package.json')
  );

  return buildTestSuiteOwnershipReport({
    files,
    sources,
    unitShards: createUnitTestShards(),
    e2eShards: createE2eTestShards(),
    browserSuites: createBrowserTestShardSuites(),
    packageScripts: packageJson.scripts ?? {},
    vitestConfigs,
    playwrightConfigs
  });
}

export function formatTestSuiteOwnershipReport(report) {
  const lines = [
    'Canonical test suite ownership report',
    `inventory=${report.counts.inventory} runnable=${report.counts.runnable} classified=${report.counts.classified} owned=${report.counts.owned} zeroOwner=${report.counts.zeroOwner} multipleOwner=${report.counts.multipleOwner}`
  ];
  for (const file of report.zeroOwner) {
    lines.push(`ZERO_OWNER ${JSON.stringify(file)}`);
  }
  for (const row of report.multipleOwners) {
    lines.push(`MULTIPLE_OWNER ${JSON.stringify(row.file)} ${JSON.stringify(row.owners)}`);
  }
  for (const row of report.emptyPatterns) {
    lines.push(
      `EMPTY_PATTERN ${JSON.stringify(`${row.kind}:${row.shard}`)} ${JSON.stringify(row.pattern)}`
    );
  }
  for (const row of report.missingRouteMembers) {
    lines.push(`MISSING_ROUTE_MEMBER ${JSON.stringify(row.route)} ${JSON.stringify(row.file)}`);
  }
  for (const row of report.duplicateRouteMembers) {
    lines.push(`DUPLICATE_ROUTE_MEMBER ${JSON.stringify(row.route)} ${JSON.stringify(row.file)}`);
  }
  for (const failure of report.invalidDescriptors) {
    lines.push(`INVALID_DESCRIPTOR ${JSON.stringify(failure)}`);
  }
  for (const file of report.unclassifiedModules) {
    lines.push(`UNCLASSIFIED ${JSON.stringify(file)}`);
  }
  lines.push(report.ok ? 'STATUS PASS' : 'STATUS FAIL');
  return `${lines.join('\n')}\n`;
}

function runGitPathCommand(args, { cwd }) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: null,
    maxBuffer: MAX_GIT_OUTPUT_BYTES
  });
  if (result.error) {
    throw new Error(`git ${args.join(' ')} failed to start`, { cause: result.error });
  }
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? new TextDecoder().decode(result.stderr)
      : String(result.stderr ?? '');
    throw new Error(`git ${args.join(' ')} failed (${result.status}): ${stderr}`);
  }
  if (!Buffer.isBuffer(result.stdout)) {
    throw new Error(`git ${args.join(' ')} returned a non-buffer result`);
  }
  return result.stdout;
}

function normalizeRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Repository paths must be non-empty strings without NUL bytes');
  }
  const normalized = path.posix.normalize(value);
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized === '.'
  ) {
    throw new Error(`Repository path escapes the root: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function readUtf8(value, label) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    return UTF8_DECODER.decode(buffer);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
}

function isErrorCode(error, code) {
  return Boolean(error && typeof error === 'object' && error.code === code);
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isTestBindingName(local, imported, specifier) {
  if (['describe', 'it', 'test', 'suite'].includes(imported)) {
    return isTestApiModule(specifier) || specifier.startsWith('.');
  }
  if (/^test(?:With|$)/u.test(local)) {
    return specifier === '@playwright/test' || specifier.startsWith('.');
  }
  return false;
}

function isTestApiModule(specifier) {
  return specifier === 'vitest' || specifier === '@playwright/test';
}

function isTestCallee(expression, bindings, namespaces) {
  if (ts.isIdentifier(expression)) {
    return bindings.has(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      namespaces.has(expression.expression.text) &&
      ['describe', 'it', 'test', 'suite'].includes(expression.name.text)
    ) {
      return true;
    }
    return (
      isTestCallee(expression.expression, bindings, namespaces) &&
      isRegistrationModifier(expression.name.text)
    );
  }
  return false;
}

function isRegistrationCall(node, bindings, namespaces) {
  if (
    isTestCallee(node.expression, bindings, namespaces) ||
    isDescribeCallee(node.expression, bindings, namespaces)
  ) {
    return true;
  }
  if (ts.isCallExpression(node.expression)) {
    return isRegistrationFactoryCall(node.expression, bindings, namespaces);
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const property = node.expression.name.text;
  if (property === 'describe' || property === 'each') {
    return isTestCallee(node.expression.expression, bindings, namespaces);
  }
  if (isRegistrationModifier(property)) {
    return isTestCallee(node.expression.expression, bindings, namespaces);
  }
  return false;
}

function isRegistrationFactoryCall(node, bindings, namespaces) {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text === 'each') {
    return (
      isTestCallee(node.expression.expression, bindings, namespaces) ||
      isDescribeCallee(node.expression.expression, bindings, namespaces)
    );
  }
  if (isRegistrationModifier(node.expression.name.text)) {
    return (
      isTestCallee(node.expression.expression, bindings, namespaces) ||
      isDescribeCallee(node.expression.expression, bindings, namespaces)
    );
  }
  return false;
}

function isRegistrationModifier(value) {
  return [
    'concurrent',
    'fails',
    'fixme',
    'only',
    'parallel',
    'runIf',
    'sequential',
    'serial',
    'skip',
    'skipIf',
    'todo'
  ].includes(value);
}

function isDescribeCallee(expression, bindings, namespaces) {
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (
    expression.name.text === 'describe' &&
    isTestCallee(expression.expression, bindings, namespaces)
  ) {
    return true;
  }
  if (isRegistrationModifier(expression.name.text)) {
    return isDescribeCallee(expression.expression, bindings, namespaces);
  }
  return false;
}

function hasPotentialRegistration(root, bindings, namespaces) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && isRegistrationCall(node, bindings, namespaces)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function isDeferredFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function findLocalRegistrarNames(
  sourceFile,
  { testBindings, testNamespaces, synchronousCollections }
) {
  const names = new Set();
  const context = { testBindings, testNamespaces, synchronousCollections };
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasReachableRegistration(statement, context)
    ) {
      names.add(statement.name.text);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        hasReachableRegistration(declaration.initializer, context)
      ) {
        names.add(declaration.name.text);
      }
    }
  }
  return names;
}

function hasReachableRegistration(root, { testBindings, testNamespaces, synchronousCollections }) {
  let found = false;

  const visitFunction = (node, inheritedShadowed) => {
    const shadowed = new Set(inheritedShadowed);
    if (node.name && ts.isIdentifier(node.name)) shadowed.add(node.name.text);
    for (const parameter of node.parameters ?? []) {
      collectBindingNames(parameter.name, shadowed);
    }
    if (node.body) visit(node.body, shadowed);
  };

  const visit = (node, inheritedShadowed) => {
    if (found) return;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    let shadowed = inheritedShadowed;
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      shadowed = new Set(inheritedShadowed);
      collectDirectScopeBindings(node, shadowed, testBindings, testNamespaces);
      for (const statement of node.statements) {
        visit(statement, shadowed);
        if (found || isDefinitelyAbruptStatement(statement)) break;
      }
      return;
    }
    if (node !== root && isDeferredFunctionNode(node)) return;

    if (ts.isIfStatement(node)) {
      visit(node.expression, shadowed);
      const condition = readStaticBoolean(node.expression);
      if (condition !== false) visit(node.thenStatement, shadowed);
      if (condition !== true && node.elseStatement) visit(node.elseStatement, shadowed);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, shadowed);
      const condition = readStaticBoolean(node.condition);
      if (condition !== false) visit(node.whenTrue, shadowed);
      if (condition !== true) visit(node.whenFalse, shadowed);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      visit(node.left, shadowed);
      const condition = readStaticBoolean(node.left);
      if (
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        condition !== false
      ) {
        visit(node.right, shadowed);
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition !== true) {
        visit(node.right, shadowed);
      }
      return;
    }
    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isCatchClause(node)
    ) {
      return;
    }
    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, shadowed);
      if (node.finallyBlock) visit(node.finallyBlock, shadowed);
      return;
    }

    if (ts.isCallExpression(node)) {
      const activeBindings = new Set([...testBindings].filter((binding) => !shadowed.has(binding)));
      const activeNamespaces = new Set(
        [...testNamespaces].filter((binding) => !shadowed.has(binding))
      );
      if (isRegistrationCall(node, activeBindings, activeNamespaces)) {
        found = true;
        return;
      }
      const callee = unwrapExpression(node.expression);
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        visitFunction(callee, shadowed);
        return;
      }
      if (isSynchronousCollectionIteration(node, synchronousCollections)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, shadowed));
  };

  const unwrappedRoot = unwrapExpression(root);
  if (ts.isFunctionExpression(unwrappedRoot) || ts.isArrowFunction(unwrappedRoot)) {
    visitFunction(unwrappedRoot, new Set());
  } else if (ts.isFunctionDeclaration(unwrappedRoot)) {
    visitFunction(unwrappedRoot, new Set());
  } else {
    visit(unwrappedRoot, new Set());
  }
  return found;
}

function collectDirectScopeBindings(container, target, testBindings, testNamespaces) {
  for (const statement of container.statements ?? []) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) target.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        isTestExtensionInitializer(declaration.initializer, testBindings, testNamespaces)
      ) {
        continue;
      }
      collectBindingNames(declaration.name, target);
    }
  }
}

function collectBindingNames(name, target) {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }
  for (const element of name.elements ?? []) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, target);
  }
}

function collectDirectDeclaredNames(container) {
  const names = new Set();
  for (const statement of container.statements ?? []) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) names.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, names);
    }
  }
  return names;
}

function readDynamicImportSpecifier(expression) {
  let current = unwrapExpression(expression);
  while (ts.isAwaitExpression(current)) current = unwrapExpression(current.expression);
  if (
    ts.isCallExpression(current) &&
    current.expression.kind === ts.SyntaxKind.ImportKeyword &&
    current.arguments.length === 1 &&
    ts.isStringLiteralLike(current.arguments[0])
  ) {
    return current.arguments[0].text;
  }
  return undefined;
}

function collectDynamicImportSpecifiers(root) {
  const specifiers = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return [...specifiers];
}

function readBindingPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

function readDirectDynamicRegistrarCall(node) {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const specifier = readDynamicImportSpecifier(node.expression.expression);
  if (!specifier) return undefined;
  return { specifier, imported: node.expression.name.text };
}

function isTestExtensionInitializer(initializer, testBindings, testNamespaces) {
  const expression = unwrapExpression(initializer);
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'extend' &&
    isTestCallee(expression.expression.expression, testBindings, testNamespaces)
  );
}

function findSynchronousCollectionBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(unwrapExpression(declaration.initializer))
      ) {
        bindings.set(
          declaration.name.text,
          unwrapExpression(declaration.initializer).elements.length
        );
      }
    }
  }
  return bindings;
}

function isSynchronousCollectionIteration(node, bindings) {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== 'forEach') return false;
  const receiver = unwrapExpression(node.expression.expression);
  if (ts.isArrayLiteralExpression(receiver)) return receiver.elements.length > 0;
  return ts.isIdentifier(receiver) && (bindings.get(receiver.text) ?? 0) > 0;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectDiscoveryEffects(
  sourceFile,
  { testBindings, suiteBindings, testNamespaces, synchronousCollections, importedBindingNames }
) {
  const calledIdentifiers = new Set();
  const calledProperties = new Set();
  const dynamicImports = new Set();
  const dynamicBindings = new Map();
  const dynamicRegistrarCalls = [];

  const visitFunction = (node, inheritedShadowed) => {
    const shadowed = new Set(inheritedShadowed);
    if (node.name && ts.isIdentifier(node.name) && importedBindingNames.has(node.name.text)) {
      shadowed.add(node.name.text);
    }
    for (const parameter of node.parameters ?? []) {
      const names = new Set();
      collectBindingNames(parameter.name, names);
      for (const name of names) {
        if (importedBindingNames.has(name)) shadowed.add(name);
      }
    }
    if (node.body) visit(node.body, shadowed);
  };

  const visit = (node, inheritedShadowed) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    let shadowed = inheritedShadowed;
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      shadowed = new Set(inheritedShadowed);
      for (const name of collectDirectDeclaredNames(node)) {
        if (importedBindingNames.has(name)) shadowed.add(name);
      }
      for (const statement of node.statements) {
        visit(statement, shadowed);
        if (isDefinitelyAbruptStatement(statement)) break;
      }
      return;
    }
    if (node !== sourceFile && isDeferredFunctionNode(node)) return;

    if (ts.isIfStatement(node)) {
      visit(node.expression, shadowed);
      const condition = readStaticBoolean(node.expression);
      if (condition === true) visit(node.thenStatement, shadowed);
      if (condition === false && node.elseStatement) visit(node.elseStatement, shadowed);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, shadowed);
      const condition = readStaticBoolean(node.condition);
      if (condition === true) visit(node.whenTrue, shadowed);
      if (condition === false) visit(node.whenFalse, shadowed);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      visit(node.left, shadowed);
      const condition = readStaticBoolean(node.left);
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && condition === true) {
        visit(node.right, shadowed);
      }
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition === false) {
        visit(node.right, shadowed);
      }
      return;
    }
    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node)
    ) {
      return;
    }
    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, shadowed);
      if (node.finallyBlock) visit(node.finallyBlock, shadowed);
      return;
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      const specifier = readDynamicImportSpecifier(node.initializer);
      if (specifier) {
        if (ts.isIdentifier(node.name)) {
          dynamicBindings.set(node.name.text, { specifier, imported: '*' });
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const imported = element.propertyName
              ? readBindingPropertyName(element.propertyName)
              : element.name.text;
            if (imported) {
              dynamicBindings.set(element.name.text, { specifier, imported });
            }
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        dynamicImports.add(node.arguments[0].text);
        return;
      }
      if (ts.isIdentifier(node.expression) && !shadowed.has(node.expression.text)) {
        calledIdentifiers.add(node.expression.text);
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        !shadowed.has(node.expression.expression.text)
      ) {
        calledProperties.add(`${node.expression.expression.text}\0${node.expression.name.text}`);
      }
      const dynamicCall = readDirectDynamicRegistrarCall(node);
      if (dynamicCall) dynamicRegistrarCalls.push(dynamicCall);
      const callee = unwrapExpression(node.expression);
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        visitFunction(callee, shadowed);
      }
      if (isSynchronousCollectionIteration(node, synchronousCollections)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
      if (isSynchronousSuiteRegistration(node, suiteBindings, testBindings, testNamespaces)) {
        for (const argument of node.arguments) {
          if (ts.isFunctionExpression(argument) || ts.isArrowFunction(argument)) {
            visitFunction(argument, shadowed);
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, shadowed));
  };

  visit(sourceFile, new Set());
  return {
    calledIdentifiers,
    calledProperties,
    dynamicImports: [...dynamicImports],
    dynamicBindings,
    dynamicRegistrarCalls
  };
}

function isSynchronousSuiteRegistration(node, suiteBindings, testBindings, testNamespaces) {
  const expression = node.expression;
  if (isSuiteCallee(expression, suiteBindings, testBindings, testNamespaces)) return true;
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'each' &&
    isSuiteCallee(expression.expression.expression, suiteBindings, testBindings, testNamespaces)
  );
}

function isSuiteCallee(expression, suiteBindings, testBindings, testNamespaces) {
  if (ts.isIdentifier(expression)) return suiteBindings.has(expression.text);
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (
    ts.isIdentifier(expression.expression) &&
    testNamespaces.has(expression.expression.text) &&
    ['describe', 'suite'].includes(expression.name.text)
  ) {
    return true;
  }
  if (
    expression.name.text === 'describe' &&
    isTestCallee(expression.expression, testBindings, testNamespaces)
  ) {
    return true;
  }
  if (['concurrent', 'only', 'parallel', 'sequential', 'serial'].includes(expression.name.text)) {
    return isSuiteCallee(expression.expression, suiteBindings, testBindings, testNamespaces);
  }
  return false;
}

const STATIC_UNKNOWN = Symbol('static-unknown');

function readStaticBoolean(node) {
  const value = readStaticPrimitive(node);
  return value === STATIC_UNKNOWN ? undefined : Boolean(value);
}

function readStaticPrimitive(node) {
  const expression = unwrapExpression(node);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isVoidExpression(expression)) return undefined;
  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = readStaticPrimitive(expression.operand);
    if (operand === STATIC_UNKNOWN) return STATIC_UNKNOWN;
    if (expression.operator === ts.SyntaxKind.ExclamationToken) return !operand;
    if (expression.operator === ts.SyntaxKind.PlusToken && typeof operand === 'number') {
      return +operand;
    }
    if (expression.operator === ts.SyntaxKind.MinusToken && typeof operand === 'number') {
      return -operand;
    }
    return STATIC_UNKNOWN;
  }
  if (ts.isBinaryExpression(expression)) {
    const left = readStaticPrimitive(expression.left);
    const right = readStaticPrimitive(expression.right);
    if (left === STATIC_UNKNOWN || right === STATIC_UNKNOWN) return STATIC_UNKNOWN;
    switch (expression.operatorToken.kind) {
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return left === right;
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return left !== right;
      case ts.SyntaxKind.EqualsEqualsToken:
        return (
          left === right ||
          ((left === null || left === undefined) && (right === null || right === undefined))
        );
      case ts.SyntaxKind.ExclamationEqualsToken:
        return !(
          left === right ||
          ((left === null || left === undefined) && (right === null || right === undefined))
        );
      case ts.SyntaxKind.LessThanToken:
        return left < right;
      case ts.SyntaxKind.LessThanEqualsToken:
        return left <= right;
      case ts.SyntaxKind.GreaterThanToken:
        return left > right;
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return left >= right;
      default:
        return STATIC_UNKNOWN;
    }
  }
  return STATIC_UNKNOWN;
}

function isDefinitelyAbruptStatement(statement) {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) {
      if (isDefinitelyAbruptStatement(child)) return true;
    }
    return false;
  }
  if (ts.isIfStatement(statement)) {
    const condition = readStaticBoolean(statement.expression);
    if (condition === true) return isDefinitelyAbruptStatement(statement.thenStatement);
    if (condition === false) {
      return Boolean(
        statement.elseStatement && isDefinitelyAbruptStatement(statement.elseStatement)
      );
    }
    return Boolean(
      statement.elseStatement &&
      isDefinitelyAbruptStatement(statement.thenStatement) &&
      isDefinitelyAbruptStatement(statement.elseStatement)
    );
  }
  if (ts.isTryStatement(statement)) {
    if (statement.finallyBlock && isDefinitelyAbruptStatement(statement.finallyBlock)) return true;
    if (!isDefinitelyAbruptStatement(statement.tryBlock)) return false;
    return !statement.catchClause || isDefinitelyAbruptStatement(statement.catchClause.block);
  }
  return false;
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function hasDefaultModifier(node) {
  return Boolean(
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

function getExportedFunctionName(node) {
  if (!ts.isFunctionDeclaration(node) || !hasExportModifier(node) || !node.body) return undefined;
  if (hasDefaultModifier(node)) return 'default';
  return node.name?.text;
}

function findDefineConfigObject(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${file} contains TypeScript parse errors`);
  }
  let result;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineConfig' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!result) {
    throw new Error(`${file} has no static defineConfig object`);
  }
  return result;
}

function getPropertyInitializer(object, name) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined;
    if (propertyName === name) return property.initializer;
  }
  return undefined;
}

function getObjectProperty(object, name) {
  const initializer = getPropertyInitializer(object, name);
  return initializer && ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

function readStringArrayProperty(object, name, { required, file }) {
  const initializer = getPropertyInitializer(object, name);
  if (!initializer) {
    if (required) throw new Error(`${file} has no ${name} array`);
    return [];
  }
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${file} ${name} must be a static string array`);
  }
  return initializer.elements.map((element) => {
    if (!ts.isStringLiteralLike(element)) {
      throw new Error(`${file} ${name} contains a non-string member`);
    }
    return element.text;
  });
}

function readRepositoryPathExpression(expression) {
  if (ts.isStringLiteralLike(expression)) {
    return normalizeRepositoryPath(expression.text);
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'path' &&
    expression.expression.name.text === 'join' &&
    expression.arguments.length >= 2 &&
    ts.isIdentifier(expression.arguments[0]) &&
    expression.arguments[0].text === '__dirname' &&
    expression.arguments.slice(1).every((argument) => ts.isStringLiteralLike(argument))
  ) {
    const parts = expression.arguments.slice(1).map((argument) => argument.text);
    return normalizeRepositoryPath(path.posix.join(...parts));
  }
  return undefined;
}

function filterByVitestConfig(files, config) {
  return files.filter(
    (file) =>
      config.include.some((pattern) => matchesTestPattern(file, pattern)) &&
      !config.exclude.some((pattern) => matchesTestPattern(file, pattern))
  );
}

function assignShardOwners({
  kind,
  shards,
  eligibleFiles,
  allRunnableFiles,
  ownersByFile,
  emptyPatterns,
  duplicateRouteMembers,
  invalidDescriptors
}) {
  const seenIds = new Set();
  const eligibleSet = new Set(eligibleFiles);
  for (const shard of shards) {
    if (
      !shard ||
      typeof shard.id !== 'string' ||
      shard.id.length === 0 ||
      !Array.isArray(shard.patterns) ||
      shard.patterns.length === 0
    ) {
      invalidDescriptors.push(`${kind} shard is not a valid descriptor`);
      continue;
    }
    if (seenIds.has(shard.id)) {
      invalidDescriptors.push(`${kind} shard id is duplicated: ${shard.id}`);
    }
    seenIds.add(shard.id);
    const matchedPatternsByFile = new Map();
    for (const pattern of shard.patterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        invalidDescriptors.push(`${kind} shard ${shard.id} contains an invalid pattern`);
        continue;
      }
      const globallyMatched = allRunnableFiles.filter((file) => matchesTestPattern(file, pattern));
      const matched = globallyMatched.filter((file) => eligibleSet.has(file));
      if (matched.length === 0) {
        emptyPatterns.push({ kind, shard: shard.id, pattern });
      }
      const outsideConfig = globallyMatched.filter((file) => !eligibleSet.has(file));
      for (const file of outsideConfig) {
        invalidDescriptors.push(
          `${kind} shard ${shard.id} pattern ${pattern} escapes its Vitest config: ${file}`
        );
      }
      for (const file of matched) {
        const priorPatterns = matchedPatternsByFile.get(file) ?? [];
        if (priorPatterns.length > 0) {
          duplicateRouteMembers.push({ route: `vitest:${kind}:${shard.id}`, file });
        }
        priorPatterns.push(pattern);
        matchedPatternsByFile.set(file, priorPatterns);
        ownersByFile.get(file).add(`vitest:${kind}:${shard.id}`);
      }
    }
  }
}

export function matchesTestPattern(file, pattern) {
  const normalizedFile = normalizeRepositoryPath(file);
  const normalizedPattern = pattern.replaceAll('\\', '/');
  if (/\r|\n/u.test(normalizedFile) || /\r|\n/u.test(normalizedPattern)) return false;
  if (!normalizedPattern.includes('*')) {
    return normalizedFile === normalizeRepositoryPath(normalizedPattern);
  }
  const source = normalizedPattern
    .split(/(\*\*\/|\*\*|\*)/gu)
    .map((part) => {
      if (part === '**/') return '(?:[\\s\\S]*/)?';
      if (part === '**') return '[\\s\\S]*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`, 'u').test(normalizedFile);
}

function createBrowserDescriptorRoutes(browserSuites, invalidDescriptors) {
  const routes = [];
  if (!browserSuites || typeof browserSuites !== 'object' || Array.isArray(browserSuites)) {
    invalidDescriptors.push('browser suite registry is not an object');
    return routes;
  }
  for (const [suite, descriptors] of Object.entries(browserSuites)) {
    if (!Array.isArray(descriptors)) {
      invalidDescriptors.push(`browser suite ${suite} is not an array`);
      continue;
    }
    const seenIds = new Set();
    for (const descriptor of descriptors) {
      if (
        !descriptor ||
        typeof descriptor !== 'object' ||
        typeof descriptor.id !== 'string' ||
        descriptor.id.length === 0 ||
        !Array.isArray(descriptor.args) ||
        descriptor.args.some((argument) => typeof argument !== 'string')
      ) {
        invalidDescriptors.push(`browser suite ${suite} contains an invalid descriptor`);
        continue;
      }
      if (seenIds.has(descriptor.id)) {
        invalidDescriptors.push(`browser suite ${suite} duplicates descriptor id ${descriptor.id}`);
      }
      seenIds.add(descriptor.id);
      routes.push({
        id: `browser-shard:${suite}:${descriptor.id}`,
        args: descriptor.args,
        source: 'browser-shard'
      });
    }
  }
  return routes;
}

function createPackageScriptRoutes(packageScripts, invalidDescriptors) {
  const routes = [];
  for (const [scriptName, script] of Object.entries(packageScripts)) {
    if (typeof script !== 'string') continue;
    let ordinal = 0;
    const commands = splitShellCommands(script);
    const hasUnsupportedControlFlow = commands.some(({ operator }) =>
      ['||', '|', '&'].includes(operator)
    );
    const evidenceConsumer =
      commands.filter(({ tokens }) => !isPackageSetupCommand(tokens, packageScripts)).length > 1;
    for (const command of commands) {
      const args = extractPlaywrightArgs(command.tokens);
      if (args) {
        if (hasUnsupportedControlFlow) {
          invalidDescriptors.push(
            `package script ${scriptName} uses unsupported control flow around Playwright`
          );
          continue;
        }
        if (evidenceConsumer) continue;
        routes.push({
          id: `package:${scriptName}:${ordinal}`,
          args,
          source: 'package-script'
        });
        ordinal += 1;
      }
    }
  }
  return routes;
}

function isPackageSetupCommand(command, packageScripts, activeScripts = new Set()) {
  let offset = 0;
  while (offset < command.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(command[offset])) {
    offset += 1;
  }
  const tokens = command.slice(offset);
  if (tokens[0] === 'npm' && tokens[1] === 'run') {
    const scriptName = tokens[2];
    if (
      typeof scriptName !== 'string' ||
      (scriptName !== 'verify:runtime' && !scriptName.startsWith('build:')) ||
      !Object.hasOwn(packageScripts, scriptName) ||
      activeScripts.has(scriptName)
    ) {
      return false;
    }
    const source = packageScripts[scriptName];
    if (typeof source !== 'string' || source.trim().length === 0) return false;
    let commands;
    try {
      commands = splitShellCommands(source);
    } catch {
      return false;
    }
    if (
      commands.length === 0 ||
      commands.some(({ operator }, index) => index > 0 && operator !== '&&')
    ) {
      return false;
    }
    const nestedScripts = new Set(activeScripts).add(scriptName);
    return commands.every(({ tokens: nested }) =>
      isPackageSetupCommand(nested, packageScripts, nestedScripts)
    );
  }
  if (tokens[0] !== 'node') return false;
  const entrypoint = tokens
    .slice(1)
    .find((token) => !token.startsWith('-'))
    ?.replaceAll('\\', '/');
  return entrypoint === 'scripts/verify-runtime.mjs' || entrypoint === 'scripts/build.mjs';
}

function splitShellCommands(source) {
  const commands = [];
  let tokens = [];
  let token = '';
  let quote = '';
  let escaped = false;
  let nextOperator = '';
  const flushToken = () => {
    if (token.length > 0) tokens.push(token);
    token = '';
  };
  const flushCommand = (operator = '') => {
    flushToken();
    if (tokens.length > 0) {
      commands.push({ tokens, operator: nextOperator });
      nextOperator = operator;
    } else if (operator) {
      nextOperator = operator;
    }
    tokens = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      else token += character;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      flushToken();
      if (character === '\n') flushCommand('\n');
      continue;
    }
    if (character === ';' || (character === '&' && source[index + 1] === '&')) {
      flushCommand(character === '&' ? '&&' : ';');
      if (character === '&') index += 1;
      continue;
    }
    if (character === '|' && source[index + 1] === '|') {
      flushCommand('||');
      index += 1;
      continue;
    }
    if (character === '|' || character === '&') {
      flushCommand(character);
      continue;
    }
    token += character;
  }
  if (escaped || quote) {
    throw new Error('Package script contains an unterminated escape or quote');
  }
  flushCommand();
  return commands;
}

function extractPlaywrightArgs(command) {
  let offset = 0;
  while (offset < command.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(command[offset])) {
    offset += 1;
  }
  const tokens = command.slice(offset);
  if (tokens[0] === 'node' && tokens[1]?.replaceAll('\\', '/') === 'scripts/run-playwright.mjs') {
    const args = tokens.slice(2);
    return args[0] === 'test' ? args : undefined;
  }
  if (tokens[0] === 'npx' && tokens[1] === 'playwright') {
    const args = tokens.slice(2);
    return args[0] === 'test' ? args : undefined;
  }
  if (tokens[0] === 'playwright') {
    const args = tokens.slice(1);
    return args[0] === 'test' ? args : undefined;
  }
  return undefined;
}

function resolvePlaywrightRoute(
  route,
  {
    fileSet,
    runnableSet,
    playwrightConfigs,
    missingRouteMembers,
    duplicateRouteMembers,
    invalidDescriptors
  }
) {
  if (!Array.isArray(route.args)) {
    invalidDescriptors.push(`${route.id} has no argument array`);
    return { ...route, files: [], invalid: true };
  }
  const testIndex = route.args.indexOf('test');
  if (testIndex < 0) {
    invalidDescriptors.push(`${route.id} has no Playwright test command`);
    return { ...route, files: [], invalid: true };
  }
  const parsed = parsePlaywrightTestArguments(route, testIndex, invalidDescriptors);
  const config = playwrightConfigs.get(parsed.configPath);
  if (!config) {
    missingRouteMembers.push({ route: route.id, file: `config:${parsed.configPath}` });
    parsed.invalid = true;
  }
  const normalizedMembers = parsed.members;
  const seen = new Set();
  for (const file of normalizedMembers) {
    if (seen.has(file)) {
      duplicateRouteMembers.push({ route: route.id, file });
      parsed.invalid = true;
    }
    seen.add(file);
    if (!fileSet.has(file)) {
      missingRouteMembers.push({ route: route.id, file });
      parsed.invalid = true;
    } else if (!runnableSet.has(file)) {
      invalidDescriptors.push(`${route.id} names a non-runnable test module: ${file}`);
      parsed.invalid = true;
    }
  }
  if (parsed.explicit) {
    return {
      ...route,
      files: [...seen].filter((file) => runnableSet.has(file)).sort(comparePaths),
      explicit: true,
      invalid: parsed.invalid
    };
  }

  if (!config) {
    return { ...route, files: [], explicit: false, invalid: true };
  }
  const files = [...runnableSet]
    .filter((file) => isCollectedByPlaywrightConfig(file, config))
    .sort(comparePaths);
  if (files.length === 0) {
    invalidDescriptors.push(`${route.id} resolves to an empty Playwright collection`);
    return { ...route, files, explicit: false, invalid: true };
  }
  return { ...route, files, explicit: false, invalid: parsed.invalid };
}

const PLAYWRIGHT_OPTIONS_WITH_VALUES = new Set([
  '--config',
  '-c',
  '--global-timeout',
  '--grep',
  '-g',
  '--grep-invert',
  '--max-failures',
  '--output',
  '--project',
  '--repeat-each',
  '--reporter',
  '--retries',
  '--shard',
  '--timeout',
  '--tsconfig',
  '--workers',
  '-j'
]);
const PLAYWRIGHT_NON_CANONICAL_FILTERS = new Set([
  '--grep',
  '-g',
  '--grep-invert',
  '--last-failed',
  '--list',
  '--only-changed',
  '--pass-with-no-tests',
  '--shard',
  '--ui'
]);

function parsePlaywrightTestArguments(route, testIndex, invalidDescriptors) {
  const members = [];
  let configPath = 'playwright.config.ts';
  let configCount = 0;
  let explicit = false;
  let invalid = false;
  let afterDoubleDash = false;
  const args = route.args.slice(testIndex + 1);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!afterDoubleDash && argument === '--') {
      afterDoubleDash = true;
      continue;
    }
    if (!afterDoubleDash && argument.startsWith('-')) {
      const equalsIndex = argument.indexOf('=');
      const option = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
      if (PLAYWRIGHT_NON_CANONICAL_FILTERS.has(option)) {
        invalidDescriptors.push(
          `${route.id} uses Playwright filter ${option}, which is not a complete collection owner`
        );
        invalid = true;
      }
      if (option === '--config' || option === '-c') {
        const value = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : args[++index];
        if (!value || value.startsWith('-')) {
          invalidDescriptors.push(`${route.id} has an invalid Playwright config argument`);
          invalid = true;
          continue;
        }
        configCount += 1;
        try {
          configPath = normalizeRepositoryPath(value);
        } catch {
          invalidDescriptors.push(`${route.id} has a non-repository Playwright config path`);
          invalid = true;
        }
        continue;
      }
      if (equalsIndex < 0 && PLAYWRIGHT_OPTIONS_WITH_VALUES.has(option)) {
        const value = args[++index];
        if (value === undefined) {
          invalidDescriptors.push(`${route.id} has no value for Playwright option ${option}`);
          invalid = true;
        }
      }
      continue;
    }

    explicit = true;
    if (!TEST_MODULE_PATTERN.test(argument)) {
      invalidDescriptors.push(`${route.id} has an unsupported Playwright selector: ${argument}`);
      invalid = true;
      continue;
    }
    members.push(normalizeRepositoryPath(argument));
  }

  if (configCount > 1) {
    invalidDescriptors.push(`${route.id} provides Playwright config more than once`);
    invalid = true;
  }
  return { members, configPath, explicit, invalid };
}

function isCollectedByPlaywrightConfig(file, config) {
  if (!(file === config.testDir || file.startsWith(`${config.testDir}/`))) return false;
  if (
    config.testMatch.length > 0 &&
    !config.testMatch.some((pattern) => matchesTestPattern(file, pattern))
  ) {
    return false;
  }
  if (config.testIgnore.some((pattern) => matchesTestPattern(file, pattern))) return false;
  return true;
}

function assignCanonicalBrowserOwners(routes, ownersByFile) {
  const uniqueRoutes = new Map();
  for (const route of routes) {
    if (route.invalid || route.files.length === 0) continue;
    const signature = JSON.stringify(route.files);
    if (!uniqueRoutes.has(signature)) {
      uniqueRoutes.set(signature, {
        id: `playwright:${signature}`,
        files: route.files,
        explicit: route.explicit
      });
    } else if (route.explicit) {
      uniqueRoutes.get(signature).explicit = true;
    }
  }
  const candidates = [...uniqueRoutes.values()];
  for (const [file, owners] of ownersByFile) {
    const containing = candidates.filter((route) => route.files.includes(file));
    const canonical = containing.filter(
      (route) =>
        !containing.some(
          (other) =>
            other !== route &&
            other.files.length < route.files.length &&
            other.files.every((member) => route.files.includes(member))
        )
    );
    for (const route of canonical) owners.add(route.id);
  }
}

function buildImportLinks(modules, invalidDescriptors) {
  const links = [];
  const fileSet = new Set(modules.keys());
  const unresolved = new Set();
  for (const [file, module] of modules) {
    for (const imported of module.imports) {
      const target = resolveTestImport(file, imported.specifier, fileSet);
      if (target) {
        links.push({ importer: file, imported: target, dynamic: imported.dynamic });
        continue;
      }
      if (
        imported.specifier.startsWith('.') &&
        createTestImportCandidates(file, imported.specifier).some((candidate) =>
          TEST_MODULE_PATTERN.test(candidate)
        )
      ) {
        unresolved.add(`${file} -> ${imported.specifier}`);
      }
    }
    for (const specifier of module.dynamicImportSpecifiers) {
      if (
        specifier.startsWith('.') &&
        !resolveTestImport(file, specifier, fileSet) &&
        createTestImportCandidates(file, specifier).some((candidate) =>
          TEST_MODULE_PATTERN.test(candidate)
        )
      ) {
        unresolved.add(`${file} -> ${specifier}`);
      }
    }
  }
  for (const entry of [...unresolved].sort(comparePaths)) {
    invalidDescriptors.push(`unresolved test-module import: ${entry}`);
  }
  return links;
}

function resolveTestImport(importer, specifier, fileSet) {
  if (!specifier.startsWith('.')) return undefined;
  return createTestImportCandidates(importer, specifier).find((candidate) =>
    fileSet.has(candidate)
  );
}

function createTestImportCandidates(importer, specifier) {
  const base = normalizeRepositoryPath(path.posix.join(path.posix.dirname(importer), specifier));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
}

function findStructurallyReachableModules(runnableFiles, importLinks) {
  const reachable = new Set(runnableFiles);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of importLinks) {
      if (reachable.has(link.importer) && !reachable.has(link.imported)) {
        reachable.add(link.imported);
        changed = true;
      }
    }
  }
  return reachable;
}

function findRegistrarConsumption(file, module, modules) {
  const callers = new Set();
  const consumedExports = new Set();
  const fileSet = new Set(modules.keys());
  for (const [callerFile, caller] of modules) {
    if (!caller.directRegistration) continue;
    for (const [local, binding] of caller.importedBindings) {
      const target = resolveTestImport(callerFile, binding.specifier, fileSet);
      const called =
        (binding.imported === '*' &&
          [...module.exportedRegistrars].some((exported) =>
            caller.calledProperties.has(`${local}\0${exported}`)
          )) ||
        (binding.imported !== '*' &&
          module.exportedRegistrars.has(binding.imported) &&
          caller.calledIdentifiers.has(local));
      if (target === file && called) {
        callers.add(callerFile);
        if (binding.imported === '*') {
          for (const exported of module.exportedRegistrars) {
            if (caller.calledProperties.has(`${local}\0${exported}`)) {
              consumedExports.add(exported);
            }
          }
        } else {
          consumedExports.add(binding.imported);
        }
      }
    }
    for (const dynamicCall of caller.dynamicRegistrarCalls) {
      const target = resolveTestImport(callerFile, dynamicCall.specifier, fileSet);
      if (target === file && module.exportedRegistrars.has(dynamicCall.imported)) {
        callers.add(callerFile);
        consumedExports.add(dynamicCall.imported);
      }
    }
  }
  return {
    callers: [...callers].sort(comparePaths),
    allConsumed:
      module.exportedRegistrars.size > 0 &&
      [...module.exportedRegistrars].every((exported) => consumedExports.has(exported))
  };
}
