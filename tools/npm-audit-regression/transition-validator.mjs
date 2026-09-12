import { fileURLToPath } from 'node:url';
import {
  AUDIT_REGRESSION_LIMITS,
  assertJsonEqual,
  assertPlainJson,
  canonicalJsonBytes,
  canonicalize,
  cloneJson,
  deepFreeze,
  parseJsonBytesStrict,
  readFileBounded,
  sha256Buffer,
  sha256Text
} from './canonical-json.mjs';

export const TOOL_SCHEMA = 'zendio-npm-audit-evidence-v1';
export const FIXED_BASE_COMMIT = '5cdc87db68fb58233d2d9f1be82c3d4b5c043ebc';
export const FIXED_BASE_TREE = '3b44d454ff5a74e278bb88dbf62959bb6886ce53';
export const ACCEPTED_R01_COMMIT = 'e190bdc2fea559c8a3e90bb7220286de2595a754';
export const ACCEPTED_R01_TREE = 'e90eaff9b9c55260e9a12d7e5f076c1eef3d174e';
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
export const R02_TRANSITION_ARTIFACT_SHA256 =
  'e0af57ea02d4244a8969154ff1e1b975085fb433163b5d946fce38e4ff863143';
const manifestPath = fileURLToPath(new URL('./manifests/r02-transition-v10.json', import.meta.url));
const LOCK_ROW_FIELDS = Object.freeze(
  'version resolved integrity dependencies cpu deprecated optionalDependencies peerDependencies peerDependenciesMeta dev optional devOptional inBundle hasInstallScript license os engines bin funding link'.split(
    ' '
  )
);
const R02_ADJACENCY_FIELDS = Object.freeze(
  'dependencies optionalDependencies peerDependencies'.split(' ')
);

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`TRANSITION_SCHEMA_MISMATCH:${label}`);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`TRANSITION_SCHEMA_MISMATCH:${label}`);
  }
}

function assertTransitionManifestSchema(value) {
  assertExactKeys(
    value,
    'schema base runtime packageSha256 lockSha256 packageTransition rootLockBefore rootLockAfter lockDelta unchangedPromotions closureNodes referencedUnchangedEntries counts internalDigest'.split(
      ' '
    ),
    'root'
  );
  assertExactKeys(
    value.schema,
    ['name', 'version', 'rejectUnknownFields', 'rejectDuplicateFields'],
    'schema'
  );
  assertExactKeys(
    value.base,
    ['head', 'tree', 'packageBlobSha1', 'lockBlobSha1', 'packageSha256', 'lockSha256'],
    'base'
  );
  assertExactKeys(
    value.runtime,
    'nodeVersion nodeEngine npmVersion npmEngine npmCliSha256 npmPackageSha256 discoveryContract registry'.split(
      ' '
    ),
    'runtime'
  );
  assertExactKeys(
    value.packageTransition,
    ['beforeSha256', 'afterSha256', 'delta'],
    'packageTransition'
  );
  assertExactKeys(
    value.packageTransition.delta,
    ['script', 'devDependenciesAdded'],
    'packageTransition.delta'
  );
  assertExactKeys(
    value.packageTransition.delta.script,
    ['name', 'before', 'after'],
    'packageTransition.delta.script'
  );
  assertExactKeys(value.lockDelta, ['addedKeys', 'removedKeys', 'changedKeys'], 'lockDelta');
  assertExactKeys(
    value.counts,
    'addedKeys closureNodes referencedUnchangedEntries removedKeys unchangedExistingNodes'.split(
      ' '
    ),
    'counts'
  );
  if (
    value.schema.name !== 'r02-transition-v10' ||
    value.schema.version !== 10 ||
    value.schema.rejectUnknownFields !== true ||
    value.schema.rejectDuplicateFields !== true
  )
    throw new Error('TRANSITION_SCHEMA_MISMATCH:schema-values');
  if (
    value.packageTransition.beforeSha256 !== value.base.packageSha256 ||
    value.packageTransition.afterSha256 !== value.packageSha256 ||
    value.lockSha256 === value.base.lockSha256
  )
    throw new Error('TRANSITION_RELATION_MISMATCH:root-digests');
  for (const [name, rows] of Object.entries({
    closureNodes: value.closureNodes,
    referencedUnchangedEntries: value.referencedUnchangedEntries,
    unchangedPromotions: value.unchangedPromotions
  })) {
    if (!Array.isArray(rows)) throw new Error(`TRANSITION_SCHEMA_MISMATCH:${name}`);
    for (const row of rows) {
      assertExactKeys(
        row,
        name === 'closureNodes' ? ['key', 'lockEntry', 'adjacency'] : ['key', 'lockEntry'],
        `${name}[]`
      );
      if (typeof row.key !== 'string') throw new Error(`TRANSITION_SCHEMA_MISMATCH:${name}.key`);
      assertPlainJson(row.lockEntry, { path: `${name}.${row.key}.lockEntry` });
      for (const field of Object.keys(row.lockEntry)) {
        if (!LOCK_ROW_FIELDS.includes(field))
          throw new Error(`TRANSITION_SCHEMA_MISMATCH:${name}.lockEntry.${field}`);
      }
      if (name === 'closureNodes') {
        assertExactKeys(row.adjacency, R02_ADJACENCY_FIELDS, `${name}.adjacency`);
        for (const field of R02_ADJACENCY_FIELDS) {
          if (!Array.isArray(row.adjacency[field]))
            throw new Error(`TRANSITION_SCHEMA_MISMATCH:${name}.adjacency.${field}`);
          for (const edge of row.adjacency[field]) {
            assertExactKeys(edge, ['name', 'spec', 'resolvedKey'], `${name}.adjacency.${field}[]`);
            if (
              ![edge.name, edge.spec, edge.resolvedKey].every(
                (item) => typeof item === 'string' && item.length > 0
              )
            )
              throw new Error(`TRANSITION_SCHEMA_MISMATCH:${name}.adjacency.${field}.value`);
          }
        }
      }
    }
    const keys = rows.map((row) => row.key);
    if (new Set(keys).size !== keys.length)
      throw new Error(`TRANSITION_RELATION_MISMATCH:${name}-duplicates`);
  }
  for (const field of ['addedKeys', 'removedKeys', 'changedKeys']) {
    const keys = value.lockDelta[field];
    if (
      !Array.isArray(keys) ||
      keys.some((key) => typeof key !== 'string') ||
      new Set(keys).size !== keys.length ||
      JSON.stringify(keys) !== JSON.stringify([...keys].sort())
    )
      throw new Error(`TRANSITION_RELATION_MISMATCH:lockDelta.${field}`);
  }
  if (
    value.counts.addedKeys !== value.lockDelta.addedKeys.length ||
    value.counts.removedKeys !== value.lockDelta.removedKeys.length ||
    value.counts.closureNodes !== value.closureNodes.length ||
    value.counts.referencedUnchangedEntries !== value.referencedUnchangedEntries.length ||
    !Number.isSafeInteger(value.counts.unchangedExistingNodes) ||
    value.counts.unchangedExistingNodes < value.unchangedPromotions.length ||
    JSON.stringify(value.lockDelta.addedKeys) !==
      JSON.stringify(value.closureNodes.map((row) => row.key))
  )
    throw new Error('TRANSITION_RELATION_MISMATCH:counts');
}

