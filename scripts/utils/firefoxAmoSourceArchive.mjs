import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';
import { zipDirectory } from './archive.mjs';
import { inventoryBoundedZip } from './boundedZipArchive.mjs';

export const FIREFOX_AMO_SOURCE_ARCHIVE_SUFFIX = '-source';

const REQUIRED_ARCHIVE_ENTRIES = Object.freeze([
  'AMO_SOURCE_REVIEW.md',
  '.nvmrc',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'src/background/index.ts',
  'public/manifest.firefox.json',
  'scripts/build.mjs',
  'scripts/package-firefox.mjs',
  'scripts/setup-error-analytics.js',
  'tools/audit-release-archive.mjs',
  'tools/report-release-surface.mjs'
]);

const ROOT_FILE_CANDIDATES = Object.freeze([
  '.nvmrc',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.app.json',
  'tsconfig.preview.json',
  'tsconfig.strict.json',
  'tsconfig.tests.json',
  'vitest.shared.ts',
  'vitest.config.ts',
  'vitest.unit.config.ts'
]);

const ROOT_DIR_CANDIDATES = Object.freeze(['src', 'public', 'scripts', 'tools']);

const SUPPORTING_DOC_CANDIDATES = Object.freeze([
  'docs/firefox-compatibility-guide.md',
  'docs/engineering-entrypoints.md',
  'docs/source-of-truth-index.md'
]);

const FORBIDDEN_TOP_LEVEL_DIRS = new Set([
  '.git',
  '.tmp',
  '.worktrees',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp'
]);

