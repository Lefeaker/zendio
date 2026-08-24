import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';

export const TEST_MODULE_PATTERN = /^tests\/(?:[^/]+\/)*[^/]+\.(?:test|spec)\.ts(?![\s\S])/u;

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

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

export function normalizeRepositoryPath(value) {
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

export function readUtf8(value, label) {
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

export function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}