export function loadTransitionManifest(path, expectedWholeSha256) {
  const bytes = readFileBounded(path, AUDIT_REGRESSION_LIMITS.maxManifestBytes);
  const parsed = parseJsonBytesStrict(bytes, {
    path,
    maximumDepth: AUDIT_REGRESSION_LIMITS.maxManifestDepth
  });
  assertTransitionManifestSchema(parsed);
  if (!bytes.equals(canonicalJsonBytes(parsed))) throw new Error('TRANSITION_NONCANONICAL_BYTES');
  if (sha256Buffer(bytes) !== expectedWholeSha256)
    throw new Error('TRANSITION_WHOLE_DIGEST_MISMATCH');
  const semantic = cloneJson(parsed);
  const recordedDigest = semantic.internalDigest;
  delete semantic.internalDigest;
  if (sha256Buffer(canonicalJsonBytes(semantic)) !== recordedDigest)
    throw new Error('TRANSITION_SEMANTIC_DIGEST_MISMATCH');
  return deepFreeze(parsed);
}

const R02_IMMUTABLE_TRANSITION = loadTransitionManifest(
  manifestPath,
  R02_TRANSITION_ARTIFACT_SHA256
);

export const EXPECTED_NODE_VERSION = 'v20.20.2';
export const EXPECTED_NPM_VERSION = '10.8.2';
export const EXPECTED_ORIGIN_URL = 'https://github.com/Lefeaker/zendio.git';
export const GIT_COMMAND = '/usr/bin/git';
export const TERMINAL_MAIN_REF = 'refs/remotes/origin/main';
export const CHAIN = Object.freeze([
  'R02-origin',
  'R02',
  'R02B',
  'G01',
  'G02',
  'F01',
  'F01-mainline'
]);
const PACKAGE_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'overrides',
  'bundledDependencies',
  'bundleDependencies',
  'engines',
  'packageManager'
]);

const ACCEPTED_TRANSITIONS = Object.freeze({
  'R02-origin:R02': Object.freeze({
    parentMilestone: 'R02-origin',
    candidateMilestone: 'R02',
    kind: 'r02-dependency-promotion',
    devDependencies: Object.freeze({
      yauzl: '3.3.2',
      'crc-32': '1.2.2',
      'dependency-cruiser': '16.10.4'
    }),
    scriptName: 'test:i18n:visual',
    scriptBefore: 'npm run verify:runtime && playwright test --config=playwright.config.ts',
    scriptAfter:
      'npm run verify:runtime && node scripts/run-playwright.mjs test --config=playwright.config.ts'
  }),
  'R02:R02B': Object.freeze({
    parentMilestone: 'R02',
    candidateMilestone: 'R02B',
    kind: 'r02b-script-only',
    scripts: Object.freeze({
      'verify:preflight': Object.freeze([
        'npm run verify:runtime && npm run typecheck:app && npm run typecheck:tests && npm run typecheck:strict && npm run release:metadata:check && npm run i18n:catalog:check && npm run audit:i18n-uncatalogued-user-copy:check && npm run audit:ga:proxy-contract && npm run audit:ga:docs && npm run audit:ga:legacy-api && npm run lint -- --quiet && npm run build:dev && npm run audit:ga:client-secret && npm run audit:ga:release-surface && npm run audit:imports:check && npm run audit:ui-architecture:report && npm run audit:interaction-contract:report && npm run audit:options-mainline:report && npm run audit:build:report && npm run audit:performance:report',
        'node scripts/verify-preflight.mjs'
      ]),
      'verify:stitch-secondary': Object.freeze([
        'npm run preview:freeze-check && npx vitest run tests/unit/options/productionStitchShell*.test.ts tests/unit/options/stitchSharedRegistry.test.ts tests/unit/options/optionsIndexHtmlModalHosts.test.ts tests/unit/options/nativeLeafWidgets.test.ts tests/unit/optionsPreviewRuntime.test.ts && npm run visual:stitch && node scripts/run-playwright.mjs test tests/visual/preview.runtime.alignment.spec.ts tests/visual/preview.task-success.layout.spec.ts --project=chromium-desktop',
        'node scripts/run-bounded-command.mjs --profile stitch-secondary-v1'
      ]),
      test: Object.freeze([
        'npm run verify:runtime && vitest run',
        'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run'
      ]),
      'test:unit': Object.freeze([
        'npm run verify:runtime && vitest run --config vitest.unit.config.ts',
        'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts'
      ]),
      'test:e2e': Object.freeze([
        'npm run verify:runtime && vitest run --config vitest.e2e.config.ts',
        'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.e2e.config.ts'
      ]),
      'test:coverage': Object.freeze([
        'npm run verify:runtime && vitest run --config vitest.unit.config.ts --coverage',
        'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts --coverage'
      ]),
      format: Object.freeze([
        'prettier --write "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"',
        'node scripts/run-bounded-command.mjs --profile prettier-v1 -- --write "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"'
      ]),
      'format:check': Object.freeze([
        'prettier --check "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"',
        'node scripts/run-bounded-command.mjs --profile prettier-v1 -- --check "{src,tests,docs}/**/*.{ts,tsx,js,jsx,json,md}"'
      ]),
      'lint:options-css': Object.freeze([
        'stylelint "src/options/**/*.css"',
        'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css"'
      ])
    })
  }),
  'R02B:G01': Object.freeze({
    parentMilestone: 'R02B',
    candidateMilestone: 'G01',
    kind: 'g01-focus-trap-and-script-closure',
    removeDependencies: Object.freeze({ 'focus-trap': '^7.6.6' }),
    removeLockRows: Object.freeze({
      'node_modules/focus-trap': '7.6.6',
      'node_modules/tabbable': '6.3.0'
    }),
    deleteScripts: Object.freeze({
      'package:firefox:sign': 'npm run build:firefox && node scripts/package-firefox.mjs --sign',
      'package:firefox:prod:ga:ci':
        'npm run build:firefox:prod:ga:ci && node scripts/package-firefox.mjs --sign',
      'release:chrome': 'npm run release:chrome:dry-run --',
      'release:chrome:dry-run': 'node scripts/publish-chrome-webstore.mjs --dry-run',
      'release:chrome:publish': 'node scripts/publish-chrome-webstore.mjs --publish',
      'lint:options-css':
        'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css"'
    }),
    addScripts: Object.freeze({
      'audit:firefox-amo-release:report':
        'node tools/report-firefox-amo-release-workflow.mjs --report',
      'audit:firefox-amo-release:check':
        'node tools/report-firefox-amo-release-workflow.mjs --check',
      'test:e2e:browser:state':
        'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/sessionDraftConcurrency.browser.test.ts tests/e2e/optionsCrossContextMutation.browser.test.ts tests/e2e/videoScreenshotCacheMigration.browser.test.ts --project=chromium-desktop',
      'test:e2e:browser:architecture':
        'npm run verify:runtime && node scripts/run-playwright.mjs test tests/e2e/uiPrimitiveTokenParity.browser.test.ts tests/e2e/contentIdleCss.browser.test.ts tests/e2e/sessionPanelsIncremental.browser.test.ts tests/e2e/optionsIncrementalRender.browser.test.ts --project=chromium-desktop',
      'audit:ui-production-ownership:report':
        'node tools/report-ui-production-ownership.mjs --report',
      'audit:ui-production-ownership:check':
        'node tools/report-ui-production-ownership.mjs --check',
      'audit:content-css-packs:report': 'node tools/report-content-css-packs.mjs --report',
      'audit:content-css-packs:check': 'node tools/report-content-css-packs.mjs --check',
      'audit:design-tokens:check': 'node tools/report-design-token-alignment.mjs --check',
      'audit:active-documents:report': 'node tools/report-active-document-contract.mjs --report',
      'audit:active-documents:check': 'node tools/report-active-document-contract.mjs --check',
      'lint:css':
        'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/ui/**/*.css"'
    })
  }),
  'G01:G02': Object.freeze({
    parentMilestone: 'G01',
    candidateMilestone: 'G02',
    kind: 'g02-yaml-and-supply-chain',
    devDependencies: Object.freeze({ yaml: '2.9.0' }),
    addScripts: Object.freeze({
      'audit:github-actions-supply-chain:report':
        'node tools/report-github-actions-supply-chain.mjs --report',
      'audit:github-actions-supply-chain:check':
        'node tools/report-github-actions-supply-chain.mjs --check'
    })
  }),
  'G02:F01': Object.freeze({
    parentMilestone: 'G02',
    candidateMilestone: 'F01',
    kind: 'f01-package-identical'
  }),
  'F01:F01-mainline': Object.freeze({
    parentMilestone: 'F01',
    candidateMilestone: 'F01-mainline',
    kind: 'f01-mainline-terminal'
  })
});

