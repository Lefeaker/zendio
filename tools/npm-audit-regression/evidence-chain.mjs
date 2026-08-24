import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_REGRESSION_LIMITS,
  assertClosedKeys,
  assertPlainJson,
  assertSnapshotStable,
  canonicalJsonBytes,
  readCanonicalJsonFileBounded,
  readFileBounded,
  readJsonFileBounded,
  sha256Buffer,
  sha256File,
  snapshotFile
} from './canonical-json.mjs';
import { compareAuditReports, reportExitMatchesCounts } from './audit-report.mjs';
import {
  ACCEPTED_R01_COMMIT,
  ACCEPTED_R01_TREE,
  CHAIN,
  EXPECTED_NODE_VERSION,
  EXPECTED_NPM_VERSION,
  EXPECTED_ORIGIN_URL,
  FIXED_BASE_COMMIT,
  FIXED_BASE_TREE,
  GIT_COMMAND,
  OFFICIAL_REGISTRY,
  TERMINAL_MAIN_REF,
  TOOL_SCHEMA,
  assertIdenticalPackageTransition,
  assertOfficialLock,
  createPackageStateFromBytes,
  createDependencyProjection,
  getR02ImmutableTransition,
  validateMilestoneTransition
} from './transition-validator.mjs';
import { buildNpmAuditInvocation, detectNpmCommand, runNpmAudit } from './runtime-discovery.mjs';
const R02_ORIGIN_PATH_TEXT =
  'tests/unit/tools/npmAuditEvidenceChain.test.ts tests/unit/tools/npmAuditRegression.test.ts tests/unit/tools/npmAuditRegressionCanonicalJson.test.ts tests/unit/tools/npmAuditReport.test.ts tests/unit/tools/npmAuditRuntimeDiscovery.test.ts tests/unit/tools/npmAuditTransitionValidator.test.ts tests/utils/npmAuditRegressionFixtures.ts tools/check-npm-audit-regression.mjs tools/npm-audit-regression/audit-report.mjs tools/npm-audit-regression/canonical-json.mjs tools/npm-audit-regression/cli.mjs tools/npm-audit-regression/evidence-chain.mjs tools/npm-audit-regression/manifests/r02-transition-v10.json tools/npm-audit-regression/runtime-discovery.mjs tools/npm-audit-regression/transition-validator.mjs';
export const R02_ORIGIN_PATHS = Object.freeze(R02_ORIGIN_PATH_TEXT.split(' '));
const RUNTIME_OWNER_PATHS = Object.freeze(
  R02_ORIGIN_PATHS.filter((path) => path.startsWith('tools/'))
);

function runtimeOwnerDigests(repositoryRoot) {
  return Object.fromEntries(
    RUNTIME_OWNER_PATHS.map((path) => [path, sha256File(resolve(repositoryRoot, path))])
  );
}
function closedGitEnvironment() {
  return {
    HOME: '/var/empty',
    PATH: '/usr/bin:/bin',
    LC_ALL: 'C',
    LANG: 'C',
    TZ: 'UTC',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0'
  };
}

function runGitBuffer(args, options = {}) {
  const result = spawnSync(GIT_COMMAND, args, {
    cwd: options.cwd,
    encoding: null,
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
    timeout: options.timeout ?? 30000,
    killSignal: 'SIGKILL',
    env: closedGitEnvironment()
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`bounded git command failed (${args[0]}), exit=${result.status}`);
  }
  return result.stdout;
}

function runGit(args, options = {}) {
  const output = runGitBuffer(args, options).toString('utf8');
  return options.preserveTrailing ? output : output.trim();
}

function gitSucceeds(args, cwd) {
  const result = spawnSync(GIT_COMMAND, args, {
    cwd,
    encoding: null,
    maxBuffer: 64 * 1024,
    timeout: 30000,
    killSignal: 'SIGKILL',
    env: closedGitEnvironment()
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

export function assertRecordedCommitTree(root, head, tree) {
  assertGitOid(head, 'recorded commit');
  assertGitOid(tree, 'recorded tree');
  if (runGit(['rev-parse', `${head}^{commit}`], { cwd: root }) !== head) {
    throw new Error('Recorded repository head is not the exact commit object.');
  }
  if (runGit(['rev-parse', `${head}^{tree}`], { cwd: root }) !== tree) {
    throw new Error('Recorded repository tree differs from the committed tree object.');
  }
}

export function assertSingleParentCommit(root, head, expectedParent) {
  const tokens = runGit(['rev-list', '--parents', '-n', '1', head], { cwd: root }).split(' ');
  if (tokens.length !== 2 || tokens[0] !== head || tokens[1] !== expectedParent) {
    throw new Error('Audit-owner origin must be a non-merge direct child of exact accepted R01.');
  }
}

export function runGitNetwork(
  args,
  { cwd, timeoutMs = 120000, drainMs = 5000, spawnOperation = spawn } = {}
) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let terminationFailure = null;
    let terminateTimer;
    let finalDrainTimer;
    const child = spawnOperation(GIT_COMMAND, args, {
      cwd,
      env: closedGitEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const clearOwnedTimers = () => {
      clearTimeout(timeout);
      if (terminateTimer) clearTimeout(terminateTimer);
      if (finalDrainTimer) clearTimeout(finalDrainTimer);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearOwnedTimers();
      rejectPromise(error);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      const termOk = child.kill('SIGTERM');
      if (!termOk) terminationFailure = 'bounded git fetch SIGTERM request failed.';
      terminateTimer = setTimeout(
        () => {
          if (!settled && !child.kill('SIGKILL')) {
            terminationFailure = 'bounded git fetch SIGKILL request failed.';
          }
        },
        Math.max(1, Math.floor(drainMs / 2))
      );
      terminateTimer.unref();
      finalDrainTimer = setTimeout(() => {
        finishReject(
          new Error(
            terminationFailure ??
              (termOk
                ? 'bounded git fetch did not drain after SIGTERM/SIGKILL.'
                : 'bounded git fetch SIGTERM request failed.')
          )
        );
      }, drainMs);
      finalDrainTimer.unref();
    }, timeoutMs);
    timeout.unref();
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
    });
    child.on('error', finishReject);
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearOwnedTimers();
      if (timedOut)
        return rejectPromise(
          new Error(terminationFailure ?? 'bounded git fetch exceeded its deadline.')
        );
      if (signal) return rejectPromise(new Error(`bounded git fetch terminated by ${signal}.`));
      if (
        stdoutBytes > AUDIT_REGRESSION_LIMITS.stderrLimitBytes ||
        stderrBytes > AUDIT_REGRESSION_LIMITS.stderrLimitBytes
      ) {
        return rejectPromise(new Error('bounded git fetch output exceeded limit.'));
      }
      if (code !== 0)
        return rejectPromise(new Error(`bounded git fetch failed with exit ${code}.`));
      resolvePromise();
    });
  });
}

