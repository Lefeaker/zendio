import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareAuditReports } from './audit-report.mjs';
import { readJsonFileBounded, sha256File } from './canonical-json.mjs';
import { EXPECTED_NODE_VERSION } from './transition-validator.mjs';
import { assertClosedRuntimeEnvironment, validateAuditLevel } from './runtime-discovery.mjs';
import { cliEvidenceOperations } from './evidence-chain.mjs';

const {
  ACCEPTED_R01_COMMIT,
  ACCEPTED_R01_TREE,
  CHAIN,
  TERMINAL_MAIN_REF,
  assertEvidenceSnapshotsStable,
  assertIdenticalPackageTransition,
  assertOfficialLock,
  assertParentManifest,
  assertParentRepositoryEvidence,
  assertSingleParentCommit,
  assertTerminalCandidateTopology,
  assertTerminalReanchorTopology,
  assertTerminalSnapshotStable,
  baseManifestFields,
  buildReportRecord,
  captureAuditReports,
  compareAuditReports: compareEvidenceAuditReports,
  createMode700Directory,
  detectNpmCommand,
  ensureAbsent,
  ensureCleanTree,
  ensureEvidenceAnchor,
  ensureRepositoryNpmrcAbsent,
  gitSucceeds,
  parentEvidencePaths,
  parentEvidenceSnapshots,
  publishManifest,
  readHeadPackageState,
  readJsonFileBounded: readEvidenceJsonFileBounded,
  readPackageStateAt,
  refreshAndValidateMain,
  rejectEvidenceAliases,
  resolveRepository,
  runGit,
  snapshotFile,
  validateMilestoneTransition
} = cliEvidenceOperations;

function parseArgs(args) {
  const flags = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    if (flags.has(arg)) throw new Error(`Duplicate argument: ${arg}`);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      flags.set(arg, true);
    } else {
      flags.set(arg, next);
      index += 1;
    }
  }
  return flags;
}