// These npm-10 rows are sealed from the accepted R01 lock and are unchanged by
// R02/R02B.  G01/G02 may remove/promote them, but may not reinterpret their
// metadata or regenerate a different lock schema.
const FUTURE_EDGE_LOCK_ROWS = deepFreeze({
  'node_modules/focus-trap': {
    version: '7.6.6',
    resolved: 'https://registry.npmjs.org/focus-trap/-/focus-trap-7.6.6.tgz',
    integrity:
      'sha512-v/Z8bvMCajtx4mEXmOo7QEsIzlIOqRXTIwgUfsFOF9gEsespdbD0AkPIka1bSXZ8Y8oZ+2IVDQZePkTfEHZl7Q==',
    license: 'MIT',
    dependencies: { tabbable: '^6.3.0' }
  },
  'node_modules/tabbable': {
    version: '6.3.0',
    resolved: 'https://registry.npmjs.org/tabbable/-/tabbable-6.3.0.tgz',
    integrity:
      'sha512-EIHvdY5bPLuWForiR/AN2Bxngzpuwn1is4asboytXtpTgsArc+WmSJKVLlhdh71u7jFcryDqB2A8lQvj78MkyQ==',
    license: 'MIT'
  },
  'node_modules/yaml': {
    version: '2.9.0',
    resolved: 'https://registry.npmjs.org/yaml/-/yaml-2.9.0.tgz',
    integrity:
      'sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==',
    dev: true,
    license: 'ISC',
    bin: { yaml: 'bin.mjs' },
    engines: { node: '>= 14.6' },
    funding: { url: 'https://github.com/sponsors/eemeli' }
  }
});

export function getAcceptedAuditTransitions() {
  return ACCEPTED_TRANSITIONS;
}

export function getR02ImmutableTransition() {
  return R02_IMMUTABLE_TRANSITION;
}

export function createDependencyProjection(packageJson) {
  const projection = {};
  for (const field of PACKAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(packageJson, field)) {
      projection[field] = canonicalize(packageJson[field]);
    }
  }
  return projection;
}

function projectionDigest(packageJson) {
  return sha256Text(`${JSON.stringify(createDependencyProjection(packageJson))}\n`);
}

export function createPackageStateFromBytes(ref, packageBytes, lockBytes) {
  const packageText = packageBytes.toString('utf8');
  const lockText = lockBytes.toString('utf8');
  const packageJson = JSON.parse(packageText);
  const lockJson = JSON.parse(lockText);
  assertPlainJson(packageJson, { path: `${ref}:package.json` });
  assertPlainJson(lockJson, { path: `${ref}:package-lock.json` });
  assertCanonicalJsonBytes(packageText, packageJson, `${ref}:package.json`);
  assertCanonicalJsonBytes(lockText, lockJson, `${ref}:package-lock.json`);
  assertClosedLockSchema(lockJson, `${ref}:package-lock.json`);
  return {
    ref,
    packageBytes,
    lockBytes,
    packageText,
    lockText,
    packageJson,
    lockJson,
    packageSha256: sha256Buffer(packageBytes),
    lockSha256: sha256Buffer(lockBytes),
    dependencyProjectionSha256: projectionDigest(packageJson)
  };
}