function resolveRepository() {
  const cwd = realpathSync(process.cwd());
  const root = realpathSync(runGit(['rev-parse', '--show-toplevel'], { cwd }));
  if (cwd !== root) {
    throw new Error(`Must run from canonical repository root: ${root}`);
  }
  const commonGitDir = realpathSync(
    resolve(root, runGit(['rev-parse', '--git-common-dir'], { cwd }))
  );
  const head = runGit(['rev-parse', 'HEAD'], { cwd });
  const tree = runGit(['rev-parse', 'HEAD^{tree}'], { cwd });
  runGit(['rev-parse', `${FIXED_BASE_COMMIT}^{commit}`], { cwd });
  if (runGit(['rev-parse', `${FIXED_BASE_COMMIT}^{tree}`], { cwd }) !== FIXED_BASE_TREE) {
    throw new Error('Fixed product base tree does not match the audit owner constant.');
  }
  if (!gitSucceeds(['merge-base', '--is-ancestor', FIXED_BASE_COMMIT, 'HEAD'], cwd)) {
    throw new Error('Fixed product base is not an ancestor of HEAD.');
  }
  const rootIdentity = lstatSync(root);
  const commonGitIdentity = lstatSync(commonGitDir);
  if (!rootIdentity.isDirectory() || rootIdentity.isSymbolicLink()) {
    throw new Error('Repository root identity is not a real directory.');
  }
  if (!commonGitIdentity.isDirectory() || commonGitIdentity.isSymbolicLink()) {
    throw new Error('Common Git directory identity is not a real directory.');
  }
  return {
    root,
    commonGitDir,
    head,
    tree,
    rootIdentity: identityRecord(rootIdentity),
    commonGitIdentity: identityRecord(commonGitIdentity)
  };
}

export function ensureCleanTree(root) {
  const status = runGit(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root });
  if (status !== '') {
    throw new Error('Worktree/index, including nonignored untracked paths, must be clean.');
  }
}