function required(flags, name) {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

function getMode(flags) {
  const modes = [
    '--capture-baseline-pair',
    '--capture-pair',
    '--verify-baseline-context',
    '--reanchor-mainline',
    '--compare-reports'
  ].filter((flag) => flags.has(flag));
  if (modes.length !== 1 || flags.get(modes[0]) !== true) {
    throw new Error('Exactly one valueless supported mode is required.');
  }
  return modes[0].slice(2);
}

const MODE_ARGUMENTS = Object.freeze({
  'capture-baseline-pair': Object.freeze([
    '--capture-baseline-pair',
    '--milestone',
    '--accepted-parent-head',
    '--audit-level',
    '--output-dir',
    '--evidence-manifest'
  ]),
  'capture-pair': Object.freeze([
    '--capture-pair',
    '--milestone',
    '--audit-level',
    '--baseline-manifest',
    '--candidate-production-json',
    '--candidate-all-json',
    '--candidate-manifest',
    '--main-ref'
  ]),
  'verify-baseline-context': Object.freeze(['--verify-baseline-context', '--baseline-manifest']),
  'reanchor-mainline': Object.freeze([
    '--reanchor-mainline',
    '--milestone',
    '--baseline-manifest',
    '--main-ref',
    '--audit-level',
    '--candidate-production-json',
    '--candidate-all-json',
    '--candidate-manifest'
  ]),
  'compare-reports': Object.freeze([
    '--compare-reports',
    '--baseline-report',
    '--baseline-exit',
    '--candidate-report',
    '--candidate-exit'
  ])
});

function validateModeArguments(flags, mode) {
  const allowed = new Set(MODE_ARGUMENTS[mode]);
  for (const key of flags.keys()) {
    if (!allowed.has(key)) throw new Error(`Argument ${key} is not valid for mode ${mode}.`);
  }
  const terminalMode =
    (mode === 'capture-pair' || mode === 'reanchor-mainline') &&
    required(flags, '--milestone') === 'F01-mainline';
  if (!terminalMode) {
    if (flags.has('--main-ref')) throw new Error('--main-ref is terminal-only.');
  }
}

function captureConfiguration(flags, mode) {
  if (mode === 'verify-baseline-context') {
    return { baselineManifestPath: required(flags, '--baseline-manifest') };
  }
  const common = {
    milestone: required(flags, '--milestone'),
    auditLevel: validateAuditLevel(flags)
  };
  if (mode === 'capture-baseline-pair') {
    return {
      ...common,
      acceptedParentHead: required(flags, '--accepted-parent-head'),
      outputDir: required(flags, '--output-dir'),
      evidenceManifest: required(flags, '--evidence-manifest')
    };
  }
  return {
    ...common,
    baselineManifestPath: required(flags, '--baseline-manifest'),
    candidateProductionJson: required(flags, '--candidate-production-json'),
    candidateAllJson: required(flags, '--candidate-all-json'),
    candidateManifestPath: required(flags, '--candidate-manifest'),
    mainRef: flags.get('--main-ref')
  };
}

export function compareReportFiles(flags) {
  const parseExit = (name) => {
    const raw = required(flags, name);
    if (!/^[01]$/u.test(raw)) throw new Error(`${name} must be 0 or 1.`);
    return Number(raw);
  };
  const result = compareAuditReports({
    baselineReport: readJsonFileBounded(required(flags, '--baseline-report')),
    baselineExit: parseExit('--baseline-exit'),
    candidateReport: readJsonFileBounded(required(flags, '--candidate-report')),
    candidateExit: parseExit('--candidate-exit')
  });
  if (!result.ok) throw new Error(`npm audit comparison failed: ${result.failures.join('; ')}`);
  console.log('npm-audit-comparison-ok');
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const flags = parseArgs(argv);
    const mode = getMode(flags);
    validateModeArguments(flags, mode);
    assertClosedRuntimeEnvironment();
    if (process.version !== EXPECTED_NODE_VERSION)
      throw new Error(`Expected Node ${EXPECTED_NODE_VERSION}, got ${process.version}`);
    if (mode === 'capture-baseline-pair') await captureBaseline(captureConfiguration(flags, mode));
    else if (mode === 'capture-pair') await captureCandidate(captureConfiguration(flags, mode));
    else if (mode === 'reanchor-mainline')
      await reanchorMainline(captureConfiguration(flags, mode));
    else if (mode === 'compare-reports') compareReportFiles(flags);
    else verifyBaselineContext(captureConfiguration(flags, mode));
    return 0;
  } catch (error) {
    console.error(`[npm-audit-regression] ${error.message ?? error}`);
    return 1;
  }
}
export async function captureBaseline({
  auditLevel,
  milestone,
  acceptedParentHead,
  outputDir,
  evidenceManifest
}) {
  if (milestone !== 'R02-origin') {
    throw new Error('Baseline capture supports only milestone R02-origin.');
  }
  if (!/^[0-9a-f]{40}$/u.test(acceptedParentHead))
    throw new Error('Accepted parent HEAD must be 40 hex.');
  if (acceptedParentHead !== ACCEPTED_R01_COMMIT) {
    throw new Error('Accepted parent HEAD must equal the sealed accepted R01 commit.');
  }
  if (
    !isAbsolute(outputDir) ||
    resolve(outputDir) !== outputDir ||
    parse(outputDir).base !== 'baseline' ||
    dirname(evidenceManifest) !== outputDir
  ) {
    throw new Error('Baseline evidence manifest must live directly in --output-dir.');
  }
  const repo = resolveRepository();
  ensureCleanTree(repo.root);
  if (runGit(['rev-parse', 'HEAD^'], { cwd: repo.root }) !== acceptedParentHead) {
    throw new Error('R02-origin capture must run from the direct two-path audit-owner commit.');
  }
  assertSingleParentCommit(repo.root, repo.head, acceptedParentHead);
  if (
    runGit(['rev-parse', `${acceptedParentHead}^{tree}`], { cwd: repo.root }) !== ACCEPTED_R01_TREE
  ) {
    throw new Error('Accepted R01 tree does not match the sealed R01 tree.');
  }
  const changed = runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], {
    cwd: repo.root
  })
    .split('\n')
    .filter(Boolean)
    .sort();
  if (JSON.stringify(changed) !== JSON.stringify(R02_ORIGIN_PATHS))
    throw new Error('R02-origin audit-owner commit does not contain the exact portable owner set.');
  const parentPackageState = readPackageStateAt(repo.root, acceptedParentHead);
  const packageState = readHeadPackageState(repo.root);
  if (
    parentPackageState.packageSha256 !== packageState.packageSha256 ||
    parentPackageState.lockSha256 !== packageState.lockSha256 ||
    parentPackageState.dependencyProjectionSha256 !== packageState.dependencyProjectionSha256
  ) {
    throw new Error('R02-origin package/lock/dependency projection must equal accepted R01.');
  }
  assertOfficialLock(packageState.lockText);
  ensureRepositoryNpmrcAbsent(repo.root);
  createMode700Directory(outputDir);
  const anchor = ensureEvidenceAnchor(evidenceManifest);
  const productionPath = join(anchor, 'npm-audit-production.json');
  const allPath = join(anchor, 'npm-audit-all.json');
  ensureAbsent(evidenceManifest);
  const npmInfo = detectNpmCommand();
  const reports = await captureAuditReports({
    root: repo.root,
    productionPath,
    allPath,
    anchor,
    npmInfo
  });
  const reportSnapshots = [snapshotFile(productionPath), snapshotFile(allPath)];
  const manifestBase = baseManifestFields({ repo, packageState, auditLevel, npmInfo, reports });
  const { sha256 } = publishManifest(evidenceManifest, {
    ...manifestBase,
    kind: 'baseline',
    milestone,
    acceptedParentHead,
    reports: {
      production: buildReportRecord(productionPath, reports.productionExit),
      all: buildReportRecord(allPath, reports.allExit)
    }
  });
  const finalEvidence = assertParentManifest(evidenceManifest, repo);
  assertEvidenceSnapshotsStable(parentEvidenceSnapshots(finalEvidence));
  rejectEvidenceAliases(parentEvidencePaths(finalEvidence));
  assertEvidenceSnapshotsStable(reportSnapshots);
  ensureCleanTree(repo.root);
  if (
    runGit(['rev-parse', 'HEAD'], { cwd: repo.root }) !== repo.head ||
    runGit(['rev-parse', 'HEAD^{tree}'], { cwd: repo.root }) !== repo.tree
  )
    throw new Error('HEAD/tree changed during capture.');
  console.log(
    `npm-audit-baseline milestone=${milestone} manifest=${evidenceManifest} sha256=${sha256}`
  );
}