export function assertOfficialLock(lockText) {
  const lock = JSON.parse(lockText);
  if (lock.lockfileVersion !== 3 || !lock.packages || Array.isArray(lock.packages)) {
    throw new Error('Expected npm lockfileVersion 3 with package rows.');
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '' || entry?.link === true) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid package-lock row: ${path}`);
    }
    if (typeof entry.resolved !== 'string' || typeof entry.integrity !== 'string') {
      throw new Error(`Package-lock row lacks resolved/integrity: ${path}`);
    }
    const url = new URL(entry.resolved);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'registry.npmjs.org' ||
      url.port ||
      url.username ||
      url.password ||
      !entry.resolved.startsWith(OFFICIAL_REGISTRY)
    ) {
      throw new Error(`Package-lock row is not from the official registry: ${path}`);
    }
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)) {
      throw new Error(`Package-lock row has unexpected integrity format: ${path}`);
    }
  }
  return lock;
}

const ROOT_LOCK_ROW_FIELDS = Object.freeze(['name', 'version', ...PACKAGE_FIELDS]);

function assertCanonicalJsonBytes(text, parsed, label) {
  if (`${JSON.stringify(parsed, null, 2)}\n` !== text) {
    throw new Error(`${label} is not the exact canonical npm JSON byte schema.`);
  }
}

export function assertClosedLockSchema(lock, label) {
  assertClosedKeys(lock, ['name', 'version', 'lockfileVersion', 'requires', 'packages'], label);
  for (const [path, row] of Object.entries(lock.packages)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`${label} row is not a plain object: ${path}`);
    }
    const allowed = new Set(path === '' ? ROOT_LOCK_ROW_FIELDS : LOCK_ROW_FIELDS);
    for (const field of Object.keys(row)) {
      if (!allowed.has(field))
        throw new Error(`${label} row has unknown metadata: ${path}.${field}`);
    }
  }
}

function canonicalLockRow(row) {
  const result = {};
  for (const field of LOCK_ROW_FIELDS) {
    if (Object.hasOwn(row, field)) result[field] = canonicalize(row[field]);
  }
  return result;
}

function assertRootLockMatchesPackage(packageJson, lockJson) {
  const root = lockJson.packages?.[''];
  if (!root || typeof root !== 'object' || Array.isArray(root))
    throw new Error('Lock root row missing.');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const packageValue = canonicalize(packageJson[field] ?? {});
    const lockValue = canonicalize(root[field] ?? {});
    if (JSON.stringify(packageValue) !== JSON.stringify(lockValue)) {
      throw new Error(`Root package/lock ${field} mismatch.`);
    }
  }
}

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index < 0) return null;
  const tail = lockPath.slice(index + marker.length);
  if (tail.startsWith('@')) return tail.split('/').slice(0, 2).join('/');
  return tail.split('/')[0];
}

function resolveDependencyLockPath(packages, fromPath, dependency) {
  let cursor = fromPath;
  while (true) {
    const prefix = cursor ? `${cursor}/node_modules/${dependency}` : `node_modules/${dependency}`;
    if (Object.hasOwn(packages, prefix)) return prefix;
    const marker = cursor.lastIndexOf('/node_modules/');
    if (marker < 0) break;
    cursor = cursor.slice(0, marker);
  }
  const rootPath = `node_modules/${dependency}`;
  return Object.hasOwn(packages, rootPath) ? rootPath : null;
}

export function lockReachability(lockJson) {
  const packages = lockJson.packages;
  const roots = new Set();
  const root = packages[''] ?? {};
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(root[field] ?? {})) {
      const path = resolveDependencyLockPath(packages, '', name);
      if (!path) throw new Error(`Root lock edge cannot resolve: ${name}`);
      roots.add(path);
    }
  }
  const reachable = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    const row = packages[current];
    if (!row) throw new Error(`Reachability row missing: ${current}`);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(row[field] ?? {})) {
        const target = resolveDependencyLockPath(packages, current, name);
        if (!target && field === 'dependencies')
          throw new Error(`Lock edge cannot resolve: ${current} -> ${name}`);
        if (target) queue.push(target);
      }
    }
  }
  return reachable;
}

export function lockReverseOwners(lockJson, targetPath) {
  const packages = lockJson.packages;
  const owners = [];
  const targetName = packageNameFromLockPath(targetPath);
  const root = packages[''] ?? {};
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies'
  ]) {
    if (Object.hasOwn(root[field] ?? {}, targetName)) owners.push(`:<${field}>`);
  }
  for (const [ownerPath, row] of Object.entries(packages)) {
    if (ownerPath === '') continue;
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      if (!Object.hasOwn(row[field] ?? {}, targetName)) continue;
      if (resolveDependencyLockPath(packages, ownerPath, targetName) === targetPath) {
        owners.push(`${ownerPath}:<${field}>`);
      }
    }
  }
  return owners.sort();
}

export function lockTransitionObject(parentLock, currentLock) {
  const parentRows = parentLock.packages;
  const currentRows = currentLock.packages;
  const added = {};
  const removed = {};
  const changed = {};
  for (const path of [
    ...new Set([...Object.keys(parentRows), ...Object.keys(currentRows)])
  ].sort()) {
    if (!Object.hasOwn(parentRows, path)) added[path] = canonicalLockRow(currentRows[path]);
    else if (!Object.hasOwn(currentRows, path)) removed[path] = canonicalLockRow(parentRows[path]);
    else if (
      JSON.stringify(canonicalize(parentRows[path])) !==
      JSON.stringify(canonicalize(currentRows[path]))
    ) {
      changed[path] = {
        before: canonicalLockRow(parentRows[path]),
        after: canonicalLockRow(currentRows[path])
      };
    }
  }
  return { added, removed, changed };
}

function assertLockContainerStable(parentLock, currentLock) {
  const parentContainer = { ...parentLock };
  const currentContainer = { ...currentLock };
  delete parentContainer.packages;
  delete currentContainer.packages;
  assertJsonEqual(currentContainer, parentContainer, 'package-lock container metadata changed.');
}

function canonicalR02Adjacency(packages, key, row) {
  return Object.fromEntries(
    R02_ADJACENCY_FIELDS.map((field) => [
      field,
      Object.entries(row[field] ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, spec]) => {
          const resolvedKey = resolveDependencyLockPath(packages, key, name);
          if (!resolvedKey) throw new Error(`R02 adjacency cannot resolve ${key} -> ${name}.`);
          return { name, spec, resolvedKey };
        })
    ])
  );
}

export function assertFrozenR02SemanticTransition({
  parentPackageJson,
  currentPackageJson,
  parentLock,
  currentLock
}) {
  const frozen = R02_IMMUTABLE_TRANSITION;
  const packageDelta = frozen.packageTransition.delta;
  if (
    parentPackageJson.scripts?.[packageDelta.script.name] !== packageDelta.script.before ||
    currentPackageJson.scripts?.[packageDelta.script.name] !== packageDelta.script.after
  ) {
    throw new Error('R02 frozen package script transition mismatch.');
  }
  for (const [name, version] of Object.entries(packageDelta.devDependenciesAdded)) {
    if (
      parentPackageJson.devDependencies?.[name] !== undefined ||
      currentPackageJson.devDependencies?.[name] !== version
    ) {
      throw new Error(`R02 frozen package dependency transition mismatch: ${name}.`);
    }
  }

  assertJsonEqual(
    parentLock.packages?.[''],
    frozen.rootLockBefore,
    'R02 frozen root lock preimage mismatch.'
  );
  assertJsonEqual(
    currentLock.packages?.[''],
    frozen.rootLockAfter,
    'R02 frozen root lock postimage mismatch.'
  );

  const parentRows = parentLock.packages;
  const currentRows = currentLock.packages;
  const actualAdded = Object.keys(currentRows)
    .filter((key) => !Object.hasOwn(parentRows, key))
    .sort();
  const actualRemoved = Object.keys(parentRows)
    .filter((key) => !Object.hasOwn(currentRows, key))
    .sort();
  const actualChanged = Object.keys(parentRows)
    .filter(
      (key) =>
        Object.hasOwn(currentRows, key) &&
        JSON.stringify(canonicalize(parentRows[key])) !==
          JSON.stringify(canonicalize(currentRows[key]))
    )
    .sort();
  const closureKeys = new Set(frozen.lockDelta.addedKeys);
  const frozenClosure = new Map(frozen.closureNodes.map((node) => [node.key, node]));
  const referencedTargets = new Set();
  let adjacencyEdges = 0;
  for (const key of frozen.lockDelta.addedKeys) {
    const node = frozenClosure.get(key);
    if (!node) throw new Error(`R02 frozen closure node missing: ${key}.`);
    assertJsonEqual(
      currentRows[key],
      node.lockEntry,
      `R02 frozen closure metadata mismatch: ${key}.`
    );
    const adjacency = canonicalR02Adjacency(currentRows, key, currentRows[key]);
    assertJsonEqual(adjacency, node.adjacency, `R02 frozen adjacency mismatch: ${key}.`);
    for (const edges of Object.values(adjacency)) {
      adjacencyEdges += edges.length;
      for (const edge of edges) {
        if (!closureKeys.has(edge.resolvedKey)) referencedTargets.add(edge.resolvedKey);
      }
    }
  }
  if (adjacencyEdges !== 44) throw new Error('R02 frozen adjacency edge count mismatch.');

  const endpointKeys = frozen.referencedUnchangedEntries.map((entry) => entry.key).sort();
  assertJsonEqual(
    [...referencedTargets].sort(),
    endpointKeys,
    'R02 frozen unchanged endpoint set mismatch.'
  );
  for (const endpoint of frozen.referencedUnchangedEntries) {
    assertJsonEqual(
      parentRows[endpoint.key],
      endpoint.lockEntry,
      `R02 frozen endpoint preimage mismatch: ${endpoint.key}.`
    );
    assertJsonEqual(
      currentRows[endpoint.key],
      endpoint.lockEntry,
      `R02 frozen endpoint postimage mismatch: ${endpoint.key}.`
    );
  }
  for (const promotion of frozen.unchangedPromotions) {
    assertJsonEqual(
      parentRows[promotion.key],
      promotion.lockEntry,
      `R02 frozen promotion preimage mismatch: ${promotion.key}.`
    );
    assertJsonEqual(
      currentRows[promotion.key],
      promotion.lockEntry,
      `R02 frozen promotion postimage mismatch: ${promotion.key}.`
    );
  }
  assertJsonEqual(actualAdded, frozen.lockDelta.addedKeys, 'R02 frozen added lock keys mismatch.');
  assertJsonEqual(
    actualRemoved,
    frozen.lockDelta.removedKeys,
    'R02 frozen removed lock keys mismatch.'
  );
  assertJsonEqual(
    actualChanged,
    frozen.lockDelta.changedKeys,
    'R02 frozen changed lock keys mismatch.'
  );
  for (const key of Object.keys(parentRows)) {
    if (key !== '' && !endpointKeys.includes(key)) {
      assertJsonEqual(
        currentRows[key],
        parentRows[key],
        `R02 existing lock metadata changed: ${key}.`
      );
    }
  }

  const seen = new Set();
  const queue = ['node_modules/dependency-cruiser'];
  while (queue.length > 0) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    const node = frozenClosure.get(key);
    if (!node) throw new Error(`R02 frozen closure traversal escaped: ${key}.`);
    for (const edges of Object.values(node.adjacency)) {
      for (const edge of edges) if (closureKeys.has(edge.resolvedKey)) queue.push(edge.resolvedKey);
    }
  }
  assertJsonEqual(
    [...seen].sort(),
    frozen.lockDelta.addedKeys,
    'R02 frozen dependency-cruiser closure is incomplete.'
  );
  if (
    frozen.counts.addedKeys !== actualAdded.length ||
    frozen.counts.closureNodes !== frozenClosure.size ||
    frozen.counts.referencedUnchangedEntries !== endpointKeys.length ||
    frozen.counts.unchangedExistingNodes !== Object.keys(parentRows).length - 1
  ) {
    throw new Error('R02 frozen transition counts mismatch.');
  }
  return {
    artifactSha256: R02_TRANSITION_ARTIFACT_SHA256,
    internalDigest: frozen.internalDigest,
    adjacencyEdges,
    endpointKeys
  };
}

function replaceExactOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one exact package preimage for ${label}.`);
  }
  return `${text.slice(0, first)}${after}${text.slice(first + before.length)}`;
}