function ensureRepositoryNpmrcAbsent(root) {
  const path = join(root, '.npmrc');
  try {
    lstatSync(path);
    throw new Error('Repository-root .npmrc must be absent.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function readCommittedBlob(
  root,
  ref,
  path,
  limitBytes = AUDIT_REGRESSION_LIMITS.maxReportBytes
) {
  const object = runGit(['rev-parse', `${ref}:${path}`], { cwd: root });
  if (!/^[0-9a-f]{40}$/u.test(object)) throw new Error(`Invalid committed blob identity: ${path}`);
  const sizeText = runGit(['cat-file', '-s', object], { cwd: root });
  if (!/^(0|[1-9][0-9]*)$/u.test(sizeText)) throw new Error(`Invalid committed blob size: ${path}`);
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size > limitBytes)
    throw new Error(`Committed blob exceeds limit: ${path}`);
  const bytes = runGitBuffer(['cat-file', 'blob', object], {
    cwd: root,
    maxBuffer: limitBytes + 1
  });
  if (bytes.length !== size) throw new Error(`Committed blob size drift: ${path}`);
  return bytes;
}

export function readPackageStateAt(root, ref) {
  return createPackageStateFromBytes(
    ref,
    readCommittedBlob(root, ref, 'package.json'),
    readCommittedBlob(root, ref, 'package-lock.json')
  );
}

export function readHeadPackageState(root) {
  return readPackageStateAt(root, 'HEAD');
}

function readCommittedText(root, ref, path) {
  return readCommittedBlob(root, ref, path).toString('utf8');
}

function ensureAbsent(path) {
  try {
    lstatSync(path);
    throw new Error(`Refusing to overwrite existing evidence path: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function identityRecord(stats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    uid: stats.uid,
    gid: stats.gid,
    mode: stats.mode & 0o777,
    size: stats.size,
    nlink: stats.nlink
  };
}

function pathComponents(path) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  const suffix = absolute.slice(parsed.root.length).split(sep).filter(Boolean);
  const result = [parsed.root];
  let current = parsed.root;
  for (const component of suffix) {
    current = join(current, component);
    result.push(current);
  }
  return result;
}

export function assertDirectoryIdentityPolicy(
  identity,
  { privateDirectory, currentUid = process.getuid(), label = 'directory' }
) {
  if (!identity.directory || identity.symlink) {
    throw new Error(`${label} must be a non-symlink directory.`);
  }
  if (privateDirectory) {
    if (identity.uid !== currentUid || identity.mode !== 0o700) {
      throw new Error(`${label} must be current-UID mode 0700.`);
    }
  } else if (![0, currentUid].includes(identity.uid) || (identity.mode & 0o022) !== 0) {
    throw new Error(`Unsafe ${label} ownership or mode.`);
  }
}

export function validateDirectoryChain(path, { privateFrom = path } = {}) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`Directory path must be canonical absolute syntax: ${path}`);
  }
  const privateRoot = resolve(privateFrom);
  const uid = process.getuid();
  for (const component of pathComponents(path)) {
    const stats = lstatSync(component);
    const canonical = realpathSync(component);
    if (canonical !== component)
      throw new Error(`Directory ancestor has canonical alias: ${component}`);
    const insidePrivate = component === privateRoot || component.startsWith(`${privateRoot}${sep}`);
    assertDirectoryIdentityPolicy(
      {
        directory: stats.isDirectory(),
        symlink: stats.isSymbolicLink(),
        uid: stats.uid,
        mode: stats.mode & 0o777
      },
      { privateDirectory: insidePrivate, currentUid: uid, label: `evidence ancestor ${component}` }
    );
  }
  return realpathSync(path);
}

function ensureEvidenceAnchor(path) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`Evidence path must use canonical absolute syntax: ${path}`);
  }
  const parent = dirname(path);
  return validateDirectoryChain(parent, { privateFrom: parent });
}

function createMode700Directory(path) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`Evidence directory must use canonical absolute syntax: ${path}`);
  }
  validateDirectoryChain(dirname(path), { privateFrom: dirname(path) });
  ensureAbsent(path);
  mkdirSync(path, { mode: 0o700, recursive: false });
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    (stats.mode & 0o777) !== 0o700
  ) {
    throw new Error(`Failed to create mode 0700 evidence directory: ${path}`);
  }
  fsyncDirectory(dirname(path));
  validateDirectoryChain(path, { privateFrom: path });
}

export function writeFileExclusive(path, data, mode = 0o600, operations = {}) {
  const openOperation = operations.open ?? openSync;
  const writeOperation = operations.write ?? writeFileSync;
  const fsyncOperation = operations.fsync ?? fsyncSync;
  const closeOperation = operations.close ?? closeSync;
  ensureAbsent(path);
  const fd = openOperation(path, 'wx+', mode);
  let closeError;
  let record;
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.isSymbolicLink() ||
      opened.uid !== process.getuid() ||
      (opened.mode & 0o777) !== mode ||
      opened.nlink !== 1 ||
      opened.size !== 0
    ) {
      throw new Error(`Exclusive evidence FD identity mismatch before write: ${path}`);
    }
    writeOperation(fd, data);
    fsyncOperation(fd);
    const written = fstatSync(fd);
    const bytes = Buffer.alloc(Buffer.byteLength(data));
    const readBytes = readSync(fd, bytes, 0, bytes.length, 0);
    if (
      written.dev !== opened.dev ||
      written.ino !== opened.ino ||
      written.uid !== opened.uid ||
      written.nlink !== 1 ||
      written.size !== bytes.length ||
      readBytes !== bytes.length ||
      sha256Buffer(bytes) !== sha256Buffer(Buffer.from(data))
    ) {
      throw new Error(`Exclusive evidence FD content/identity mismatch after write: ${path}`);
    }
    const pathname = lstatSync(path);
    if (
      pathname.dev !== written.dev ||
      pathname.ino !== written.ino ||
      pathname.uid !== written.uid ||
      pathname.nlink !== written.nlink ||
      pathname.size !== written.size
    ) {
      throw new Error(`Exclusive evidence pathname replaced while FD was open: ${path}`);
    }
    record = { identity: identityRecord(written), sha256: sha256Buffer(bytes) };
  } finally {
    try {
      closeOperation(fd);
    } catch (error) {
      closeError = error;
    }
  }
  if (closeError) throw closeError;
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    (stats.mode & 0o777) !== mode ||
    stats.nlink !== 1 ||
    stats.size !== Buffer.byteLength(data) ||
    !record ||
    stats.dev !== record.identity.dev ||
    stats.ino !== record.identity.ino ||
    sha256File(path) !== record.sha256
  )
    throw new Error(`Exclusive evidence write identity mismatch: ${path}`);
  return record;
}

export function durablePublishNoReplace(path, data, { beforeLink, operations = {} } = {}) {
  const linkOperation = operations.link ?? linkSync;
  const directorySyncOperation = operations.fsyncDirectory ?? fsyncDirectory;
  const unlinkOperation = operations.unlink ?? unlinkSync;
  const anchor = ensureEvidenceAnchor(path);
  ensureAbsent(path);
  const tempPath = join(anchor, `.${parse(path).base}.tmp-${process.pid}-${Date.now()}`);
  const tempRecord = writeFileExclusive(tempPath, data, 0o600, operations.file);
  let linked = false;
  try {
    if (beforeLink) beforeLink({ tempPath, path });
    const linkSource = lstatSync(tempPath);
    if (
      linkSource.dev !== tempRecord.identity.dev ||
      linkSource.ino !== tempRecord.identity.ino ||
      linkSource.uid !== tempRecord.identity.uid ||
      linkSource.nlink !== 1 ||
      linkSource.size !== tempRecord.identity.size ||
      sha256File(tempPath) !== tempRecord.sha256
    ) {
      throw new Error('Publication temp pathname was replaced before link.');
    }
    linkOperation(tempPath, path);
    linked = true;
    directorySyncOperation(anchor);
    unlinkOperation(tempPath);
    directorySyncOperation(anchor);
  } catch (error) {
    try {
      if (!linked && existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // The failed attempt remains fenced by the original error.
    }
    throw error;
  }
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o777) !== 0o600 ||
    stats.dev !== tempRecord.identity.dev ||
    stats.ino !== tempRecord.identity.ino ||
    stats.size !== tempRecord.identity.size ||
    sha256File(path) !== tempRecord.sha256
  ) {
    throw new Error(`Published evidence identity mismatch: ${path}`);
  }
  return identityRecord(stats);
}

function fsyncDirectory(path) {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeEmptyNpmConfigs(anchor) {
  const userconfig = join(anchor, 'npm-userconfig');
  const globalconfig = join(anchor, 'npm-globalconfig');
  writeFileExclusive(userconfig, '', 0o600);
  writeFileExclusive(globalconfig, '', 0o600);
  return { userconfig, globalconfig };
}

async function captureAuditReports({
  root,
  productionPath,
  allPath,
  anchor,
  npmInfo,
  afterDurabilityBoundary
}) {
  const { userconfig, globalconfig } = writeEmptyNpmConfigs(anchor);
  const configSnapshots = [snapshotFile(userconfig), snapshotFile(globalconfig)];
  const production = await runNpmAudit({ root, omitDev: true, userconfig, globalconfig, npmInfo });
  assertEvidenceSnapshotsStable(configSnapshots);
  const all = await runNpmAudit({ root, omitDev: false, userconfig, globalconfig, npmInfo });
  assertEvidenceSnapshotsStable(configSnapshots);
  durablePublishNoReplace(productionPath, production.stdout);
  afterDurabilityBoundary?.('production-report');
  durablePublishNoReplace(allPath, all.stdout);
  afterDurabilityBoundary?.('all-report');
  const productionReport = readJsonFileBounded(productionPath);
  const allReport = readJsonFileBounded(allPath);
  if (!reportExitMatchesCounts(productionReport, production.exitCode)) {
    throw new Error('Production npm audit exit does not match report counts.');
  }
  if (!reportExitMatchesCounts(allReport, all.exitCode)) {
    throw new Error('All-dependency npm audit exit does not match report counts.');
  }
  assertEvidenceSnapshotsStable(configSnapshots);
  for (const path of [productionPath, allPath])
    buildReportRecord(path, path === productionPath ? production.exitCode : all.exitCode);
  return {
    npmUserconfig: userconfig,
    npmGlobalconfig: globalconfig,
    npmUserconfigSha256: sha256File(userconfig),
    npmGlobalconfigSha256: sha256File(globalconfig),
    productionArgv: production.args,
    allArgv: all.args,
    productionExit: production.exitCode,
    allExit: all.exitCode,
    productionReport,
    allReport
  };
}

function buildReportRecord(path, exitCode) {
  const stats = lstatSync(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new Error('Evidence report identity is not closed.');
  }
  return {
    path: realpathSync(path),
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    sha256: sha256File(path),
    exit: exitCode
  };
}

function assertHex(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
}

function assertGitOid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be a Git SHA-1 object ID.`);
  }
}

function assertIdentityRecord(value, label, { file = false } = {}) {
  assertClosedKeys(value, ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink'], label);
  for (const key of ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0)
      throw new Error(`${label}.${key} invalid.`);
  }
  if (file && (value.mode !== 0o600 || value.nlink !== 1))
    throw new Error(`${label} mode/link invalid.`);
}

function assertReportRecord(record, label) {
  assertClosedKeys(record, ['path', 'dev', 'ino', 'size', 'sha256', 'exit'], label);
  if (!isAbsolute(record.path) || realpathSync(record.path) !== record.path) {
    throw new Error(`${label}.path is not canonical absolute.`);
  }
  const stats = lstatSync(record.path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new Error(`${label} file identity invalid.`);
  }
  for (const key of ['dev', 'ino', 'size']) {
    if (record[key] !== stats[key]) throw new Error(`${label}.${key} drift.`);
  }
  if (![0, 1].includes(record.exit)) throw new Error(`${label}.exit invalid.`);
  assertHex(record.sha256, `${label}.sha256`);
  if (sha256File(record.path) !== record.sha256) throw new Error(`${label} digest mismatch.`);
  const report = readJsonFileBounded(record.path);
  if (!reportExitMatchesCounts(report, record.exit)) {
    throw new Error(`${label}.exit does not match the closed report counts.`);
  }
}

export function assertPortableRuntimeBinding(toolchain) {
  assertClosedKeys(
    toolchain,
    [
      'nodeVersion',
      'nodeCommand',
      'npmCommand',
      'npmCommandRealpath',
      'npmCommandSha256',
      'npmPackagePath',
      'npmPackageSha256',
      'npmVersion',
      'runtimeLayout',
      'registry',
      'userconfigSha256',
      'globalconfigSha256'
    ],
    'manifest.toolchain'
  );
  if (
    toolchain.nodeVersion !== EXPECTED_NODE_VERSION ||
    toolchain.npmVersion !== EXPECTED_NPM_VERSION ||
    toolchain.registry !== OFFICIAL_REGISTRY ||
    toolchain.npmCommandSha256 !== getR02ImmutableTransition().runtime.npmCliSha256 ||
    toolchain.npmPackageSha256 !== getR02ImmutableTransition().runtime.npmPackageSha256
  )
    throw new Error('Baseline toolchain contract mismatch.');
  for (const key of ['nodeCommand', 'npmCommand', 'npmCommandRealpath', 'npmPackagePath']) {
    if (!isAbsolute(toolchain[key]) || resolve(toolchain[key]) !== toolchain[key])
      throw new Error(`Baseline toolchain diagnostic path invalid: ${key}`);
  }
  const layout = toolchain.runtimeLayout;
  assertClosedKeys(
    layout,
    [
      'nodeRelativePath',
      'npmLauncherRelativePath',
      'npmCliRelativePath',
      'npmPackageRelativePath',
      'nodeIdentity',
      'npmCliIdentity',
      'npmPackageIdentity',
      'nodeSha256'
    ],
    'manifest.toolchain.runtimeLayout'
  );
  for (const key of [
    'nodeRelativePath',
    'npmLauncherRelativePath',
    'npmCliRelativePath',
    'npmPackageRelativePath'
  ]) {
    const value = layout[key];
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      isAbsolute(value) ||
      value === '..' ||
      value.startsWith(`..${sep}`)
    )
      throw new Error(`Baseline runtime layout is not portable: ${key}`);
  }
  if (
    layout.npmLauncherRelativePath !== join(dirname(layout.nodeRelativePath), 'npm') ||
    layout.npmPackageRelativePath !==
      join(dirname(dirname(layout.npmCliRelativePath)), 'package.json')
  )
    throw new Error('Baseline runtime layout relation mismatch.');
  for (const key of ['nodeIdentity', 'npmCliIdentity', 'npmPackageIdentity']) {
    assertIdentityRecord(layout[key], `manifest.toolchain.runtimeLayout.${key}`);
    if (layout[key].nlink !== 1) throw new Error(`Baseline runtime identity link mismatch: ${key}`);
  }
  assertHex(layout.nodeSha256, 'manifest.toolchain.runtimeLayout.nodeSha256');
  for (const key of [
    'npmCommandSha256',
    'npmPackageSha256',
    'userconfigSha256',
    'globalconfigSha256'
  ])
    assertHex(toolchain[key], `manifest.toolchain.${key}`);
  const emptyDigest = sha256Buffer(Buffer.alloc(0));
  if (toolchain.userconfigSha256 !== emptyDigest || toolchain.globalconfigSha256 !== emptyDigest)
    throw new Error('Baseline npm configs are not empty.');
}