const FORBIDDEN_ARCHIVE_EXTENSIONS = new Set([
  '.crx',
  '.key',
  '.pem',
  '.p12',
  '.pfx',
  '.xpi',
  '.zip'
]);

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const REVIEW_NODE_VERSION = '20.20.2';
const REVIEW_NPM_VERSION = '10.8.2';
const REVIEW_BUILD_POLICY = 'release-build-env-v1';
const REVIEW_REPLAY_RUNNER = String.raw`import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const required = [
  'REVIEW_ROOT',
  'REVIEW_NODE',
  'REVIEW_NPM',
  'REVIEW_PATH',
  'REVIEW_HOME',
  'REVIEW_TMP',
  'REVIEW_USERCONFIG',
  'REVIEW_GLOBALCONFIG',
  'REVIEW_RECEIPT',
  'REVIEW_EXPECTED_XPI',
  'ZENDIO_GA_MEASUREMENT_ID',
  'ZENDIO_GA_TRANSPORT_MODE',
  'ZENDIO_GA_PROXY_ENDPOINT'
];
for (const name of required) {
  if (!Object.hasOwn(process.env, name) || process.env[name].length === 0) {
    throw new Error('REVIEW_CONTRACT_MISSING:' + name);
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = process.env.REVIEW_ROOT;
const outputRoot = process.env.REVIEW_TMP;
const receiptPath = process.env.REVIEW_RECEIPT;
const forbiddenTopLevel = new Set(['.git', '.npmrc', 'node_modules', 'build']);
const inputRows = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll('\\', '/');
    if (!relativePath.includes('/') && forbiddenTopLevel.has(relativePath)) {
      throw new Error('REVIEW_INPUT_FORBIDDEN:' + relativePath);
    }
    const identity = lstatSync(absolute);
    if (identity.isSymbolicLink()) throw new Error('REVIEW_INPUT_SYMLINK:' + relativePath);
    if (identity.isDirectory()) visit(absolute);
    else if (identity.isFile()) {
      const bytes = readFileSync(absolute);
      inputRows.push({ path: relativePath, size: bytes.length, sha256: sha256(bytes) });
    } else throw new Error('REVIEW_INPUT_TYPE:' + relativePath);
  }
}

visit(root);
inputRows.sort((left, right) => left.path.localeCompare(right.path));
const inputRosterSha256 = sha256(Buffer.from(JSON.stringify(inputRows)));
const commonEnvironment = {
  PATH: process.env.REVIEW_PATH,
  HOME: process.env.REVIEW_HOME,
  TMPDIR: outputRoot,
  TMP: outputRoot,
  TEMP: outputRoot,
  CI: '1',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC'
};
const buildEnvironment = {
  ...commonEnvironment,
  ZENDIO_GA_MEASUREMENT_ID: process.env.ZENDIO_GA_MEASUREMENT_ID,
  ZENDIO_GA_TRANSPORT_MODE: process.env.ZENDIO_GA_TRANSPORT_MODE,
  ZENDIO_GA_PROXY_ENDPOINT: process.env.ZENDIO_GA_PROXY_ENDPOINT
};
const dist = join(outputRoot, 'dist-firefox');
const commands = [
  {
    label: 'install',
    executable: process.env.REVIEW_NPM,
    argv: [
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--include=optional',
      '--registry=https://registry.npmjs.org/',
      '--userconfig=' + process.env.REVIEW_USERCONFIG,
      '--globalconfig=' + process.env.REVIEW_GLOBALCONFIG,
      '--node-options='
    ],
    environment: commonEnvironment
  },
  {
    label: 'build',
    executable: process.env.REVIEW_NODE,
    argv: [
      join(root, 'scripts/build.mjs'),
      '--mode=prod',
      '--skip-checks',
      '--firefox',
      '--outdir',
      dist
    ],
    environment: buildEnvironment
  },
  {
    label: 'package',
    executable: process.env.REVIEW_NODE,
    argv: [join(root, 'scripts/package-firefox.mjs'), '--dist-dir', dist],
    environment: buildEnvironment
  }
];
const receipt = {
  schema: 'zendio-amo-source-review-replay/v1',
  policy: 'release-build-env-v1',
  cwd: root,
  input: { rows: inputRows, rosterSha256: inputRosterSha256 },
  commands: []
};

function publishReceipt() {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}

mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
for (const command of commands) {
  const stdin = Buffer.alloc(0);
  const result = spawnSync(command.executable, command.argv, {
    cwd: root,
    env: command.environment,
    input: stdin,
    encoding: null,
    timeout: 600000,
    maxBuffer: 1024 * 1024,
    killSignal: 'SIGTERM',
    windowsHide: true
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
  const stdoutPath = join(outputRoot, command.label + '.stdout');
  const stderrPath = join(outputRoot, command.label + '.stderr');
  writeFileSync(stdoutPath, stdout, { mode: 0o600 });
  writeFileSync(stderrPath, stderr, { mode: 0o600 });
  receipt.commands.push({
    label: command.label,
    executable: command.executable,
    argv: command.argv,
    cwd: root,
    environment: Object.fromEntries(Object.entries(command.environment).sort(([a], [b]) => a.localeCompare(b))),
    stdin: { bytes: stdin.length, sha256: sha256(stdin) },
    result: {
      exitCode: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
      stdout: { path: stdoutPath, bytes: stdout.length, sha256: sha256(stdout) },
      stderr: { path: stderrPath, bytes: stderr.length, sha256: sha256(stderr) }
    }
  });
  publishReceipt();
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (result.error || result.signal || result.status !== 0) {
    process.stderr.write('ZENDIO_REVIEW_RECEIPT=' + receiptPath + '\n');
    process.exit(result.status ?? 1);
  }
}

const outputPath = join(root, process.env.REVIEW_EXPECTED_XPI);
const outputIdentity = lstatSync(outputPath);
if (!outputIdentity.isFile() || outputIdentity.isSymbolicLink()) {
  throw new Error('REVIEW_OUTPUT_NOT_REGULAR');
}
const outputBytes = readFileSync(outputPath);
receipt.output = {
  path: outputPath,
  size: outputBytes.length,
  sha256: sha256(outputBytes)
};
publishReceipt();
process.stdout.write('ZENDIO_REVIEW_RECEIPT=' + receiptPath + '\n');
`;

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function normalizeArchiveEntryPath(entryPath) {
  const slashPath = entryPath.replaceAll('\\', '/');
  if (slashPath.startsWith('/') || /^[a-zA-Z]:/.test(slashPath) || slashPath.includes('\0')) {
    throw new Error(`Unsafe absolute archive entry path: ${entryPath}`);
  }

  const normalized = normalize(slashPath).replaceAll('\\', '/');
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.startsWith('../')) {
    throw new Error(`Unsafe parent-traversal archive entry path: ${entryPath}`);
  }

  return normalized;
}