export function assertExactScriptByteTransition(parentState, currentState, transitions) {
  let expected = parentState.packageText;
  for (const [name, [before, after]] of Object.entries(transitions)) {
    expected = replaceExactOnce(
      expected,
      `${JSON.stringify(name)}: ${JSON.stringify(before)}`,
      `${JSON.stringify(name)}: ${JSON.stringify(after)}`,
      name
    );
  }
  if (Buffer.compare(Buffer.from(expected), currentState.packageBytes) !== 0) {
    throw new Error('Package bytes differ outside the frozen value-only transitions.');
  }
}

export function parseTypeRatchet(command) {
  const prefix = ['node', 'scripts/audit-types.mjs', '--format', 'summary'];
  const metricNames = ['any', 'unknown', 'assertions', 'non-null', 'ts-expect-error'];
  const flags = ['', 'src-', 'tests-'].flatMap((scope) =>
    metricNames.map((metric) => `--max-${scope}${metric}`)
  );
  const tokens = command.split(' ');
  if (tokens.join(' ') !== command || tokens.some((token) => token.length === 0)) {
    throw new Error('Type ratchet must use exact single ASCII spaces.');
  }
  const expectedLength = prefix.length + flags.length * 2;
  if (
    tokens.length !== expectedLength ||
    JSON.stringify(tokens.slice(0, prefix.length)) !== JSON.stringify(prefix)
  ) {
    throw new Error('Type ratchet prefix/token count mismatch.');
  }
  const vector = {};
  for (let index = 0; index < flags.length; index += 1) {
    const flagIndex = prefix.length + index * 2;
    if (tokens[flagIndex] !== flags[index]) throw new Error('Type ratchet flag order mismatch.');
    const raw = tokens[flagIndex + 1];
    if (!/^(0|[1-9][0-9]*)$/u.test(raw))
      throw new Error('Type ratchet value is not canonical decimal.');
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw new Error('Type ratchet value is unsafe.');
    vector[flags[index]] = value;
  }
  for (const metric of metricNames) {
    if (
      vector[`--max-${metric}`] !==
      vector[`--max-src-${metric}`] + vector[`--max-tests-${metric}`]
    ) {
      throw new Error(`Type ratchet aggregate mismatch: ${metric}`);
    }
  }
  return vector;
}

