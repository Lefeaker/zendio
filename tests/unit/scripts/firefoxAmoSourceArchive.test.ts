import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditFirefoxAmoSourceArchive,
  createFirefoxAmoSourceArchive,
  readFirefoxAmoSourceArchiveEntries
} from '../../../scripts/utils/firefoxAmoSourceArchive.mjs';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';

const tempRoots: string[] = [];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

type ReplayCommand = JsonObject & {
  label: string;
  argv: JsonValue[];
  environment: JsonObject;
  stdin: JsonObject;
  result: JsonObject;
};

type ReplayReceipt = JsonObject & {
  schema: string;
  policy: string;
  cwd: string;
  input: JsonObject & { rows: JsonValue[]; rosterSha256: string };
  commands: ReplayCommand[];
  output: JsonObject;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReplayCommand(value: unknown): value is ReplayCommand {
  return (
    isRecord(value) &&
    typeof value.label === 'string' &&
    Array.isArray(value.argv) &&
    isRecord(value.environment) &&
    isRecord(value.stdin) &&
    isRecord(value.result)
  );
}

function isReplayReceipt(value: unknown): value is ReplayReceipt {
  return (
    isRecord(value) &&
    typeof value.schema === 'string' &&
    typeof value.policy === 'string' &&
    typeof value.cwd === 'string' &&
    isRecord(value.input) &&
    Array.isArray(value.input.rows) &&
    typeof value.input.rosterSha256 === 'string' &&
    Array.isArray(value.commands) &&
    value.commands.every(isReplayCommand) &&
    isRecord(value.output)
  );
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-firefox-amo-source-test-'));
  tempRoots.push(root);
  return root;
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  contents: string | Buffer = ''
): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function writeZipArchive(
  root: string,
  relativePath: string,
  entries: Record<string, string | Buffer>
): Promise<string> {
  const archivePath = join(root, relativePath);
  await writeFile(
    archivePath,
    buildZipFixture(Object.entries(entries).map(([path, content]) => ({ path, content })))
  );
  return archivePath;
}

async function createSourceFixture(
  root: string,
  options: { localNoise?: boolean } = {}
): Promise<void> {
  const { localNoise = true } = options;
  await writeFixtureFile(root, '.nvmrc', '20.20.2\n');
  await writeFixtureFile(
    root,
    'package.json',
    JSON.stringify({
      name: 'zendio-fixture',
      version: '0.2.1',
      scripts: {
        'analytics:validate:prod:required':
          'node scripts/setup-error-analytics.js --require-env --require-zendio-env --require-proxy-transport'
      }
    })
  );
  await writeFixtureFile(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  await writeFixtureFile(root, 'LICENSE', 'license\n');
  await writeFixtureFile(root, 'THIRD_PARTY_NOTICES.md', 'notices\n');
  await writeFixtureFile(root, 'tsconfig.json', '{}\n');
  await writeFixtureFile(root, 'src/background/index.ts', 'console.info("source");\n');
  await writeFixtureFile(root, 'src/styles/design-tokens.css', ':root { --z: 1; }\n');
  await writeFixtureFile(root, 'public/manifest.firefox.json', '{"manifest_version":3}\n');
  await writeFixtureFile(
    root,
    'scripts/build.mjs',
    `import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const argv = process.argv.slice(2);
if (JSON.stringify(argv.slice(0, 4)) !== JSON.stringify(['--mode=prod', '--skip-checks', '--firefox', '--outdir']) || argv.length !== 5) {
  process.stderr.write('BUILD_ARGV_MISMATCH\\n');
  process.exit(65);
}
await mkdir(argv[4], { recursive: true });
await writeFile(join(argv[4], 'manifest.json'), '{"fixture":true}\\n');
process.stdout.write('fixture build complete\\n');
`
  );
  await writeFixtureFile(
    root,
    'scripts/package-firefox.mjs',
    `import { readFile, writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--dist-dir') {
  process.stderr.write('PACKAGE_ARGV_MISMATCH\\n');
  process.exit(65);
}
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('Zendio-All in Obsidian-v' + packageJson.version + '.xpi', 'fixture xpi\\n');
process.stdout.write('fixture package complete\\n');
`
  );
  await writeFixtureFile(
    root,
    'scripts/setup-error-analytics.js',
    'console.info("analytics validator");\n'
  );
  await writeFixtureFile(
    root,
    'scripts/provision-geckodriver.mjs',
    'export const version = "0.37.1";\n'
  );
  await writeFixtureFile(root, 'scripts/utils/archive.mjs', 'export const archive = true;\n');
  await writeFixtureFile(
    root,
    'scripts/utils/firefoxExactXpiSubmit.mjs',
    'export const client = "direct-v5";\n'
  );
  await writeFixtureFile(
    root,
    'scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs',
    'export const adapter = "webdriver-bidi-v1";\n'
  );
  await writeFixtureFile(root, 'tools/audit-release-archive.mjs', 'console.info("audit");\n');
  await writeFixtureFile(root, 'tools/report-release-surface.mjs', 'console.info("surface");\n');

  await writeFixtureFile(
    root,
    'public/icons/arbitrary-binary.bin',
    Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x41])
  );

  if (localNoise) {
    await writeFixtureFile(root, '.env.production.local', 'WEB_EXT_API_SECRET=secret\n');
    await writeFixtureFile(root, 'build/dist/content/runtime.js', 'generated\n');
    await writeFixtureFile(root, 'node_modules/web-ext/index.js', 'dependency\n');
    await writeFixtureFile(root, '.worktrees/stale/file.txt', 'worktree\n');
    await writeFixtureFile(root, 'Zendio-All in Obsidian-v0.2.1.xpi', 'package\n');
    await writeFixtureFile(root, 'src/.DS_Store', 'finder metadata\n');
  }
}

