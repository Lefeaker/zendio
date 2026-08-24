import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  AUDIT_REGRESSION_LIMITS,
  assertSnapshotStable,
  parseJsonBytesStrict,
  sha256File,
  snapshotFile
} from './canonical-json.mjs';
import { OFFICIAL_REGISTRY, getR02ImmutableTransition } from './transition-validator.mjs';

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function requiredAuditFlag(flags, name) {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

export function assertClosedRuntimeEnvironment(environment = process.env) {
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (lower === 'node_options') throw new Error(`Forbidden preload environment: ${key}`);
    if (lower.startsWith('npm_config_'))
      throw new Error(`Forbidden npm config environment: ${key}`);
    if (lower.startsWith('git_')) throw new Error(`Forbidden Git environment: ${key}`);
    if (lower === 'husky' || lower.startsWith('husky_'))
      throw new Error(`Forbidden Husky environment: ${key}`);
    if (/(?:^|_)(?:preload|loader)(?:_|$)/u.test(lower))
      throw new Error(`Forbidden loader environment: ${key}`);
  }
}
export const assertNoPreloadOrNpmConfigEnv = assertClosedRuntimeEnvironment;

export function validateAuditLevel(flags) {
  const level = requiredAuditFlag(flags, '--audit-level');
  if (level !== 'low') throw new Error('Only --audit-level low is supported.');
  return level;
}
function resolveSymlinkChain(
  path,
  root,
  currentUid,
  { lstatOperation = lstatSync, readlinkOperation = readlinkSync } = {},
  maximum = 32
) {
  let current = resolve(path);
  const seen = new Set();
  for (let count = 0; count < maximum; count += 1) {
    if (!contained(root, current)) throw new Error('RUNTIME_SYMLINK_ESCAPE');
    const stats = lstatOperation(current);
    if (stats.uid !== currentUid) throw new Error('RUNTIME_SYMLINK_OWNER');
    if (!stats.isSymbolicLink()) return current;
    if (seen.has(current)) throw new Error('RUNTIME_SYMLINK_LOOP');
    seen.add(current);
    const target = readlinkOperation(current);
    current = resolve(dirname(current), target);
  }
  throw new Error('RUNTIME_SYMLINK_LIMIT');
}

function validateProjectRuntimeContract(repositoryRoot, policy, readFileOperation = readFileSync) {
  const nvmBytes = readFileOperation(join(repositoryRoot, '.nvmrc'));
  if (
    !Buffer.isBuffer(nvmBytes) ||
    !nvmBytes.equals(Buffer.from(`${policy.nodeVersion.slice(1)}\n`))
  )
    throw new Error('RUNTIME_NVMRC_MISMATCH');
  const packageBytes = readFileOperation(join(repositoryRoot, 'package.json'));
  const packageJson = parseJsonBytesStrict(packageBytes, { path: 'package.json', maximumDepth: 8 });
  if (
    packageJson?.engines?.node !== policy.nodeEngine ||
    packageJson?.engines?.npm !== policy.npmEngine
  )
    throw new Error('RUNTIME_ENGINE_MISMATCH');
}

export function detectNpmCommand({
  execPath = process.execPath,
  spawnSyncOperation = spawnSync,
  policy = getR02ImmutableTransition().runtime,
  nodeVersion = process.version,
  currentUid = process.getuid(),
  repositoryRoot = process.cwd(),
  environment = process.env,
  lstatOperation = lstatSync,
  readlinkOperation = readlinkSync,
  readFileOperation = readFileSync,
  realpathOperation = realpathSync,
  sha256FileOperation = sha256File,
  snapshotOperation = snapshotFile
} = {}) {
  assertClosedRuntimeEnvironment(environment);
  validateProjectRuntimeContract(repositoryRoot, policy, readFileOperation);
  const nodePath = realpathOperation(execPath);
  const nodeStats = lstatOperation(nodePath);
  if (
    !nodeStats.isFile() ||
    nodeStats.isSymbolicLink() ||
    nodeStats.nlink !== 1 ||
    nodeStats.uid !== currentUid ||
    (nodeStats.mode & 0o111) === 0
  )
    throw new Error('RUNTIME_NODE_IDENTITY');
  const runtimePrefix = resolve(dirname(nodePath), '..');
  const npmLauncher = join(dirname(nodePath), 'npm');
  const cliPath = resolveSymlinkChain(npmLauncher, runtimePrefix, currentUid, {
    lstatOperation,
    readlinkOperation
  });
  const packagePath = resolve(dirname(cliPath), '..', 'package.json');
  if (!contained(runtimePrefix, cliPath) || !contained(runtimePrefix, packagePath))
    throw new Error('RUNTIME_PREFIX_ESCAPE');
  const cliStats = lstatOperation(cliPath);
  const packageStats = lstatOperation(packagePath);
  if (
    !cliStats.isFile() ||
    cliStats.isSymbolicLink() ||
    cliStats.nlink !== 1 ||
    cliStats.uid !== currentUid ||
    !packageStats.isFile() ||
    packageStats.isSymbolicLink() ||
    packageStats.nlink !== 1 ||
    packageStats.uid !== currentUid
  )
    throw new Error('RUNTIME_NPM_IDENTITY');
  if (
    sha256FileOperation(cliPath) !== policy.npmCliSha256 ||
    sha256FileOperation(packagePath) !== policy.npmPackageSha256
  )
    throw new Error('RUNTIME_NPM_DIGEST');
  const snapshots = [
    snapshotOperation(nodePath, 256 * 1024 * 1024),
    snapshotOperation(cliPath),
    snapshotOperation(packagePath)
  ];
  const result = spawnSyncOperation(nodePath, [cliPath, '--version'], {
    encoding: 'utf8',
    timeout: 30000,
    killSignal: 'SIGKILL',
    env: {
      HOME: '/var/empty',
      PATH: `${dirname(nodePath)}:/usr/bin:/bin`,
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC'
    }
  });
  for (const snapshot of snapshots) assertSnapshotStable(snapshot);
  if (
    sha256FileOperation(cliPath) !== policy.npmCliSha256 ||
    sha256FileOperation(packagePath) !== policy.npmPackageSha256
  )
    throw new Error('RUNTIME_NPM_DIGEST');
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('RUNTIME_NPM_VERSION_EXEC');
  const version = result.stdout.trim();
  if (nodeVersion !== policy.nodeVersion || version !== policy.npmVersion)
    throw new Error('RUNTIME_VERSION_MISMATCH');
  return Object.freeze({
    command: npmLauncher,
    nodePath,
    cliPath,
    realpath: cliPath,
    version,
    commandSha256: policy.npmCliSha256,
    packagePath,
    packageSha256: policy.npmPackageSha256,
    runtimePrefix,
    nodeSha256: sha256FileOperation(nodePath, 256 * 1024 * 1024),
    repositoryRoot,
    environment,
    policy,
    snapshots
  });
}