function assertR02Transition(parentState, currentState) {
  const transition = ACCEPTED_TRANSITIONS['R02-origin:R02'];
  const parentPackageJson = parentState.packageJson;
  const currentPackageJson = currentState.packageJson;
  const currentLock = assertOfficialLock(currentState.lockText);
  const parentLock = assertOfficialLock(parentState.lockText);
  if (
    parentState.packageSha256 !== R02_IMMUTABLE_TRANSITION.base.packageSha256 ||
    parentState.lockSha256 !== R02_IMMUTABLE_TRANSITION.base.lockSha256 ||
    currentState.packageSha256 !== R02_IMMUTABLE_TRANSITION.packageSha256 ||
    currentState.lockSha256 !== R02_IMMUTABLE_TRANSITION.lockSha256
  )
    throw new Error('R02 package/lock bytes differ from immutable transition v10.');
  assertLockContainerStable(parentLock, currentLock);
  assertRootLockMatchesPackage(currentPackageJson, currentLock);
  const frozenProof = assertFrozenR02SemanticTransition({
    parentPackageJson,
    currentPackageJson,
    parentLock,
    currentLock
  });
  const parentDev = parentPackageJson.devDependencies ?? {};
  const currentDev = currentPackageJson.devDependencies ?? {};
  for (const [name, version] of Object.entries(transition.devDependencies)) {
    if (parentDev[name] !== undefined) {
      throw new Error(`R02 parent already contains direct devDependency ${name}.`);
    }
    if (currentDev[name] !== version) {
      throw new Error(`R02 candidate must promote ${name}@${version}.`);
    }
  }
  if (parentPackageJson.scripts?.[transition.scriptName] !== transition.scriptBefore) {
    throw new Error('R02 parent test:i18n:visual route does not match the frozen preimage.');
  }
  if (currentPackageJson.scripts?.[transition.scriptName] !== transition.scriptAfter) {
    throw new Error('R02 candidate test:i18n:visual route does not match the frozen postimage.');
  }
  const expectedPackage = cloneJson(currentPackageJson);
  for (const name of Object.keys(transition.devDependencies))
    delete expectedPackage.devDependencies[name];
  expectedPackage.scripts[transition.scriptName] = transition.scriptBefore;
  assertJsonEqual(
    expectedPackage,
    parentPackageJson,
    'R02 package transition changed an unauthorized field.'
  );
  let expectedPackageText = replaceExactOnce(
    parentState.packageText,
    `${JSON.stringify(transition.scriptName)}: ${JSON.stringify(transition.scriptBefore)}`,
    `${JSON.stringify(transition.scriptName)}: ${JSON.stringify(transition.scriptAfter)}`,
    transition.scriptName
  );
  expectedPackageText = replaceExactOnce(
    expectedPackageText,
    '    "archiver": "^6.0.2",\n',
    '    "archiver": "^6.0.2",\n    "crc-32": "1.2.2",\n    "dependency-cruiser": "16.10.4",\n',
    'R02 dependency-cruiser/crc-32 rows'
  );
  expectedPackageText = replaceExactOnce(
    expectedPackageText,
    '    "web-ext": "^10.4.0"\n',
    '    "web-ext": "^10.4.0",\n    "yauzl": "3.3.2"\n',
    'R02 yauzl row'
  );
  if (Buffer.compare(Buffer.from(expectedPackageText), currentState.packageBytes) !== 0) {
    throw new Error('R02 package bytes differ from the frozen npm-10 postimage.');
  }
  for (const [name, version] of Object.entries(transition.devDependencies)) {
    const lockPath = `node_modules/${name}`;
    if (currentLock.packages?.[lockPath]?.version !== version) {
      throw new Error(`R02 lock must contain ${lockPath}@${version}.`);
    }
  }
  const delta = lockTransitionObject(parentLock, currentLock);
  const changedPaths = Object.keys(delta.changed);
  if (JSON.stringify(changedPaths) !== JSON.stringify([''])) {
    throw new Error(`R02 lock changed an existing non-root row: ${changedPaths.join(',')}`);
  }
  if (Object.keys(delta.removed).length > 0) throw new Error('R02 lock may not remove rows.');
  const reachable = lockReachability(currentLock);
  const addedPaths = Object.keys(delta.added);
  if (JSON.stringify(addedPaths) !== JSON.stringify(R02_IMMUTABLE_TRANSITION.lockDelta.addedKeys))
    throw new Error('R02 lock closure differs from immutable transition v10.');
  if (addedPaths.length === 0 || !addedPaths.includes('node_modules/dependency-cruiser')) {
    throw new Error('R02 dependency-cruiser lock closure is missing.');
  }
  for (const path of addedPaths) {
    if (!reachable.has(path)) throw new Error(`R02 added unreachable lock row: ${path}`);
  }
  const transitionProof = canonicalize({
    version: 'npm-10.8.2-r02-transition-v1',
    artifactSha256: frozenProof.artifactSha256,
    artifactInternalDigest: frozenProof.internalDigest,
    rootPromotions: transition.devDependencies,
    added: delta.added,
    changed: delta.changed,
    adjacencyEdges: frozenProof.adjacencyEdges,
    unchangedEndpoints: frozenProof.endpointKeys
  });
  return {
    kind: transition.kind,
    version: transitionProof.version,
    digest: sha256Text(`${JSON.stringify(transitionProof)}\n`),
    lockClosure: {
      addedRows: addedPaths.length,
      removedRows: 0,
      changedRows: changedPaths,
      reachableRows: reachable.size
    }
  };
}