export function assertSingleManifest(manifestPath, consumerRepo) {
  if (!isAbsolute(manifestPath) || realpathSync(manifestPath) !== manifestPath) {
    throw new Error('Baseline manifest path must be canonical absolute.');
  }
  const manifestAnchor = ensureEvidenceAnchor(manifestPath);
  const manifestStats = lstatSync(manifestPath);
  if (
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink() ||
    manifestStats.uid !== process.getuid() ||
    manifestStats.nlink !== 1 ||
    (manifestStats.mode & 0o777) !== 0o600
  )
    throw new Error('Baseline manifest identity is invalid.');
  const manifest = readCanonicalJsonFileBounded(
    manifestPath,
    AUDIT_REGRESSION_LIMITS.maxManifestBytes,
    AUDIT_REGRESSION_LIMITS.maxManifestDepth
  );
  const commonKeys = [
    'schema',
    'kind',
    'milestone',
    'fixedBase',
    'repository',
    'package',
    'toolchain',
    'audit',
    'reports'
  ];
  const kindSpecific =
    manifest.kind === 'baseline'
      ? ['acceptedParentHead']
      : manifest.kind === 'candidate'
        ? ['parent', 'transition']
        : manifest.kind === 'mainline-reanchor'
          ? ['parent', 'transition', 'reanchor']
          : [];
  assertClosedKeys(manifest, [...commonKeys, ...kindSpecific], 'manifest');
  if (manifest.schema !== TOOL_SCHEMA) {
    throw new Error('Unsupported baseline manifest schema.');
  }
  if (!['baseline', 'candidate', 'mainline-reanchor'].includes(manifest.kind)) {
    throw new Error('Unsupported baseline manifest kind.');
  }
  if (!CHAIN.includes(manifest.milestone)) throw new Error('Unsupported baseline milestone.');
  assertManifestKindMilestone(manifest.kind, manifest.milestone);
  assertClosedKeys(manifest.fixedBase, ['commit', 'tree'], 'manifest.fixedBase');
  if (
    manifest.fixedBase.commit !== FIXED_BASE_COMMIT ||
    manifest.fixedBase.tree !== FIXED_BASE_TREE
  ) {
    throw new Error('Baseline fixed repository identity mismatch.');
  }
  assertClosedKeys(
    manifest.repository,
    ['root', 'rootIdentity', 'commonGitDir', 'commonGitIdentity', 'head', 'tree'],
    'manifest.repository'
  );
  assertGitOid(manifest.repository.head, 'manifest.repository.head');
  assertGitOid(manifest.repository.tree, 'manifest.repository.tree');
  assertIdentityRecord(manifest.repository.rootIdentity, 'manifest.repository.rootIdentity');
  assertIdentityRecord(
    manifest.repository.commonGitIdentity,
    'manifest.repository.commonGitIdentity'
  );
  for (const [path, label] of [
    [manifest.repository.root, 'historical repository root'],
    [manifest.repository.commonGitDir, 'historical common Git directory']
  ]) {
    if (!isAbsolute(path) || resolve(path) !== path) {
      throw new Error(`${label} is not a canonical absolute string.`);
    }
  }
  assertCommonGitDirectoryBinding(manifest.repository, consumerRepo);
  assertRecordedCommitTree(consumerRepo.root, manifest.repository.head, manifest.repository.tree);
  assertClosedKeys(
    manifest.package,
    ['sha256', 'dependencyProjectionSha256', 'lockSha256'],
    'manifest.package'
  );
  for (const key of Object.keys(manifest.package))
    assertHex(manifest.package[key], `manifest.package.${key}`);
  const committedPackageState = readPackageStateAt(consumerRepo.root, manifest.repository.head);
  if (
    committedPackageState.packageSha256 !== manifest.package.sha256 ||
    committedPackageState.dependencyProjectionSha256 !==
      manifest.package.dependencyProjectionSha256 ||
    committedPackageState.lockSha256 !== manifest.package.lockSha256
  ) {
    throw new Error('Manifest package/lock fields differ from its committed Git blobs.');
  }
  assertPortableRuntimeBinding(manifest.toolchain);
  assertClosedKeys(
    manifest.audit,
    ['level', 'toolSourceSha256', 'toolModules', 'cwd', 'productionArgv', 'allArgv'],
    'manifest.audit'
  );
  if (manifest.audit.level !== 'low') throw new Error('Baseline audit level mismatch.');
  assertHex(manifest.audit.toolSourceSha256, 'manifest.audit.toolSourceSha256');
  if (manifest.audit.cwd !== manifest.repository.root) {
    throw new Error('Baseline audit cwd must equal the canonical recorded worktree root.');
  }
  if (
    manifest.audit.toolSourceSha256 !==
    sha256File(fileURLToPath(new URL('../check-npm-audit-regression.mjs', import.meta.url)))
  ) {
    throw new Error('Audit owner source changed after evidence publication.');
  }
  assertClosedKeys(manifest.audit.toolModules, RUNTIME_OWNER_PATHS, 'manifest.audit.toolModules');
  const observedToolModules = runtimeOwnerDigests(manifest.repository.root);
  for (const path of RUNTIME_OWNER_PATHS) {
    assertHex(manifest.audit.toolModules[path], `manifest.audit.toolModules.${path}`);
    if (manifest.audit.toolModules[path] !== observedToolModules[path]) {
      throw new Error(`Audit owner module changed after evidence publication: ${path}`);
    }
  }
  const productionAuditConfig = assertAuditArgv(manifest.audit.productionArgv, true);
  const allAuditConfig = assertAuditArgv(manifest.audit.allArgv, false);
  if (JSON.stringify(productionAuditConfig) !== JSON.stringify(allAuditConfig)) {
    throw new Error('Production/all audit argv do not bind the same private npm configs.');
  }
  assertClosedKeys(manifest.reports, ['production', 'all'], 'manifest.reports');
  for (const report of [manifest.reports?.production, manifest.reports?.all]) {
    if (ensureEvidenceAnchor(report.path) !== manifestAnchor) {
      throw new Error('Manifest reports must share the manifest current-UID mode-0700 anchor.');
    }
    assertReportRecord(report, 'manifest.report');
  }
  if (
    dirname(productionAuditConfig.userconfig) !== manifestAnchor ||
    dirname(productionAuditConfig.globalconfig) !== manifestAnchor ||
    parse(productionAuditConfig.userconfig).base !== 'npm-userconfig' ||
    parse(productionAuditConfig.globalconfig).base !== 'npm-globalconfig'
  ) {
    throw new Error('Audit npm configs are not the fixed siblings inside the evidence anchor.');
  }
  for (const configPath of Object.values(productionAuditConfig)) {
    const stats = lstatSync(configPath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.uid !== process.getuid() ||
      stats.nlink !== 1 ||
      (stats.mode & 0o777) !== 0o600 ||
      stats.size !== 0
    ) {
      throw new Error('Audit npm config live identity/content is invalid.');
    }
  }
  rejectEvidenceAliases([
    manifestPath,
    manifest.reports.production.path,
    manifest.reports.all.path
  ]);
  if (manifest.kind === 'baseline') {
    assertGitOid(manifest.acceptedParentHead, 'manifest.acceptedParentHead');
    if (manifest.milestone !== 'R02-origin') throw new Error('Baseline kind requires R02-origin.');
    if (manifest.acceptedParentHead !== ACCEPTED_R01_COMMIT) {
      throw new Error('R02-origin is not pinned to the exact accepted R01 commit.');
    }
  } else {
    assertClosedKeys(
      manifest.parent,
      [
        'manifestPath',
        'manifestSha256',
        'head',
        'tree',
        'packageSha256',
        'dependencyProjectionSha256',
        'lockSha256'
      ],
      'manifest.parent'
    );
    if (
      !isAbsolute(manifest.parent.manifestPath) ||
      resolve(manifest.parent.manifestPath) !== manifest.parent.manifestPath
    )
      throw new Error('Parent manifest path must be absolute.');
    for (const field of [
      'manifestSha256',
      'packageSha256',
      'dependencyProjectionSha256',
      'lockSha256'
    ]) {
      assertHex(manifest.parent[field], `manifest.parent.${field}`);
    }
    assertGitOid(manifest.parent.head, 'manifest.parent.head');
    assertGitOid(manifest.parent.tree, 'manifest.parent.tree');
    assertTransitionRecord(manifest.transition);
    if (manifest.kind === 'mainline-reanchor') {
      assertClosedKeys(
        manifest.reanchor,
        ['oldHead', 'newHead', 'oldTree', 'newTree', 'reason'],
        'manifest.reanchor'
      );
      for (const field of ['oldHead', 'newHead', 'oldTree', 'newTree']) {
        assertGitOid(manifest.reanchor[field], `manifest.reanchor.${field}`);
      }
      if (
        manifest.reanchor.reason !== 'normal-pr-history-rewrite' ||
        manifest.reanchor.oldHead !== manifest.parent.head ||
        manifest.reanchor.oldTree !== manifest.parent.tree ||
        manifest.reanchor.newHead !== manifest.repository.head ||
        manifest.reanchor.newTree !== manifest.repository.tree
      ) {
        throw new Error(
          'Mainline re-anchor record does not bind its exact parent/current endpoint.'
        );
      }
    }
  }
  return {
    manifest,
    manifestRecord: snapshotFile(manifestPath, AUDIT_REGRESSION_LIMITS.maxManifestBytes)
  };
}