function isDotEnvPath(entryPath) {
  return entryPath.split('/').some((segment) => segment === '.env' || segment.startsWith('.env.'));
}

function isForbiddenArchiveEntryPath(entryPath) {
  const normalized = normalizeArchiveEntryPath(entryPath);
  const segments = normalized.split('/');
  const fileName = basename(normalized);
  const extension = extname(fileName).toLowerCase();

  return (
    segments.some((segment) => FORBIDDEN_TOP_LEVEL_DIRS.has(segment)) ||
    fileName === '.DS_Store' ||
    isDotEnvPath(normalized) ||
    FORBIDDEN_ARCHIVE_EXTENSIONS.has(extension)
  );
}

async function copySourceFile(sourcePath, targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { force: true });
}

async function copySourceDirectory(sourceRoot, targetRoot, relativeDir) {
  const sourceDir = join(sourceRoot, relativeDir);
  if (!(await pathExists(sourceDir))) {
    return;
  }

  const visit = async (relativePath) => {
    const absolutePath = join(sourceRoot, relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const childRelativePath = join(relativePath, entry.name).replaceAll('\\', '/');
      if (isForbiddenArchiveEntryPath(childRelativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(childRelativePath);
      } else if (entry.isFile()) {
        await copySourceFile(
          absolutePathFor(sourceRoot, childRelativePath),
          join(targetRoot, childRelativePath)
        );
      }
    }
  };

  await visit(relativeDir);
}

function absolutePathFor(root, relativePath) {
  return join(root, ...relativePath.split('/'));
}

async function copyCandidateFiles(sourceRoot, targetRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    if (isForbiddenArchiveEntryPath(relativePath)) {
      continue;
    }

    const sourcePath = absolutePathFor(sourceRoot, relativePath);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    await copySourceFile(sourcePath, absolutePathFor(targetRoot, relativePath));
  }
}