export async function captureCandidate({
  auditLevel,
  milestone,
  baselineManifestPath,
  candidateProductionJson,
  candidateAllJson,
  candidateManifestPath,
  mainRef
}) {
  if (!CHAIN.slice(1).includes(milestone)) throw new Error('Unsupported candidate milestone.');
  if (milestone === 'F01-mainline' && mainRef !== TERMINAL_MAIN_REF) {
    throw new Error('F01-mainline requires the exact remote main ref.');
  }
  const anchor = ensureEvidenceAnchor(candidateManifestPath);
  for (const path of [candidateProductionJson, candidateAllJson, candidateManifestPath]) {
    if (!isAbsolute(path) || resolve(path) !== path || parse(path).base.startsWith('.')) {
      throw new Error('Candidate evidence target must be a canonical absolute visible basename.');
    }
    if (realpathSync(dirname(path)) !== anchor) {
      throw new Error('Candidate reports and manifest must share the same evidence anchor.');
    }
    ensureAbsent(path);
  }
  if (new Set([candidateProductionJson, candidateAllJson, candidateManifestPath]).size !== 3) {
    throw new Error('Candidate evidence paths must be distinct.');
  }
  const repo = resolveRepository();
  const parentResult = assertParentManifest(baselineManifestPath, repo);
  const parentManifest = parentResult.manifest;
  const snapshots = parentEvidenceSnapshots(parentResult);
  rejectEvidenceAliases(parentEvidencePaths(parentResult));
  const expectedParent = CHAIN[CHAIN.indexOf(milestone) - 1];
  if (parentManifest.milestone !== expectedParent) {
    throw new Error(`Closed chain requires ${expectedParent} before ${milestone}.`);
  }
  ensureCleanTree(repo.root);
  ensureRepositoryNpmrcAbsent(repo.root);
  const parentPackageState = assertParentRepositoryEvidence(parentManifest, repo);
  assertEvidenceSnapshotsStable(snapshots);
  const terminalSnapshot = milestone === 'F01-mainline' ? await refreshAndValidateMain(repo) : null;
  if (
    !gitSucceeds(['merge-base', '--is-ancestor', parentManifest.repository.head, 'HEAD'], repo.root)
  ) {
    throw new Error('Candidate HEAD must descend from the parent evidence manifest head.');
  }
  if (milestone === 'F01-mainline') {
    assertTerminalCandidateTopology(repo, parentManifest, terminalSnapshot);
  }
  const currentPackageState = readHeadPackageState(repo.root);
  const transition = validateMilestoneTransition({
    parentManifest,
    parentPackageState,
    currentPackageState,
    milestone
  });
  assertEvidenceSnapshotsStable(snapshots);
  const npmInfo = detectNpmCommand();
  const reports = await captureAuditReports({
    root: repo.root,
    productionPath: candidateProductionJson,
    allPath: candidateAllJson,
    anchor,
    npmInfo,
    afterDurabilityBoundary: () => assertEvidenceSnapshotsStable(snapshots)
  });
  rejectEvidenceAliases([
    ...parentEvidencePaths(parentResult),
    candidateProductionJson,
    candidateAllJson
  ]);
  assertEvidenceSnapshotsStable(snapshots);
  for (const [scope, baselineRecord] of [
    ['production', parentManifest.reports.production],
    ['all', parentManifest.reports.all]
  ]) {
    const candidateReport = scope === 'production' ? reports.productionReport : reports.allReport;
    const candidateExit = scope === 'production' ? reports.productionExit : reports.allExit;
    const baselineReport = readJsonFileBounded(baselineRecord.path);
    const comparison = compareAuditReports({
      baselineReport,
      baselineExit: baselineRecord.exit,
      candidateReport,
      candidateExit
    });
    if (!comparison.ok) {
      throw new Error(`npm audit ${scope} regression: ${comparison.failures.join('; ')}`);
    }
    assertEvidenceSnapshotsStable(snapshots);
  }
  const manifestBase = baseManifestFields({
    repo,
    packageState: currentPackageState,
    auditLevel,
    npmInfo,
    reports
  });
  const { sha256 } = publishManifest(candidateManifestPath, {
    ...manifestBase,
    kind: 'candidate',
    milestone,
    parent: {
      manifestPath: baselineManifestPath,
      manifestSha256: sha256File(baselineManifestPath),
      head: parentManifest.repository.head,
      tree: parentManifest.repository.tree,
      packageSha256: parentManifest.package.sha256,
      dependencyProjectionSha256: parentManifest.package.dependencyProjectionSha256,
      lockSha256: parentManifest.package.lockSha256
    },
    transition,
    reports: {
      production: buildReportRecord(candidateProductionJson, reports.productionExit),
      all: buildReportRecord(candidateAllJson, reports.allExit)
    }
  });
  const finalEvidence = assertParentManifest(candidateManifestPath, repo);
  assertEvidenceSnapshotsStable(parentEvidenceSnapshots(finalEvidence));
  rejectEvidenceAliases(parentEvidencePaths(finalEvidence));
  assertEvidenceSnapshotsStable(snapshots);
  ensureCleanTree(repo.root);
  if (terminalSnapshot) assertTerminalSnapshotStable(repo, terminalSnapshot);
  if (
    runGit(['rev-parse', 'HEAD'], { cwd: repo.root }) !== repo.head ||
    runGit(['rev-parse', 'HEAD^{tree}'], { cwd: repo.root }) !== repo.tree
  )
    throw new Error('HEAD/tree changed during capture.');
  console.log(
    `npm-audit-candidate milestone=${milestone} manifest=${candidateManifestPath} sha256=${sha256}`
  );
}