export function assertManifestKindMilestone(kind, milestone) {
  if (kind === 'mainline-reanchor' && milestone !== 'F01-mainline') {
    throw new Error('mainline-reanchor kind is valid only for terminal F01-mainline.');
  }
}

export function assertParentManifest(manifestPath, consumerRepo) {
  const chain = [];
  const seenPaths = new Set();
  const seenIdentities = [];
  let cursor = manifestPath;
  while (true) {
    if (chain.length >= CHAIN.length)
      throw new Error('Evidence parent chain exceeds closed length.');
    const result = assertSingleManifest(cursor, consumerRepo);
    const canonicalPath = realpathSync(cursor);
    const identity = identityRecord(lstatSync(cursor));
    if (
      seenPaths.has(canonicalPath) ||
      seenIdentities.some((prior) => sameObjectIdentity(prior, identity))
    ) {
      throw new Error('Evidence parent chain contains a cycle or identity alias.');
    }
    seenPaths.add(canonicalPath);
    seenIdentities.push(identity);
    chain.push(result);
    if (result.manifest.kind === 'baseline') break;
    const child = result.manifest;
    const expectedParentMilestone = CHAIN[CHAIN.indexOf(child.milestone) - 1];
    const parentPath = child.parent.manifestPath;
    const parentResult = assertSingleManifest(parentPath, consumerRepo);
    const parent = parentResult.manifest;
    if (parent.milestone !== expectedParentMilestone) {
      throw new Error(`Evidence parent chain skipped or reordered before ${child.milestone}.`);
    }
    if (
      sha256File(parentPath, AUDIT_REGRESSION_LIMITS.maxManifestBytes) !==
        child.parent.manifestSha256 ||
      parent.repository.head !== child.parent.head ||
      parent.repository.tree !== child.parent.tree ||
      parent.package.sha256 !== child.parent.packageSha256 ||
      parent.package.dependencyProjectionSha256 !== child.parent.dependencyProjectionSha256 ||
      parent.package.lockSha256 !== child.parent.lockSha256
    ) {
      throw new Error(
        'Evidence parent link does not match the referenced manifest bytes/endpoint.'
      );
    }
    if (
      parent.repository.commonGitDir !== child.repository.commonGitDir ||
      parent.repository.commonGitIdentity.dev !== child.repository.commonGitIdentity.dev ||
      parent.repository.commonGitIdentity.ino !== child.repository.commonGitIdentity.ino ||
      parent.repository.commonGitIdentity.uid !== child.repository.commonGitIdentity.uid
    ) {
      throw new Error('Evidence parent chain crosses a common Git directory identity.');
    }
    if (child.kind === 'mainline-reanchor') {
      if (
        gitSucceeds(
          ['merge-base', '--is-ancestor', parent.repository.head, child.repository.head],
          consumerRepo.root
        )
      ) {
        throw new Error('Re-anchor manifest may not encode an ancestry-preserving transition.');
      }
      if (child.repository.tree !== parent.repository.tree) {
        throw new Error('Re-anchor manifest tree differs from its F01 parent.');
      }
    } else if (
      !gitSucceeds(
        ['merge-base', '--is-ancestor', parent.repository.head, child.repository.head],
        consumerRepo.root
      )
    ) {
      throw new Error('Ordinary evidence parent is not an ancestor of its child.');
    }
    const recomputedTransition = validateMilestoneTransition({
      parentManifest: parent,
      parentPackageState: readPackageStateAt(consumerRepo.root, parent.repository.head),
      currentPackageState: readPackageStateAt(consumerRepo.root, child.repository.head),
      milestone: child.milestone
    });
    assertJsonEqual(
      child.transition,
      recomputedTransition,
      'Recorded transition differs from the sealed transition recomputed from Git blobs.'
    );
    cursor = parentPath;
  }
  assertClosedMilestoneLineage(chain.map((entry) => entry.manifest.milestone));
  assertManifestChainRecords(chain);
  const origin = chain.at(-1).manifest;
  if (origin.milestone !== 'R02-origin' || origin.acceptedParentHead !== ACCEPTED_R01_COMMIT) {
    throw new Error('Evidence chain does not terminate at exact accepted R01.');
  }
  if (
    runGit(['rev-parse', `${origin.repository.head}^`], { cwd: consumerRepo.root }) !==
      ACCEPTED_R01_COMMIT ||
    runGit(['rev-parse', `${ACCEPTED_R01_COMMIT}^{tree}`], { cwd: consumerRepo.root }) !==
      ACCEPTED_R01_TREE
  ) {
    throw new Error('R02-origin repository endpoint is not a direct child of exact accepted R01.');
  }
  assertSingleParentCommit(consumerRepo.root, origin.repository.head, ACCEPTED_R01_COMMIT);
  return { ...chain[0], chain };
}