async function readNodeVersion(repoRoot) {
  try {
    return (await readFile(join(repoRoot, '.nvmrc'), 'utf8')).trim();
  } catch {
    return 'see .nvmrc';
  }
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function createAmoSourceReadme({
  artifactBaseName,
  releaseXpiName,
  sourceArchiveName,
  version,
  nodeVersion
}) {
  const reviewScript = [
    'set -euo pipefail',
    'REVIEW_ROOT="$(pwd -P)"',
    "case \"$REVIEW_ROOT\" in *$'\\n'*|*$'\\r'*|*$'\\t'*) printf 'unsafe review root\\n' >&2; exit 64;; esac",
    'test ! -e "$REVIEW_ROOT/.git" && test ! -L "$REVIEW_ROOT/.git"',
    'test ! -e "$REVIEW_ROOT/.npmrc" && test ! -L "$REVIEW_ROOT/.npmrc"',
    'while IFS= read -r REVIEW_ENV_NAME; do',
    '  case "$REVIEW_ENV_NAME" in',
    '    [Nn][Oo][Dd][Ee]_[Oo][Pp][Tt][Ii][Oo][Nn][Ss]|[Nn][Pp][Mm]_[Cc][Oo][Nn][Ff][Ii][Gg]_*) printf \'forbidden inherited environment: %s\\n\' "$REVIEW_ENV_NAME" >&2; exit 64;;',
    '  esac',
    'done < <(compgen -e)',
    ': "${ZENDIO_GA_MEASUREMENT_ID:?set the public measurement id from the submitted extension}"',
    ': "${ZENDIO_GA_TRANSPORT_MODE:?set the public transport mode from the submitted extension}"',
    ': "${ZENDIO_GA_PROXY_ENDPOINT:?set the public proxy endpoint from the submitted extension}"',
    'test "$ZENDIO_GA_TRANSPORT_MODE" = proxy',
    'REVIEW_NODE_CANDIDATE="$(type -P node)"',
    'REVIEW_NPM_CANDIDATE="$(type -P npm)"',
    'test -n "$REVIEW_NODE_CANDIDATE" && test -n "$REVIEW_NPM_CANDIDATE"',
    'REVIEW_NODE="$("$REVIEW_NODE_CANDIDATE" -p \'require("node:fs").realpathSync(process.execPath)\')"',
    'REVIEW_NPM="$("$REVIEW_NODE" -e \'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))\' "$REVIEW_NPM_CANDIDATE")"',
    `test "$("$REVIEW_NODE" --version)" = v${REVIEW_NODE_VERSION}`,
    `test "$("$REVIEW_NPM" --version)" = ${REVIEW_NPM_VERSION}`,
    'REVIEW_NODE_DIR="$(dirname "$REVIEW_NODE")"',
    'REVIEW_NPM_DIR="$(dirname "$REVIEW_NPM")"',
    'REVIEW_PATH=',
    'for REVIEW_PATH_ENTRY in "$REVIEW_NODE_DIR" "$REVIEW_NPM_DIR" /usr/bin /bin; do',
    '  case ":$REVIEW_PATH:" in',
    '    *":$REVIEW_PATH_ENTRY:"*) ;;',
    '    *) REVIEW_PATH="${REVIEW_PATH:+$REVIEW_PATH:}$REVIEW_PATH_ENTRY";;',
    '  esac',
    'done',
    'test "$(env -i PATH="$REVIEW_PATH" node -p \'require("node:fs").realpathSync(process.execPath)\')" = "$REVIEW_NODE"',
    `test "$(env -i PATH="$REVIEW_PATH" "$REVIEW_NPM" --version)" = ${REVIEW_NPM_VERSION}`,
    'REVIEW_ATTEMPT="$(mktemp -d /tmp/zendio-amo-review.XXXXXX)"',
    'chmod 700 "$REVIEW_ATTEMPT"',
    'REVIEW_HOME="$REVIEW_ATTEMPT/home"',
    'REVIEW_TMP="$REVIEW_ATTEMPT/tmp"',
    'mkdir "$REVIEW_HOME" "$REVIEW_TMP"',
    'chmod 700 "$REVIEW_HOME" "$REVIEW_TMP"',
    'REVIEW_USERCONFIG="$REVIEW_ATTEMPT/npm-userconfig"',
    'REVIEW_GLOBALCONFIG="$REVIEW_ATTEMPT/npm-globalconfig"',
    ': > "$REVIEW_USERCONFIG"',
    ': > "$REVIEW_GLOBALCONFIG"',
    'chmod 600 "$REVIEW_USERCONFIG" "$REVIEW_GLOBALCONFIG"',
    'REVIEW_RUNNER="$REVIEW_ATTEMPT/replay.mjs"',
    'REVIEW_RECEIPT="$REVIEW_ATTEMPT/AMO_SOURCE_REVIEW_REPLAY.json"',
    `REVIEW_EXPECTED_XPI=${shellSingleQuote(releaseXpiName)}`,
    'cat > "$REVIEW_RUNNER" <<\'ZENDIO_AMO_REVIEW_RUNNER\'',
    REVIEW_REPLAY_RUNNER,
    'ZENDIO_AMO_REVIEW_RUNNER',
    'chmod 600 "$REVIEW_RUNNER"',
    'env -i PATH="$REVIEW_PATH" HOME="$REVIEW_HOME" TMPDIR="$REVIEW_TMP" TMP="$REVIEW_TMP" TEMP="$REVIEW_TMP" CI=1 LANG=C LC_ALL=C TZ=UTC REVIEW_ROOT="$REVIEW_ROOT" REVIEW_NODE="$REVIEW_NODE" REVIEW_NPM="$REVIEW_NPM" REVIEW_PATH="$REVIEW_PATH" REVIEW_HOME="$REVIEW_HOME" REVIEW_TMP="$REVIEW_TMP" REVIEW_USERCONFIG="$REVIEW_USERCONFIG" REVIEW_GLOBALCONFIG="$REVIEW_GLOBALCONFIG" REVIEW_RECEIPT="$REVIEW_RECEIPT" REVIEW_EXPECTED_XPI="$REVIEW_EXPECTED_XPI" ZENDIO_GA_MEASUREMENT_ID="$ZENDIO_GA_MEASUREMENT_ID" ZENDIO_GA_TRANSPORT_MODE="$ZENDIO_GA_TRANSPORT_MODE" ZENDIO_GA_PROXY_ENDPOINT="$ZENDIO_GA_PROXY_ENDPOINT" "$REVIEW_NODE" "$REVIEW_RUNNER" </dev/null'
  ].join('\n');

  return `# AMO Source Review

This archive contains the human-readable source code and local build instructions for the Firefox AMO submission.

- Extension version: ${version}
- Submitted unsigned XPI: ${releaseXpiName}
- Source archive: ${sourceArchiveName}
- Release artifact base name: ${artifactBaseName}
- Node.js version: ${nodeVersion}
- npm version: ${REVIEW_NPM_VERSION}
- Build environment policy: ${REVIEW_BUILD_POLICY}

## Build Inputs

The production Firefox bundle is generated from the tracked source, public assets, build scripts, and package lockfile in this archive. The release workflow injects only public client analytics configuration into the browser bundle.

Do not provide AMO API credentials, Google Analytics client secrets, or local .env files to reproduce the unsigned package. The required GA values below are public client configuration values already present in the submitted extension package.

This archive deliberately contains no .git directory, ignored controller evidence, CI provenance, store authorization, or signing credentials. A reviewer build is for content comparison only: it is not byte-identical ZIP-container evidence and cannot establish release eligibility, signing, or submission.

## Reproduce the Submitted Unsigned XPI

Export the three public values from the submitted extension, change to the extracted archive root, and run the block below with Bash 3.2 or newer. The replay receipt binds the complete pre-install input roster and SHA-256 digest plus each child command's exact cwd, executable, argv, closed environment, empty stdin, exit code, signal, raw stdout/stderr byte counts and SHA-256 digests.

\`\`\`bash
${reviewScript}
\`\`\`

The final command writes \`${releaseXpiName}\` in the archive root and prints the private replay-receipt path. Compare the generated XPI contents with the submitted AMO package; do not use the reviewer receipt as release evidence.
`;
}

export async function readFirefoxAmoSourceArchiveEntries(archivePath) {
  const inventory = await inventoryBoundedZip(archivePath);
  return inventory.entries.map((entry) => ({
    path: entry.path,
    content: entry.content
  }));
}

function decodeArchiveText(entry, requiredPath) {
  if (!entry || !Buffer.isBuffer(entry.content)) return '';
  try {
    return utf8Decoder.decode(entry.content);
  } catch {
    throw new Error(`ZIP_ENTRY_UTF8_INVALID:${requiredPath}`);
  }
}

export async function auditFirefoxAmoSourceArchive(archivePath, options = {}) {
  const { logger = console } = options;
  const entries = await readFirefoxAmoSourceArchiveEntries(archivePath);
  const entryPaths = new Set(entries.map((entry) => entry.path));
  const findings = [];

  for (const entry of entries) {
    if (isForbiddenArchiveEntryPath(entry.path)) {
      findings.push(`forbidden archive entry: ${entry.path}`);
    }
  }

  for (const requiredEntry of REQUIRED_ARCHIVE_ENTRIES) {
    if (!entryPaths.has(requiredEntry)) {
      findings.push(`missing required source entry: ${requiredEntry}`);
    }
  }

  const readme = decodeArchiveText(
    entries.find((entry) => entry.path === 'AMO_SOURCE_REVIEW.md'),
    'AMO_SOURCE_REVIEW.md'
  );
  const packageJsonText = decodeArchiveText(
    entries.find((entry) => entry.path === 'package.json'),
    'package.json'
  );
  let packageVersion = '';
  try {
    packageVersion = JSON.parse(packageJsonText).version;
  } catch {
    findings.push('package.json is not valid JSON');
  }
  const sourceArchiveName = basename(archivePath);
  const sourceSuffix = `${FIREFOX_AMO_SOURCE_ARCHIVE_SUFFIX}.zip`;
  if (!sourceArchiveName.endsWith(sourceSuffix)) {
    findings.push(`source archive name must end with ${sourceSuffix}`);
  } else if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
    findings.push('package.json version is missing');
  } else {
    const artifactBaseName = sourceArchiveName.slice(0, -sourceSuffix.length);
    const expectedReadme = createAmoSourceReadme({
      artifactBaseName,
      releaseXpiName: `${artifactBaseName}.xpi`,
      sourceArchiveName,
      version: packageVersion,
      nodeVersion: REVIEW_NODE_VERSION
    });
    if (readme !== expectedReadme) findings.push('AMO_SOURCE_REVIEW.md bytes are not canonical');
  }

  if (findings.length > 0) {
    throw new Error(
      [
        `Firefox AMO source archive audit failed for ${archivePath}:`,
        ...findings.map((finding) => `- ${finding}`)
      ].join('\n')
    );
  }

  logger.log(`Audited Firefox AMO source archive: ${archivePath} (${entries.length} entries)`);
  return {
    ok: true,
    archivePath,
    entryCount: entries.length,
    findings: []
  };
}