export function verifyBaselineContext({ baselineManifestPath }) {
  const repo = resolveRepository();
  const parentResult = assertParentManifest(baselineManifestPath, repo);
  const parentManifest = parentResult.manifest;
  const snapshots = parentEvidenceSnapshots(parentResult);
  ensureCleanTree(repo.root);
  const parentState = assertParentRepositoryEvidence(parentManifest, repo);
  if (
    !gitSucceeds(['merge-base', '--is-ancestor', parentManifest.repository.head, 'HEAD'], repo.root)
  ) {
    throw new Error('Baseline context parent is not an ancestor of current HEAD.');
  }
  const currentPackageState = readHeadPackageState(repo.root);
  if (
    currentPackageState.dependencyProjectionSha256 !==
    parentManifest.package.dependencyProjectionSha256
  ) {
    throw new Error('Current dependency projection differs from baseline manifest.');
  }
  if (currentPackageState.lockSha256 !== parentManifest.package.lockSha256) {
    throw new Error('Current package-lock digest differs from baseline manifest.');
  }
  if (parentState.lockSha256 !== parentManifest.package.lockSha256)
    throw new Error('Parent lock evidence drift.');
  assertEvidenceSnapshotsStable(snapshots);
  console.log(`npm-audit-context-ok baseline=${baselineManifestPath}`);
}

function candidateTargets({ production, all, manifest }) {
  const anchor = ensureEvidenceAnchor(manifest);
  for (const path of [production, all, manifest]) {
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(dirname(path)) !== anchor) {
      throw new Error('Candidate evidence targets must be canonical siblings.');
    }
    ensureAbsent(path);
  }
  if (new Set([production, all, manifest]).size !== 3)
    throw new Error('Candidate targets must be distinct.');
  return { production, all, manifest, anchor };
}