export function assertClosedMilestoneLineage(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new Error('Evidence milestone lineage must be a nonempty array.');
  }
  const leafIndex = CHAIN.indexOf(milestones[0]);
  const expected = CHAIN.slice(0, leafIndex + 1).reverse();
  if (leafIndex < 0 || JSON.stringify(milestones) !== JSON.stringify(expected)) {
    throw new Error('Evidence chain is incomplete, skipped, repeated or reordered.');
  }
}

export function assertManifestChainRecords(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error('Manifest chain records must be a nonempty array.');
  }
  assertClosedMilestoneLineage(chain.map((entry) => entry.manifest.milestone));
  const paths = new Set();
  const identities = [];
  for (const entry of chain) {
    const record = entry.manifestRecord;
    if (
      paths.has(record.path) ||
      identities.some((prior) => sameObjectIdentity(prior, record.identity))
    ) {
      throw new Error('Manifest chain records contain a path/identity cycle.');
    }
    paths.add(record.path);
    identities.push(record.identity);
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    const child = chain[index].manifest;
    const parentEntry = chain[index + 1];
    const parent = parentEntry.manifest;
    if (
      child.parent.manifestPath !== parentEntry.manifestRecord.path ||
      child.parent.manifestSha256 !== parentEntry.manifestRecord.sha256 ||
      child.parent.head !== parent.repository.head ||
      child.parent.tree !== parent.repository.tree ||
      child.parent.packageSha256 !== parent.package.sha256 ||
      child.parent.dependencyProjectionSha256 !== parent.package.dependencyProjectionSha256 ||
      child.parent.lockSha256 !== parent.package.lockSha256
    ) {
      throw new Error('Manifest chain record has a hash or endpoint parent-link mismatch.');
    }
  }
  const origin = chain.at(-1).manifest;
  if (
    origin.kind !== 'baseline' ||
    origin.milestone !== 'R02-origin' ||
    origin.acceptedParentHead !== ACCEPTED_R01_COMMIT
  ) {
    throw new Error('Manifest chain record does not terminate at exact accepted R01.');
  }
}