describe('Firefox AMO source archive', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('creates a reviewer source archive from a repository whitelist and excludes local secrets', async () => {
    const root = await createTempRoot();
    await createSourceFixture(root);

    const result = await createFirefoxAmoSourceArchive(
      {
        repoRoot: root,
        outputDir: join(root, 'build', 'firefox-source'),
        artifactBaseName: 'Zendio-All in Obsidian-v0.2.1',
        releaseXpiName: 'Zendio-All in Obsidian-v0.2.1.xpi',
        version: '0.2.1'
      },
      { logger: { log: vi.fn(), warn: vi.fn() } }
    );

    expect(result.archivePath).toBe(
      join(root, 'build', 'firefox-source', 'Zendio-All in Obsidian-v0.2.1-source.zip')
    );

    const entries = await readFirefoxAmoSourceArchiveEntries(result.archivePath);
    const entryPaths = entries.map((entry) => entry.path).sort();

    expect(entryPaths).toContain('AMO_SOURCE_REVIEW.md');
    expect(entryPaths).toContain('.nvmrc');
    expect(entryPaths).toContain('package.json');
    expect(entryPaths).toContain('package-lock.json');
    expect(entryPaths).toContain('src/background/index.ts');
    expect(entryPaths).toContain('public/manifest.firefox.json');
    expect(entryPaths).toContain('public/icons/arbitrary-binary.bin');
    expect(entryPaths).toContain('scripts/build.mjs');
    expect(entryPaths).toContain('scripts/package-firefox.mjs');
    expect(entryPaths).toContain('scripts/provision-geckodriver.mjs');
    expect(entryPaths).toContain('scripts/utils/firefoxExactXpiSubmit.mjs');
    expect(entryPaths).toContain('scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs');
    expect(entryPaths).toContain('tools/audit-release-archive.mjs');
    expect(entryPaths).not.toContain('.env.production.local');
    expect(entryPaths).not.toContain('build/dist/content/runtime.js');
    expect(entryPaths).not.toContain('node_modules/web-ext/index.js');
    expect(entryPaths).not.toContain('.worktrees/stale/file.txt');
    expect(entryPaths).not.toContain('Zendio-All in Obsidian-v0.2.1.xpi');
    expect(entryPaths).not.toContain('src/.DS_Store');

    const readme = entries
      .find((entry) => entry.path === 'AMO_SOURCE_REVIEW.md')
      ?.content?.toString('utf8');
    expect(readme).toContain('Zendio-All in Obsidian-v0.2.1.xpi');
    expect(readme).toContain('ZENDIO_GA_MEASUREMENT_ID');
    expect(readme).toContain('test "$ZENDIO_GA_TRANSPORT_MODE" = proxy');
    expect(readme).toContain("'--ignore-scripts'");
    expect(readme).toContain("'--node-options='");
    expect(readme).toContain("join(root, 'scripts/build.mjs')");
    expect(readme).toContain("join(root, 'scripts/package-firefox.mjs')");
    expect(
      entries.find((entry) => entry.path === 'public/icons/arbitrary-binary.bin')?.content
    ).toEqual(Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x41]));

    await expect(auditFirefoxAmoSourceArchive(result.archivePath)).resolves.toMatchObject({
      ok: true
    });
  });

  it('rejects source archives that contain generated packages, secret files, or miss build inputs', async () => {
    const root = await createTempRoot();
    const archivePath = await writeZipArchive(root, 'bad-source.zip', {
      'AMO_SOURCE_REVIEW.md': 'incomplete instructions\n',
      'package.json': '{}\n',
      '.env.production.local': 'WEB_EXT_API_SECRET=secret\n',
      'build/dist/content/runtime.js': 'generated\n',
      'node_modules/web-ext/index.js': 'dependency\n',
      'Zendio-All in Obsidian-v0.2.1.xpi': 'package\n'
    });

    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /forbidden archive entry: \.env\.production\.local/
    );
    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /forbidden archive entry: build\/dist\/content\/runtime\.js/
    );
    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /forbidden archive entry: node_modules\/web-ext\/index\.js/
    );
    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /forbidden archive entry: Zendio-All in Obsidian-v0\.2\.1\.xpi/
    );
    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /missing required source entry: scripts\/build\.mjs/
    );
    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      /package\.json version is missing/
    );
  });

  it('applies fatal UTF-8 decoding only to required text entries', async () => {
    const root = await createTempRoot();
    const archivePath = await writeZipArchive(root, 'malformed-source.zip', {
      'AMO_SOURCE_REVIEW.md': Buffer.from([0xff, 0xfe]),
      'package.json': '{"version":"0.2.1"}\n'
    });

    await expect(auditFirefoxAmoSourceArchive(archivePath)).rejects.toThrow(
      'ZIP_ENTRY_UTF8_INVALID:AMO_SOURCE_REVIEW.md'
    );
  });

  it('emits a directly executable replay that binds the complete command and input contract', async () => {
    const root = await createTempRoot();
    const outputRoot = await createTempRoot();
    const toolRoot = await createTempRoot();
    const fakeBin = join(toolRoot, 'bin');
    await mkdir(fakeBin, { recursive: true });
    await symlink(process.execPath, join(fakeBin, 'node'));
    const npmMarker = join(toolRoot, 'npm-invocation.txt');
    await writeFile(
      join(fakeBin, 'npm'),
      `#!/bin/sh
if test "$#" -eq 1 && test "$1" = --version; then
  printf '10.8.2\\n'
  exit 0
fi
if test "$#" -eq 9 && test "$1" = ci && test "$2" = --ignore-scripts && test "$3" = --no-audit && test "$4" = --no-fund && test "$5" = --include=optional && test "$6" = --registry=https://registry.npmjs.org/ && test "\${7#--userconfig=}" != "$7" && test "\${8#--globalconfig=}" != "$8" && test "$9" = --node-options=; then
  printf '%s\\n' "$@" > ${JSON.stringify(npmMarker)}
  printf 'fixture install complete\\n'
  exit 0
fi
printf 'NPM_ARGV_MISMATCH\\n' >&2
exit 65
`
    );
    await chmod(join(fakeBin, 'npm'), 0o755);
    await createSourceFixture(root, { localNoise: false });

    const result = await createFirefoxAmoSourceArchive(
      {
        repoRoot: root,
        outputDir: outputRoot,
        artifactBaseName: 'Zendio-All in Obsidian-v0.2.1',
        releaseXpiName: 'Zendio-All in Obsidian-v0.2.1.xpi',
        version: '0.2.1'
      },
      { logger: { log: vi.fn(), warn: vi.fn() } }
    );
    const entries = await readFirefoxAmoSourceArchiveEntries(result.archivePath);
    const extractedRoot = await createTempRoot();
    for (const entry of entries) {
      if (entry.content) await writeFixtureFile(extractedRoot, entry.path, entry.content);
    }
    const canonicalRoot = await realpath(extractedRoot);
    const readme = entries
      .find((entry) => entry.path === 'AMO_SOURCE_REVIEW.md')
      ?.content?.toString('utf8');
    const script = readme?.match(/```bash\n([\s\S]*?)\n```/)?.[1];
    expect(script).toBeTruthy();

    const replay = spawnSync('/bin/bash', ['-c', script ?? 'exit 99'], {
      cwd: extractedRoot,
      env: {
        PATH: `${fakeBin}:/usr/bin:/bin`,
        ZENDIO_GA_MEASUREMENT_ID: 'G-FIXTURE',
        ZENDIO_GA_TRANSPORT_MODE: 'proxy',
        ZENDIO_GA_PROXY_ENDPOINT: 'https://example.invalid/collect'
      },
      encoding: 'utf8',
      timeout: 30_000
    });

    expect(replay).toMatchObject({ status: 0, signal: null });
    expect(replay.stderr).toBe('');
    const receiptPath = replay.stdout.match(/ZENDIO_REVIEW_RECEIPT=(.+)\n/)?.[1];
    expect(receiptPath).toBeTruthy();
    if (!receiptPath) throw new Error('missing replay receipt path');
    tempRoots.push(dirname(receiptPath));
    const receiptValue: unknown = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (!isReplayReceipt(receiptValue)) throw new Error('invalid replay receipt shape');
    const receipt = receiptValue;
    expect(receipt).toMatchObject({
      schema: 'zendio-amo-source-review-replay/v1',
      policy: 'release-build-env-v1',
      cwd: canonicalRoot,
      commands: [
        {
          label: 'install',
          cwd: canonicalRoot,
          stdin: { bytes: 0 },
          result: { exitCode: 0, signal: null }
        },
        {
          label: 'build',
          cwd: canonicalRoot,
          stdin: { bytes: 0 },
          result: { exitCode: 0, signal: null }
        },
        {
          label: 'package',
          cwd: canonicalRoot,
          stdin: { bytes: 0 },
          result: { exitCode: 0, signal: null }
        }
      ]
    });
    expect(receipt.commands[0].argv).toEqual([
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--include=optional',
      '--registry=https://registry.npmjs.org/',
      expect.stringMatching(/^--userconfig=\/tmp\/zendio-amo-review\./),
      expect.stringMatching(/^--globalconfig=\/tmp\/zendio-amo-review\./),
      '--node-options='
    ]);
    expect(receipt.commands[1].argv).toEqual([
      join(canonicalRoot, 'scripts/build.mjs'),
      '--mode=prod',
      '--skip-checks',
      '--firefox',
      '--outdir',
      expect.stringMatching(/^\/tmp\/zendio-amo-review\..+\/tmp\/dist-firefox$/)
    ]);
    expect(receipt.commands[2].argv).toEqual([
      join(canonicalRoot, 'scripts/package-firefox.mjs'),
      '--dist-dir',
      expect.stringMatching(/^\/tmp\/zendio-amo-review\..+\/tmp\/dist-firefox$/)
    ]);
    const packageLockRow = receipt.input.rows.find(
      (row): row is JsonObject => isRecord(row) && row.path === 'package-lock.json'
    );
    const binaryRow = receipt.input.rows.find(
      (row): row is JsonObject => isRecord(row) && row.path === 'public/icons/arbitrary-binary.bin'
    );
    expect(packageLockRow).toBeDefined();
    expect(typeof packageLockRow?.sha256).toBe('string');
    expect(binaryRow).toBeDefined();
    expect(binaryRow?.size).toBe(5);
    expect(typeof binaryRow?.sha256).toBe('string');
    expect(receipt.input.rosterSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.input.rows).toHaveLength(
      entries.filter((entry) => Buffer.isBuffer(entry.content)).length
    );
    for (const command of receipt.commands) {
      const environmentNames = Object.keys(command.environment);
      expect(environmentNames.includes('NODE_OPTIONS')).toBe(false);
      expect(environmentNames.some((key) => /^npm_config_/i.test(key))).toBe(false);
    }
    expect(receipt.output.path).toBe(join(canonicalRoot, 'Zendio-All in Obsidian-v0.2.1.xpi'));
    expect(receipt.output.size).toBe(12);
    expect(receipt.output.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await readFile(npmMarker, 'utf8')).trim().split('\n')).toEqual(
      receipt.commands[0].argv
    );
  });
});
