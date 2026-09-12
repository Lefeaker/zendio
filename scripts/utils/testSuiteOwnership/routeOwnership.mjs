import { TEST_MODULE_PATTERN, comparePaths, normalizeRepositoryPath } from './gitInventory.mjs';
import { analyzeTestModule } from './moduleAnalysis.mjs';
import {
  buildImportLinks,
  findRegistrarConsumption,
  findStructurallyReachableModules
} from './registrationFlow.mjs';
import { filterByVitestConfig, matchesTestPattern } from './collectionConfig.mjs';

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