function assertR02BTransition(parentState, currentState) {
  if (parentState.lockSha256 !== currentState.lockSha256) {
    throw new Error('R02B transition must not change package-lock.json.');
  }
  if (parentState.dependencyProjectionSha256 !== currentState.dependencyProjectionSha256) {
    throw new Error('R02B transition must not change dependency projection.');
  }
  const transition = ACCEPTED_TRANSITIONS['R02:R02B'];
  const parentPackageJson = parentState.packageJson;
  const currentPackageJson = currentState.packageJson;
  const parentScripts = parentPackageJson.scripts ?? {};
  const currentScripts = currentPackageJson.scripts ?? {};
  for (const [scriptName, [before, after]] of Object.entries(transition.scripts)) {
    if (parentScripts[scriptName] !== before) {
      throw new Error(`R02B parent script preimage mismatch: ${scriptName}`);
    }
    if (currentScripts[scriptName] !== after) {
      throw new Error(`R02B candidate script postimage mismatch: ${scriptName}`);
    }
  }
  const changedScripts = Object.keys({ ...parentScripts, ...currentScripts }).filter(
    (scriptName) => parentScripts[scriptName] !== currentScripts[scriptName]
  );
  const allowed = new Set(Object.keys(transition.scripts));
  const unexpected = changedScripts.filter((scriptName) => !allowed.has(scriptName));
  if (unexpected.length > 0) {
    throw new Error(`R02B transition has unexpected script changes: ${unexpected.join(', ')}`);
  }
  assertExactScriptByteTransition(parentState, currentState, transition.scripts);
  return {
    kind: transition.kind,
    version: 'r02b-nine-script-byte-transition-v1',
    digest: sha256Text(`${JSON.stringify(canonicalize(transition.scripts))}\n`),
    lockClosure: { addedRows: 0, removedRows: 0, changedRows: [], reachableRows: 0 }
  };
}

function assertG01Transition(parentState, currentState) {
  const transition = ACCEPTED_TRANSITIONS['R02B:G01'];
  const expected = cloneJson(parentState.packageJson);
  for (const [name, version] of Object.entries(transition.removeDependencies)) {
    if (expected.dependencies?.[name] !== version)
      throw new Error(`G01 dependency preimage mismatch: ${name}`);
    delete expected.dependencies[name];
  }
  for (const [name, preimage] of Object.entries(transition.deleteScripts)) {
    if (expected.scripts?.[name] !== preimage)
      throw new Error(`G01 script preimage mismatch: ${name}`);
    delete expected.scripts[name];
  }
  for (const name of Object.keys(transition.addScripts)) {
    if (Object.hasOwn(expected.scripts, name))
      throw new Error(`G01 script already exists: ${name}`);
  }
  Object.assign(expected.scripts, transition.addScripts);
  const parentRatchet = parseTypeRatchet(parentState.packageJson.scripts['lint:type-any:ratchet']);
  const currentRatchet = parseTypeRatchet(
    currentState.packageJson.scripts['lint:type-any:ratchet']
  );
  for (const key of Object.keys(parentRatchet)) {
    if (currentRatchet[key] > parentRatchet[key])
      throw new Error(`G01 type ratchet increased: ${key}`);
  }
  expected.scripts['lint:type-any:ratchet'] =
    currentState.packageJson.scripts['lint:type-any:ratchet'];
  assertJsonEqual(
    expected,
    currentState.packageJson,
    'G01 package transition changed an unauthorized field.'
  );
  if (`${JSON.stringify(expected, null, 2)}\n` !== currentState.packageText) {
    throw new Error('G01 package raw bytes/order differ from the sealed postimage.');
  }
  const parentLock = assertOfficialLock(parentState.lockText);
  const currentLock = assertOfficialLock(currentState.lockText);
  if (currentState.lockSha256 !== G01_SYNTHETIC_LOCK_SHA256) {
    throw new Error('G01 lock bytes differ from the dual-root npm-10 synthetic postimage.');
  }
  assertClosedLockSchema(parentLock, 'G01 parent lock');
  assertClosedLockSchema(currentLock, 'G01 candidate lock');
  for (const path of ['node_modules/focus-trap', 'node_modules/tabbable']) {
    assertJsonEqual(
      parentLock.packages?.[path],
      FUTURE_EDGE_LOCK_ROWS[path],
      `G01 frozen parent metadata mismatch: ${path}.`
    );
  }
  const tabbableOwners = lockReverseOwners(parentLock, 'node_modules/tabbable');
  if (
    JSON.stringify(tabbableOwners) !== JSON.stringify(['node_modules/focus-trap:<dependencies>'])
  ) {
    throw new Error(`G01 tabbable has another root/transitive owner: ${tabbableOwners.join(',')}`);
  }
  assertLockContainerStable(parentLock, currentLock);
  assertRootLockMatchesPackage(currentState.packageJson, currentLock);
  const delta = lockTransitionObject(parentLock, currentLock);
  const expectedRemoved = Object.keys(transition.removeLockRows).sort();
  if (JSON.stringify(Object.keys(delta.removed).sort()) !== JSON.stringify(expectedRemoved)) {
    throw new Error('G01 lock removed an unexpected closure.');
  }
  if (
    Object.keys(delta.added).length > 0 ||
    JSON.stringify(Object.keys(delta.changed)) !== JSON.stringify([''])
  ) {
    throw new Error('G01 lock changed rows outside the root/removal closure.');
  }
  for (const [path, version] of Object.entries(transition.removeLockRows)) {
    if (delta.removed[path]?.version !== version)
      throw new Error(`G01 removed row preimage mismatch: ${path}`);
    assertJsonEqual(
      delta.removed[path],
      FUTURE_EDGE_LOCK_ROWS[path],
      `G01 removed row full metadata mismatch: ${path}.`
    );
  }
  const reachable = lockReachability(currentLock);
  if (reachable.has('node_modules/tabbable'))
    throw new Error('G01 tabbable still has an owner and may not be removed.');
  const proof = {
    transition,
    parentRatchet,
    currentRatchet,
    removed: delta.removed,
    tabbableOwners
  };
  return {
    kind: transition.kind,
    version: 'g01-closed-transition-v2',
    digest: sha256Text(`${JSON.stringify(canonicalize(proof))}\n`),
    lockClosure: {
      addedRows: 0,
      removedRows: expectedRemoved.length,
      changedRows: [''],
      reachableRows: reachable.size
    },
    ratchet: { parent: parentRatchet, candidate: currentRatchet }
  };
}