export function revalidateRuntime(info) {
  assertClosedRuntimeEnvironment(info.environment);
  validateProjectRuntimeContract(info.repositoryRoot, info.policy);
  for (const snapshot of info.snapshots) assertSnapshotStable(snapshot);
}

export function buildNpmAuditInvocation({ root, omitDev, userconfig, globalconfig, npmInfo }) {
  const auditArgs = [
    'audit',
    ...(omitDev ? ['--omit=dev'] : []),
    '--audit-level=low',
    '--json',
    `--registry=${OFFICIAL_REGISTRY}`,
    `--userconfig=${userconfig}`,
    `--globalconfig=${globalconfig}`
  ];
  return {
    command: npmInfo?.nodePath ?? process.execPath,
    args: npmInfo ? [npmInfo.cliPath, ...auditArgs] : auditArgs,
    auditArgs,
    cwd: root,
    env: {
      PATH: `${dirname(npmInfo?.nodePath ?? process.execPath)}:/usr/bin:/bin`,
      HOME: dirname(userconfig),
      TMPDIR: dirname(userconfig),
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC'
    }
  };
}

export async function runNpmAudit({
  root,
  omitDev,
  userconfig,
  globalconfig,
  npmInfo,
  limits = AUDIT_REGRESSION_LIMITS,
  spawnOperation = spawn
}) {
  revalidateRuntime(npmInfo);
  const invocation = buildNpmAuditInvocation({ root, omitDev, userconfig, globalconfig, npmInfo });
  return new Promise((resolvePromise, rejectPromise) => {
    const stdout = [],
      stderr = [];
    let stdoutBytes = 0,
      stderrBytes = 0,
      settled = false,
      exited = false,
      closed = false,
      exitCode = null,
      timedOut = false,
      terminateTimer,
      finalDrainTimer;
    const child = spawnOperation(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const finish = () => {
      if (!settled && exited && closed) {
        settled = true;
        clearOwnedTimers();
        try {
          revalidateRuntime(npmInfo);
          if (timedOut) throw new Error('npm audit exceeded its bounded timeout.');
          if (![0, 1].includes(exitCode)) throw new Error(`npm audit exited ${exitCode}`);
          resolvePromise({ exitCode, stdout: Buffer.concat(stdout), args: invocation.auditArgs });
        } catch (error) {
          rejectPromise(error);
        }
      }
    };
    const fail = (error) => {
      if (!settled) {
        settled = true;
        clearOwnedTimers();
        rejectPromise(error);
      }
    };
    const clearOwnedTimers = () => {
      clearTimeout(timer);
      if (terminateTimer) clearTimeout(terminateTimer);
      if (finalDrainTimer) clearTimeout(finalDrainTimer);
    };
    child.stdout.on('data', (chunk) => {
      const bytes = Buffer.from(chunk);
      stdoutBytes += bytes.length;
      if (stdoutBytes > limits.maxReportBytes) {
        child.kill('SIGKILL');
        fail(new Error('npm audit stdout exceeded limit.'));
      } else stdout.push(bytes);
    });
    child.stderr.on('data', (chunk) => {
      const bytes = Buffer.from(chunk);
      stderrBytes += bytes.length;
      if (stderrBytes > limits.stderrLimitBytes) {
        child.kill('SIGKILL');
        fail(new Error('npm audit stderr exceeded limit.'));
      } else stderr.push(bytes);
    });
    child.on('error', fail);
    child.on('exit', (code, signal) => {
      exited = true;
      exitCode = code;
      if (signal) fail(new Error(`npm audit terminated by ${signal}`));
      else finish();
    });
    child.on('close', () => {
      closed = true;
      finish();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      terminateTimer = setTimeout(
        () => child.kill('SIGKILL'),
        Math.max(1, Math.floor(limits.auditTerminateMs / 2))
      );
      terminateTimer.unref?.();
      finalDrainTimer = setTimeout(
        () => fail(new Error('npm audit did not close after timeout termination.')),
        limits.auditTerminateMs
      );
      finalDrainTimer.unref?.();
    }, limits.auditTimeoutMs);
    timer.unref?.();
  });
}
