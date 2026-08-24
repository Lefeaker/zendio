import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIREFOX_LINT_PROVENANCE_FILE = 'firefox-lint-provenance.json';
export const FIREFOX_READABILITY_SOURCE_PATH = 'node_modules/@mozilla/readability/Readability.js';
export const FIREFOX_READABILITY_WARNING_CONTRACT = Object.freeze([
  Object.freeze({
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe assignment to innerHTML',
    source: FIREFOX_READABILITY_SOURCE_PATH,
    line: 1549
  }),
  Object.freeze({
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe assignment to innerHTML',
    source: FIREFOX_READABILITY_SOURCE_PATH,
    line: 1928
  })
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function normalizeRepoPath(repoRoot, targetPath) {
  const normalized = relative(repoRoot, targetPath).split(sep).join('/');
  if (!normalized || normalized.startsWith('../') || normalized === '..') {
    throw new Error(`FIREFOX_LINT_PROVENANCE_SOURCE_PATH_DRIFT: ${normalized || 'root'}`);
  }
  return normalized;
}

async function readHashedFile(path, readFileImpl = readFile) {
  const contents = await readFileImpl(path);
  return { bytes: contents.length, sha256: sha256(contents) };
}

async function resolveGitIdentity(repoRoot, execFileImpl = execFileAsync) {
  const [{ stdout: commit }, { stdout: tree }] = await Promise.all([
    execFileImpl('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repoRoot }),
    execFileImpl('git', ['rev-parse', '--verify', 'HEAD^{tree}'], { cwd: repoRoot })
  ]);
  return { commit: commit.trim(), tree: tree.trim() };
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`FIREFOX_LINT_PROVENANCE_${label}_DRIFT`);
  }
}

function assertWarningShape(warning) {
  if (
    !warning ||
    typeof warning.code !== 'string' ||
    typeof warning.message !== 'string' ||
    !warning.message ||
    typeof warning.file !== 'string' ||
    !warning.file ||
    !Number.isInteger(warning.line) ||
    warning.line < 1 ||
    !Number.isInteger(warning.column) ||
    warning.column < 1
  ) {
    throw new Error('FIREFOX_LINT_PROVENANCE_WARNING_RECORD_DRIFT');
  }
}

function parseProvenance(serialized) {
  try {
    const provenance = JSON.parse(serialized);
    if (
      !provenance ||
      provenance.schema !== 'zendio-firefox-lint-provenance/v1' ||
      !Array.isArray(provenance.chunks) ||
      !provenance.identity
    ) {
      throw new Error('invalid schema');
    }
    return provenance;
  } catch (error) {
    throw new Error(`FIREFOX_LINT_PROVENANCE_FILE_DRIFT: ${error.message}`);
  }
}

export async function writeFirefoxLintProvenance(
  { distDir, buildConfig, repoRoot = REPO_ROOT },
  dependencies = {}
) {
  const {
    execFileImpl = execFileAsync,
    readFileImpl = readFile,
    readdirImpl = readdir,
    writeFileImpl = writeFile
  } = dependencies;
  const chunksDir = join(distDir, 'chunks');
  const chunkNames = (await readdirImpl(chunksDir)).filter((name) => name.endsWith('.js')).sort();
  const chunks = await Promise.all(
    chunkNames.map(async (name) => {
      const file = `chunks/${name}`;
      const sourceMap = `${file}.map`;
      const [chunk, map] = await Promise.all([
        readHashedFile(join(distDir, file), readFileImpl),
        readHashedFile(join(distDir, sourceMap), readFileImpl)
      ]);
      return { file, sourceMap, ...chunk, sourceMapBytes: map.bytes, sourceMapSha256: map.sha256 };
    })
  );
  const [git, packageJson, packageLockJson, readability] = await Promise.all([
    resolveGitIdentity(repoRoot, execFileImpl),
    readHashedFile(join(repoRoot, 'package.json'), readFileImpl),
    readHashedFile(join(repoRoot, 'package-lock.json'), readFileImpl),
    readHashedFile(join(repoRoot, FIREFOX_READABILITY_SOURCE_PATH), readFileImpl)
  ]);
  const provenance = {
    schema: 'zendio-firefox-lint-provenance/v1',
    buildConfigSha256: sha256(canonicalJson(buildConfig)),
    chunks,
    identity: {
      commit: git.commit,
      packageJsonSha256: packageJson.sha256,
      packageLockSha256: packageLockJson.sha256,
      readabilitySourcePath: FIREFOX_READABILITY_SOURCE_PATH,
      readabilitySourceSha256: readability.sha256,
      tree: git.tree
    }
  };
  const outputPath = join(dirname(distDir), FIREFOX_LINT_PROVENANCE_FILE);
  await writeFileImpl(outputPath, canonicalJson(provenance));
  return { outputPath, provenance };
}

export async function assertFirefoxLintProvenance(
  { distDir, warnings, repoRoot = REPO_ROOT },
  dependencies = {}
) {
  const { execFileImpl = execFileAsync, readFileImpl = readFile } = dependencies;
  if (!Array.isArray(warnings)) {
    throw new Error('FIREFOX_LINT_PROVENANCE_WARNING_RECORD_DRIFT');
  }
  if (warnings.length !== FIREFOX_READABILITY_WARNING_CONTRACT.length) {
    throw new Error(
      `FIREFOX_LINT_THIRD_PARTY_WARNING_COUNT_DRIFT: expected=${FIREFOX_READABILITY_WARNING_CONTRACT.length} actual=${warnings.length}`
    );
  }

  const provenancePath = join(dirname(distDir), FIREFOX_LINT_PROVENANCE_FILE);
  const provenance = parseProvenance(await readFileImpl(provenancePath, 'utf8'));
  const { identity } = provenance;
  assertSha256(identity.packageJsonSha256, 'PACKAGE');
  assertSha256(identity.packageLockSha256, 'LOCK');
  assertSha256(identity.readabilitySourceSha256, 'SOURCE');
  const [git, packageJson, packageLockJson, readability] = await Promise.all([
    resolveGitIdentity(repoRoot, execFileImpl),
    readHashedFile(join(repoRoot, 'package.json'), readFileImpl),
    readHashedFile(join(repoRoot, 'package-lock.json'), readFileImpl),
    readHashedFile(join(repoRoot, FIREFOX_READABILITY_SOURCE_PATH), readFileImpl)
  ]);
  if (
    identity.commit !== git.commit ||
    identity.tree !== git.tree ||
    identity.packageJsonSha256 !== packageJson.sha256 ||
    identity.packageLockSha256 !== packageLockJson.sha256 ||
    identity.readabilitySourcePath !== FIREFOX_READABILITY_SOURCE_PATH ||
    identity.readabilitySourceSha256 !== readability.sha256
  ) {
    throw new Error('FIREFOX_LINT_PROVENANCE_IDENTITY_DRIFT');
  }

  const chunks = new Map();
  for (const chunk of provenance.chunks) {
    if (
      !chunk ||
      typeof chunk.file !== 'string' ||
      typeof chunk.sourceMap !== 'string' ||
      chunks.has(chunk.file)
    ) {
      throw new Error('FIREFOX_LINT_PROVENANCE_CHUNK_DRIFT');
    }
    chunks.set(chunk.file, chunk);
  }

  const mappedWarnings = [];
  for (const warning of warnings) {
    assertWarningShape(warning);
    const chunk = chunks.get(warning.file);
    if (!chunk) {
      throw new Error(`FIREFOX_LINT_FIRST_PARTY_OR_UNPINNED_WARNING: ${warning.file}`);
    }
    assertSha256(chunk.sha256, 'CHUNK');
    assertSha256(chunk.sourceMapSha256, 'MAP');
    const [chunkBytes, mapText] = await Promise.all([
      readFileImpl(join(distDir, chunk.file)),
      readFileImpl(join(distDir, chunk.sourceMap), 'utf8')
    ]);
    if (sha256(chunkBytes) !== chunk.sha256 || sha256(mapText) !== chunk.sourceMapSha256) {
      throw new Error('FIREFOX_LINT_PROVENANCE_ARTIFACT_DRIFT');
    }
    const map = new TraceMap(JSON.parse(mapText));
    const original = originalPositionFor(map, {
      line: warning.line,
      column: warning.column - 1
    });
    if (!original.source || !original.line) {
      throw new Error('FIREFOX_LINT_PROVENANCE_MAPPING_DRIFT');
    }
    const source = normalizeRepoPath(
      repoRoot,
      resolve(dirname(join(distDir, chunk.sourceMap)), original.source)
    );
    mappedWarnings.push({
      code: warning.code,
      message: warning.message,
      source,
      line: original.line
    });
  }

  const expected = [...FIREFOX_READABILITY_WARNING_CONTRACT].sort(
    (left, right) => left.line - right.line
  );
  const actual = mappedWarnings.sort((left, right) => left.line - right.line);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `FIREFOX_LINT_THIRD_PARTY_WARNING_PROVENANCE_DRIFT: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`
    );
  }
  return { provenancePath, mappedWarnings: actual };
}