function compareCapturedScopes(parentManifest, reports) {
  for (const scope of ['production', 'all']) {
    const baselineRecord = parentManifest.reports[scope];
    const comparison = compareAuditReports({
      baselineReport: readJsonFileBounded(baselineRecord.path),
      baselineExit: baselineRecord.exit,
      candidateReport: scope === 'production' ? reports.productionReport : reports.allReport,
      candidateExit: scope === 'production' ? reports.productionExit : reports.allExit
    });
    if (!comparison.ok)
      throw new Error(`npm audit ${scope} regression: ${comparison.failures.join('; ')}`);
  }
}

export async function reanchorMainline({
  milestone,
  mainRef,
  auditLevel,
  baselineManifestPath,
  candidateProductionJson,
  candidateAllJson,
  candidateManifestPath
}) {
  if (milestone !== 'F01-mainline') throw new Error('Re-anchor is F01-mainline only.');
  if (mainRef !== TERMINAL_MAIN_REF) throw new Error('Re-anchor main ref mismatch.');
  const targets = candidateTargets({
    production: candidateProductionJson,
    all: candidateAllJson,
    manifest: candidateManifestPath
  });
  const repo = resolveRepository();
  const parentResult = assertParentManifest(baselineManifestPath, repo);
  const parentManifest = parentResult.manifest;
  if (parentManifest.kind !== 'candidate' || parentManifest.milestone !== 'F01') {
    throw new Error('Re-anchor requires the accepted F01 candidate leaf.');
  }
  const snapshots = parentEvidenceSnapshots(parentResult);
  ensureCleanTree(repo.root);
  ensureRepositoryNpmrcAbsent(repo.root);
  const parentState = assertParentRepositoryEvidence(parentManifest, repo);
  const terminalSnapshot = await refreshAndValidateMain(repo);
  assertTerminalReanchorTopology(repo, parentManifest, terminalSnapshot);
  const currentState = readHeadPackageState(repo.root);
  const transition = assertIdenticalPackageTransition(
    parentState,
    currentState,
    'f01-mainline-terminal'
  );
  assertEvidenceSnapshotsStable(snapshots);
  const npmInfo = detectNpmCommand();
  const reports = await captureAuditReports({
    root: repo.root,
    productionPath: targets.production,
    allPath: targets.all,
    anchor: targets.anchor,
    npmInfo,
    afterDurabilityBoundary: () => assertEvidenceSnapshotsStable(snapshots)
  });
  rejectEvidenceAliases([...parentEvidencePaths(parentResult), targets.production, targets.all]);
  assertEvidenceSnapshotsStable(snapshots);
  compareCapturedScopes(parentManifest, reports);
  assertEvidenceSnapshotsStable(snapshots);
  const manifestBase = baseManifestFields({
    repo,
    packageState: currentState,
    auditLevel,
    npmInfo,
    reports
  });
  const { sha256 } = publishManifest(targets.manifest, {
    ...manifestBase,
    kind: 'mainline-reanchor',
    milestone: 'F01-mainline',
    parent: {
      manifestPath: baselineManifestPath,
      manifestSha256: sha256File(baselineManifestPath),
      head: parentManifest.repository.head,
      tree: parentManifest.repository.tree,
      packageSha256: parentManifest.package.sha256,
      dependencyProjectionSha256: parentManifest.package.dependencyProjectionSha256,
      lockSha256: parentManifest.package.lockSha256
    },
    transition,
    reanchor: {
      oldHead: parentManifest.repository.head,
      newHead: repo.head,
      oldTree: parentManifest.repository.tree,
      newTree: repo.tree,
      reason: 'normal-pr-history-rewrite'
    },
    reports: {
      production: buildReportRecord(targets.production, reports.productionExit),
      all: buildReportRecord(targets.all, reports.allExit)
    }
  });
  const finalEvidence = assertParentManifest(targets.manifest, repo);
  assertEvidenceSnapshotsStable(parentEvidenceSnapshots(finalEvidence));
  rejectEvidenceAliases(parentEvidencePaths(finalEvidence));
  assertEvidenceSnapshotsStable(snapshots);
  ensureCleanTree(repo.root);
  assertTerminalSnapshotStable(repo, terminalSnapshot);
  console.log(`npm-audit-mainline-reanchor manifest=${targets.manifest} sha256=${sha256}`);
}