export async function createFirefoxAmoSourceArchive(options, dependencies = {}) {
  const {
    repoRoot = process.cwd(),
    outputDir = 'build/firefox-source',
    artifactBaseName,
    releaseXpiName = `${artifactBaseName}.xpi`,
    version
  } = options;
  const { logger = console, zipDirectoryImpl = zipDirectory } = dependencies;

  if (!artifactBaseName) {
    throw new Error('artifactBaseName is required to create the Firefox AMO source archive.');
  }
  if (!version) {
    throw new Error('version is required to create the Firefox AMO source archive.');
  }

  const resolvedRepoRoot = resolve(repoRoot);
  const resolvedOutputDir = resolve(resolvedRepoRoot, outputDir);
  const archiveName = `${artifactBaseName}${FIREFOX_AMO_SOURCE_ARCHIVE_SUFFIX}.zip`;
  const archivePath = join(resolvedOutputDir, archiveName);
  const stagingRoot = await mkdtemp(join(tmpdir(), 'aiiinob-firefox-amo-source-'));

  try {
    await mkdir(resolvedOutputDir, { recursive: true });
    await rm(archivePath, { force: true });

    await writeFile(
      join(stagingRoot, 'AMO_SOURCE_REVIEW.md'),
      createAmoSourceReadme({
        artifactBaseName,
        releaseXpiName,
        sourceArchiveName: archiveName,
        version,
        nodeVersion: await readNodeVersion(resolvedRepoRoot)
      }),
      'utf8'
    );

    await copyCandidateFiles(resolvedRepoRoot, stagingRoot, ROOT_FILE_CANDIDATES);
    await copyCandidateFiles(resolvedRepoRoot, stagingRoot, SUPPORTING_DOC_CANDIDATES);
    for (const relativeDir of ROOT_DIR_CANDIDATES) {
      await copySourceDirectory(resolvedRepoRoot, stagingRoot, relativeDir);
    }

    await zipDirectoryImpl(stagingRoot, archivePath, { ignore: ['**/.DS_Store'] });
    const audit = await auditFirefoxAmoSourceArchive(archivePath, { logger });

    logger.log(`✅ Firefox AMO source archive generated: ${archivePath}`);
    return {
      archivePath,
      archiveName,
      entryCount: audit.entryCount
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