function assertAuditArgv(argv, omitDev) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) {
    throw new Error('Audit argv must be a string array.');
  }
  const expectedPrefix = [
    'audit',
    ...(omitDev ? ['--omit=dev'] : []),
    '--audit-level=low',
    '--json'
  ];
  if (JSON.stringify(argv.slice(0, expectedPrefix.length)) !== JSON.stringify(expectedPrefix)) {
    throw new Error('Audit argv prefix mismatch.');
  }
  const suffix = argv.slice(expectedPrefix.length);
  if (
    suffix.length !== 3 ||
    suffix[0] !== `--registry=${OFFICIAL_REGISTRY}` ||
    !suffix[1].startsWith('--userconfig=/') ||
    !suffix[2].startsWith('--globalconfig=/')
  )
    throw new Error('Audit argv config/registry suffix mismatch.');
  const userconfig = suffix[1].slice('--userconfig='.length);
  const globalconfig = suffix[2].slice('--globalconfig='.length);
  if (
    !isAbsolute(userconfig) ||
    !isAbsolute(globalconfig) ||
    resolve(userconfig) !== userconfig ||
    resolve(globalconfig) !== globalconfig
  ) {
    throw new Error('Audit argv config paths must be canonical absolute paths.');
  }
  return { userconfig, globalconfig };
}

export function assertTransitionRecord(transition) {
  if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
    throw new Error('Transition evidence must be an object.');
  }
  const allowed = new Set(['kind', 'version', 'digest', 'lockClosure', 'ratchet']);
  for (const key of Object.keys(transition))
    if (!allowed.has(key)) throw new Error('Transition evidence has extra fields.');
  for (const required of ['kind', 'version', 'digest', 'lockClosure']) {
    if (!Object.hasOwn(transition, required))
      throw new Error(`Transition evidence missing ${required}.`);
  }
  assertBoundedString(transition.kind, 'transition kind');
  assertBoundedString(transition.version, 'transition version');
  assertHex(transition.digest, 'transition digest');
  assertClosedKeys(
    transition.lockClosure,
    ['addedRows', 'removedRows', 'changedRows', 'reachableRows'],
    'transition.lockClosure'
  );
  for (const key of ['addedRows', 'removedRows', 'reachableRows']) {
    if (!Number.isSafeInteger(transition.lockClosure[key]) || transition.lockClosure[key] < 0) {
      throw new Error(`Invalid transition lock closure ${key}.`);
    }
  }
  if (!Array.isArray(transition.lockClosure.changedRows))
    throw new Error('changedRows must be an array.');
  for (const row of transition.lockClosure.changedRows) {
    assertBoundedString(row, 'transition changed lock row', { allowEmpty: true });
  }
  if (Object.hasOwn(transition, 'ratchet')) {
    assertClosedKeys(transition.ratchet, ['parent', 'candidate'], 'transition.ratchet');
    for (const [label, vector] of Object.entries(transition.ratchet)) {
      const keys = Object.keys(parseTypeRatchet(typeRatchetCommandFromVector(vector))).sort();
      if (JSON.stringify(keys) !== JSON.stringify(Object.keys(vector).sort())) {
        throw new Error(`transition.ratchet.${label} has an incomplete vector.`);
      }
    }
  }
}

function typeRatchetCommandFromVector(vector) {
  if (!vector || typeof vector !== 'object' || Array.isArray(vector)) {
    throw new Error('Transition ratchet vector must be an object.');
  }
  const metrics = ['any', 'unknown', 'assertions', 'non-null', 'ts-expect-error'];
  const flags = ['', 'src-', 'tests-'].flatMap((scope) =>
    metrics.map((metric) => `--max-${scope}${metric}`)
  );
  const pairs = [];
  for (const flag of flags) {
    const value = vector[flag];
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Transition ratchet value invalid.');
    pairs.push(flag, String(value));
  }
  return `node scripts/audit-types.mjs --format summary ${pairs.join(' ')}`;
}

function parentEvidenceSnapshots(parentResult) {
  const results = parentResult.chain ?? [parentResult];
  return results.flatMap((result) => [
    result.manifestRecord,
    snapshotFile(result.manifest.reports.production.path),
    snapshotFile(result.manifest.reports.all.path)
  ]);
}

function parentEvidencePaths(parentResult) {
  const results = parentResult.chain ?? [parentResult];
  return results.flatMap((result) => [
    result.manifestRecord.path,
    result.manifest.reports.production.path,
    result.manifest.reports.all.path
  ]);
}

function assertEvidenceSnapshotsStable(snapshots) {
  for (const snapshot of snapshots) {
    assertSnapshotStable(
      snapshot,
      snapshot.path.endsWith('.json') &&
        snapshot.identity.size <= AUDIT_REGRESSION_LIMITS.maxManifestBytes
        ? AUDIT_REGRESSION_LIMITS.maxReportBytes
        : AUDIT_REGRESSION_LIMITS.maxReportBytes
    );
  }
}

function sameObjectIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export function rejectEvidenceAliases(paths) {
  const canonical = new Set();
  const identities = [];
  for (const path of paths) {
    const resolvedPath = realpathSync(path);
    if (canonical.has(resolvedPath)) throw new Error('Evidence paths have a canonical alias.');
    canonical.add(resolvedPath);
    const stats = lstatSync(path);
    const identity = identityRecord(stats);
    if (identities.some((prior) => sameObjectIdentity(prior, identity))) {
      throw new Error('Evidence paths have a hard-link identity alias.');
    }
    identities.push(identity);
  }
}

function assertParentRepositoryEvidence(parentManifest, repo) {
  assertCommonGitDirectoryBinding(parentManifest.repository, repo);
  if (
    runGit(['rev-parse', `${parentManifest.repository.head}^{tree}`], { cwd: repo.root }) !==
    parentManifest.repository.tree
  ) {
    throw new Error('Parent manifest commit/tree binding mismatch.');
  }
  const state = readPackageStateAt(repo.root, parentManifest.repository.head);
  if (
    state.packageSha256 !== parentManifest.package.sha256 ||
    state.lockSha256 !== parentManifest.package.lockSha256 ||
    state.dependencyProjectionSha256 !== parentManifest.package.dependencyProjectionSha256
  )
    throw new Error('Parent committed package evidence mismatch.');
  if (
    parentManifest.audit.toolSourceSha256 !==
    sha256File(fileURLToPath(new URL('../check-npm-audit-regression.mjs', import.meta.url)))
  ) {
    throw new Error('Audit owner source changed after parent capture.');
  }
  return state;
}