function assertG02Transition(parentState, currentState) {
  const transition = ACCEPTED_TRANSITIONS['G01:G02'];
  const expected = cloneJson(parentState.packageJson);
  for (const [name, version] of Object.entries(transition.devDependencies)) {
    if (expected.devDependencies?.[name] !== undefined)
      throw new Error(`G02 parent already owns ${name}.`);
    expected.devDependencies[name] = version;
  }
  for (const name of Object.keys(transition.addScripts)) {
    if (Object.hasOwn(expected.scripts, name))
      throw new Error(`G02 script already exists: ${name}`);
  }
  Object.assign(expected.scripts, transition.addScripts);
  assertJsonEqual(
    expected,
    currentState.packageJson,
    'G02 package transition changed an unauthorized field.'
  );
  if (`${JSON.stringify(expected, null, 2)}\n` !== currentState.packageText) {
    throw new Error('G02 package raw bytes/order differ from the sealed postimage.');
  }
  const parentLock = assertOfficialLock(parentState.lockText);
  const currentLock = assertOfficialLock(currentState.lockText);
  if (currentState.lockSha256 !== G02_SYNTHETIC_LOCK_SHA256) {
    throw new Error('G02 lock bytes differ from the dual-root npm-10 synthetic postimage.');
  }
  assertClosedLockSchema(parentLock, 'G02 parent lock');
  assertClosedLockSchema(currentLock, 'G02 candidate lock');
  assertJsonEqual(
    parentLock.packages?.['node_modules/yaml'],
    FUTURE_EDGE_LOCK_ROWS['node_modules/yaml'],
    'G02 frozen yaml parent metadata mismatch.'
  );
  assertJsonEqual(
    currentLock.packages?.['node_modules/yaml'],
    FUTURE_EDGE_LOCK_ROWS['node_modules/yaml'],
    'G02 frozen yaml candidate metadata mismatch.'
  );
  assertLockContainerStable(parentLock, currentLock);
  assertRootLockMatchesPackage(currentState.packageJson, currentLock);
  const delta = lockTransitionObject(parentLock, currentLock);
  if (Object.keys(delta.added).length > 0 || Object.keys(delta.removed).length > 0) {
    throw new Error('G02 yaml promotion must use the already reachable lock node.');
  }
  if (JSON.stringify(Object.keys(delta.changed)) !== JSON.stringify([''])) {
    throw new Error('G02 lock may change only its root row.');
  }
  if (currentLock.packages?.['node_modules/yaml']?.version !== '2.9.0') {
    throw new Error('G02 locked yaml version mismatch.');
  }
  const proof = { transition, changed: delta.changed };
  return {
    kind: transition.kind,
    version: 'g02-closed-transition-v2',
    digest: sha256Text(`${JSON.stringify(canonicalize(proof))}\n`),
    lockClosure: {
      addedRows: 0,
      removedRows: 0,
      changedRows: [''],
      reachableRows: lockReachability(currentLock).size
    }
  };
}

export function assertIdenticalPackageTransition(parentState, currentState, kind) {
  if (
    parentState.packageSha256 !== currentState.packageSha256 ||
    parentState.lockSha256 !== currentState.lockSha256 ||
    parentState.dependencyProjectionSha256 !== currentState.dependencyProjectionSha256
  )
    throw new Error(`${kind} requires byte-identical package and lock.`);
  return {
    kind,
    version: `${kind}-v1`,
    digest: sha256Text(`${parentState.packageSha256}:${parentState.lockSha256}\n`),
    lockClosure: { addedRows: 0, removedRows: 0, changedRows: [], reachableRows: 0 }
  };
}

export function validateMilestoneTransition({
  parentManifest,
  parentPackageState,
  currentPackageState,
  milestone
}) {
  const edge = `${parentManifest.milestone}:${milestone}`;
  if (!Object.hasOwn(ACCEPTED_TRANSITIONS, edge))
    throw new Error(`Unsupported audit evidence edge ${edge}.`);
  if (edge === 'R02-origin:R02')
    return assertR02Transition(parentPackageState, currentPackageState);
  if (edge === 'R02:R02B') return assertR02BTransition(parentPackageState, currentPackageState);
  if (edge === 'R02B:G01') return assertG01Transition(parentPackageState, currentPackageState);
  if (edge === 'G01:G02') return assertG02Transition(parentPackageState, currentPackageState);
  if (edge === 'G02:F01')
    return assertIdenticalPackageTransition(
      parentPackageState,
      currentPackageState,
      'f01-package-identical'
    );
  if (edge === 'F01:F01-mainline')
    return assertIdenticalPackageTransition(
      parentPackageState,
      currentPackageState,
      'f01-mainline-terminal'
    );
  throw new Error(`No transition validator for ${edge}.`);
}