export function assertCommonGitDirectoryBinding(recordedRepository, repo) {
  if (recordedRepository.commonGitDir !== repo.commonGitDir) {
    throw new Error('Parent evidence belongs to a different common Git directory.');
  }
  const recorded = recordedRepository.commonGitIdentity;
  const current = repo.commonGitIdentity;
  if (
    recorded.dev !== current.dev ||
    recorded.ino !== current.ino ||
    recorded.uid !== current.uid
  ) {
    throw new Error('Parent common Git directory identity mismatch.');
  }
}

async function refreshAndValidateMain(repo) {
  const beforeHead = runGit(['rev-parse', 'HEAD'], { cwd: repo.root });
  const beforeTree = runGit(['rev-parse', 'HEAD^{tree}'], { cwd: repo.root });
  const urls = runGit(['remote', 'get-url', '--all', 'origin'], { cwd: repo.root })
    .split('\n')
    .filter(Boolean);
  if (JSON.stringify(urls) !== JSON.stringify([EXPECTED_ORIGIN_URL])) {
    throw new Error('Origin fetch URL is not the exact credential-free Zendio URL.');
  }
  await runGitNetwork(
    ['fetch', '--no-tags', '--force', 'origin', 'refs/heads/main:refs/remotes/origin/main'],
    { cwd: repo.root, timeoutMs: 120000, drainMs: 5000 }
  );
  const afterHead = runGit(['rev-parse', 'HEAD'], { cwd: repo.root });
  const afterTree = runGit(['rev-parse', 'HEAD^{tree}'], { cwd: repo.root });
  const mainRef = runGit(['rev-parse', TERMINAL_MAIN_REF], { cwd: repo.root });
  if (afterHead !== beforeHead || afterTree !== beforeTree) {
    throw new Error('HEAD/tree changed while refreshing terminal main.');
  }
  return { head: afterHead, tree: afterTree, mainRef };
}

export function assertTerminalSnapshotStable(repo, snapshot) {
  if (
    runGit(['rev-parse', 'HEAD'], { cwd: repo.root }) !== snapshot.head ||
    runGit(['rev-parse', 'HEAD^{tree}'], { cwd: repo.root }) !== snapshot.tree ||
    runGit(['rev-parse', TERMINAL_MAIN_REF], { cwd: repo.root }) !== snapshot.mainRef
  ) {
    throw new Error('Terminal HEAD/tree/ref changed after owner refresh.');
  }
}

export function assertTerminalCandidateTopology(repo, parentManifest, terminalSnapshot) {
  if (repo.head !== terminalSnapshot.mainRef) {
    throw new Error('Terminal candidate is not the refreshed remote main tip.');
  }
  if (repo.tree !== parentManifest.repository.tree) {
    throw new Error('Terminal candidate tree differs from accepted F01.');
  }
}

export function assertTerminalReanchorTopology(repo, parentManifest, terminalSnapshot) {
  if (repo.head !== terminalSnapshot.mainRef) {
    throw new Error('Re-anchor HEAD is not exact refreshed origin/main.');
  }
  if (
    gitSucceeds(['merge-base', '--is-ancestor', parentManifest.repository.head, 'HEAD'], repo.root)
  ) {
    throw new Error('An ancestry-preserving terminal must use --capture-pair, not re-anchor.');
  }
  if (repo.tree !== parentManifest.repository.tree) {
    throw new Error('Re-anchor complete tree differs from F01.');
  }
}

function baseManifestFields({ repo, packageState, auditLevel, npmInfo, reports }) {
  const toolPath = fileURLToPath(new URL('../check-npm-audit-regression.mjs', import.meta.url));
  return {
    schema: TOOL_SCHEMA,
    fixedBase: {
      commit: FIXED_BASE_COMMIT,
      tree: FIXED_BASE_TREE
    },
    repository: {
      root: repo.root,
      rootIdentity: repo.rootIdentity,
      commonGitDir: repo.commonGitDir,
      commonGitIdentity: repo.commonGitIdentity,
      head: repo.head,
      tree: repo.tree
    },
    package: {
      sha256: packageState.packageSha256,
      dependencyProjectionSha256: packageState.dependencyProjectionSha256,
      lockSha256: packageState.lockSha256
    },
    toolchain: {
      nodeVersion: process.version,
      nodeCommand: process.execPath,
      npmCommand: npmInfo.command,
      npmCommandRealpath: npmInfo.realpath,
      npmCommandSha256: npmInfo.commandSha256,
      npmPackagePath: npmInfo.packagePath,
      npmPackageSha256: npmInfo.packageSha256,
      npmVersion: npmInfo.version,
      runtimeLayout: {
        nodeRelativePath: relative(npmInfo.runtimePrefix, npmInfo.nodePath),
        npmLauncherRelativePath: relative(npmInfo.runtimePrefix, npmInfo.command),
        npmCliRelativePath: relative(npmInfo.runtimePrefix, npmInfo.cliPath),
        npmPackageRelativePath: relative(npmInfo.runtimePrefix, npmInfo.packagePath),
        nodeIdentity: npmInfo.snapshots[0].identity,
        npmCliIdentity: npmInfo.snapshots[1].identity,
        npmPackageIdentity: npmInfo.snapshots[2].identity,
        nodeSha256: npmInfo.nodeSha256
      },
      registry: OFFICIAL_REGISTRY,
      userconfigSha256: reports.npmUserconfigSha256,
      globalconfigSha256: reports.npmGlobalconfigSha256
    },
    audit: {
      level: auditLevel,
      toolSourceSha256: sha256File(toolPath),
      toolModules: runtimeOwnerDigests(repo.root),
      cwd: repo.root,
      productionArgv: reports.productionArgv,
      allArgv: reports.allArgv
    }
  };
}

function publishManifest(path, manifestWithoutSelfHash) {
  const manifest = canonicalize(manifestWithoutSelfHash);
  const bytes = canonicalJsonBytes(manifest);
  if (bytes.length > AUDIT_REGRESSION_LIMITS.maxManifestBytes) {
    throw new Error('Evidence manifest exceeds maximum size.');
  }
  assertPlainJson(manifest, { path }, 0, AUDIT_REGRESSION_LIMITS.maxManifestDepth);
  durablePublishNoReplace(path, bytes);
  return { manifest, sha256: sha256File(path) };
}

export const cliEvidenceOperations = Object.freeze({
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
  compareAuditReports,
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
  readJsonFileBounded,
  readPackageStateAt,
  refreshAndValidateMain,
  rejectEvidenceAliases,
  resolveRepository,
  runGit,
  snapshotFile,
  validateMilestoneTransition
});
