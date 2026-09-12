import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvidenceChain } from '../../utils/npmAuditTypedLoader.mjs';

const expectedOriginPaths = [
  'tests/unit/tools/npmAuditEvidenceChain.test.ts',
  'tests/unit/tools/npmAuditRegression.test.ts',
  'tests/unit/tools/npmAuditRegressionCanonicalJson.test.ts',
  'tests/unit/tools/npmAuditReport.test.ts',
  'tests/unit/tools/npmAuditRuntimeDiscovery.test.ts',
  'tests/unit/tools/npmAuditTransitionValidator.test.ts',
  'tests/utils/npmAuditRegressionFixtures.ts',
  'tools/check-npm-audit-regression.mjs',
  'tools/npm-audit-regression/audit-report.mjs',
  'tools/npm-audit-regression/canonical-json.mjs',
  'tools/npm-audit-regression/cli.mjs',
  'tools/npm-audit-regression/evidence-chain.mjs',
  'tools/npm-audit-regression/manifests/r02-transition-v10.json',
  'tools/npm-audit-regression/runtime-discovery.mjs',
  'tools/npm-audit-regression/transition-validator.mjs'
];

describe('audit evidence chain', () => {
  it('owns evidence primitives while CLI owns argv and ordered workflows', () => {
    const evidenceSource = readFileSync('tools/npm-audit-regression/evidence-chain.mjs', 'utf8');
    const cliSource = readFileSync('tools/npm-audit-regression/cli.mjs', 'utf8');
    expect(evidenceSource).not.toContain('requiredAuditFlag');
    expect(evidenceSource).not.toContain('function captureBaseline');
    expect(evidenceSource).not.toContain('function captureCandidate');
    expect(cliSource).toContain('function captureBaseline');
    expect(cliSource).toContain('function captureCandidate');
  });

  it('binds the exact 15-path portable origin owner', async () => {
    const { R02_ORIGIN_PATHS } = await loadEvidenceChain();
    expect(R02_ORIGIN_PATHS).toEqual(expectedOriginPaths);
    expect(R02_ORIGIN_PATHS).toHaveLength(15);
    expect([...R02_ORIGIN_PATHS].sort()).toEqual([...new Set(R02_ORIGIN_PATHS)].sort());
    expect(R02_ORIGIN_PATHS.filter((path: string) => path.startsWith('tools/'))).toHaveLength(8);
    expect(R02_ORIGIN_PATHS.filter((path: string) => path.startsWith('tests/'))).toHaveLength(7);
  });

  it('writes no-replace files and rejects a second writer', async () => {
    const { writeFileExclusive } = await loadEvidenceChain();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'zendio-r02-exclusive-')));
    const path = join(root, 'evidence');
    try {
      writeFileExclusive(path, 'first');
      expect(readFileSync(path, 'utf8')).toBe('first');
      expect(() => writeFileExclusive(path, 'second')).toThrow('Refusing to overwrite');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes durably without replacing a racing final path', async () => {
    const { durablePublishNoReplace } = await loadEvidenceChain();
    const root = realpathSync(mkdtempSync(join(homedir(), 'zendio-r02-publish-')));
    const path = join(root, 'manifest.json');
    try {
      expect(() =>
        durablePublishNoReplace(path, Buffer.from('candidate'), {
          beforeLink: () => writeFileSync(path, 'racer', { mode: 0o600 })
        })
      ).toThrow();
      expect(readFileSync(path, 'utf8')).toBe('racer');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows ignored evidence but rejects nonignored untracked files', async () => {
    const { ensureCleanTree } = await loadEvidenceChain();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'zendio-r02-clean-')));
    try {
      execFileSync('/usr/bin/git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, '.gitignore'), '.evidence/\n');
      writeFileSync(join(root, 'tracked'), 'tracked');
      execFileSync('/usr/bin/git', ['add', '.gitignore', 'tracked'], { cwd: root });
      execFileSync(
        '/usr/bin/git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          'commit',
          '-qm',
          'base'
        ],
        { cwd: root }
      );
      mkdirSync(join(root, '.evidence'));
      writeFileSync(join(root, '.evidence', 'local.json'), '{}\n');
      expect(() => ensureCleanTree(root)).not.toThrow();
      writeFileSync(join(root, 'unknown'), 'unknown');
      expect(() => ensureCleanTree(root)).toThrow('nonignored untracked paths');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['open', 'write', 'fsync', 'close'])(
    'fails closed at exclusive-file %s boundary',
    async (boundary) => {
      const { writeFileExclusive } = await loadEvidenceChain();
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'zendio-r02-file-boundary-')));
      const path = join(root, boundary);
      const operations = {
        open:
          boundary === 'open'
            ? () => {
                throw new Error('fixture-open');
              }
            : openSync,
        write:
          boundary === 'write'
            ? () => {
                throw new Error('fixture-write');
              }
            : writeFileSync,
        fsync:
          boundary === 'fsync'
            ? () => {
                throw new Error('fixture-fsync');
              }
            : fsyncSync,
        close:
          boundary === 'close'
            ? () => {
                throw new Error('fixture-close');
              }
            : closeSync
      };
      try {
        expect(() => writeFileExclusive(path, 'bytes', 0o600, operations)).toThrow(
          `fixture-${boundary}`
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it.each([
    ['link', 0],
    ['first directory fsync', 1],
    ['unlink temp', 0],
    ['second directory fsync', 2]
  ])('fails closed at durable publication %s boundary', async (boundary, failingSyncCall) => {
    const { durablePublishNoReplace } = await loadEvidenceChain();
    const root = realpathSync(mkdtempSync(join(homedir(), 'zendio-r02-publish-boundary-')));
    const path = join(root, 'final');
    let syncCalls = 0;
    try {
      expect(() =>
        durablePublishNoReplace(path, Buffer.from('bytes'), {
          operations: {
            link:
              boundary === 'link'
                ? () => {
                    throw new Error('fixture-link');
                  }
                : linkSync,
            unlink:
              boundary === 'unlink temp'
                ? () => {
                    throw new Error('fixture-unlink');
                  }
                : unlinkSync,
            fsyncDirectory: () => {
              syncCalls += 1;
              if (syncCalls === failingSyncCall) throw new Error(`fixture-fsync-${syncCalls}`);
            }
          }
        })
      ).toThrow('fixture-');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects hard-link aliases and closes Git commit/tree lineage', async () => {
    const { assertRecordedCommitTree, assertSingleParentCommit, rejectEvidenceAliases } =
      await loadEvidenceChain();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'zendio-r02-lineage-')));
    try {
      execFileSync('/usr/bin/git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, 'tracked'), 'one');
      execFileSync('/usr/bin/git', ['add', 'tracked'], { cwd: root });
      const commit = (message: string) =>
        execFileSync(
          '/usr/bin/git',
          [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.invalid',
            'commit',
            '-qm',
            message
          ],
          { cwd: root }
        );
      commit('one');
      const parent = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8'
      }).trim();
      writeFileSync(join(root, 'tracked'), 'two');
      execFileSync('/usr/bin/git', ['add', 'tracked'], { cwd: root });
      commit('two');
      const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8'
      }).trim();
      const tree = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], {
        cwd: root,
        encoding: 'utf8'
      }).trim();
      expect(() => assertRecordedCommitTree(root, head, tree)).not.toThrow();
      expect(() => assertSingleParentCommit(root, head, parent)).not.toThrow();
      const left = join(root, 'left');
      const right = join(root, 'right');
      writeFileSync(left, 'alias');
      linkSync(left, right);
      expect(() => rejectEvidenceAliases([left, right])).toThrow('hard-link identity alias');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('closes terminal candidate and reanchor topology without widening tree identity', async () => {
    const { assertTerminalCandidateTopology, assertTerminalReanchorTopology } =
      await loadEvidenceChain();
    const repo = { head: 'new', tree: 'same' };
    const parent = { repository: { head: 'old', tree: 'same' } };
    const snapshot = { head: 'new', tree: 'same', mainRef: 'new' };
    expect(() => assertTerminalCandidateTopology(repo, parent, snapshot)).not.toThrow();
    expect(() => assertTerminalReanchorTopology(repo, parent, snapshot)).not.toThrow();
    expect(() =>
      assertTerminalReanchorTopology({ head: 'new', tree: 'changed' }, parent, snapshot)
    ).toThrow('tree differs');
  });

  it('validates portable runtime relationships without dereferencing historical diagnostic paths', async () => {
    const { assertPortableRuntimeBinding } = await loadEvidenceChain();
    const empty = createHash('sha256').update('').digest('hex');
    const identity = { dev: 1, ino: 2, uid: 501, gid: 20, mode: 0o600, size: 10, nlink: 1 };
    const binding = {
      nodeVersion: 'v20.20.2',
      nodeCommand: '/historical/missing/first/bin/node',
      npmCommand: '/historical/missing/first/bin/npm',
      npmCommandRealpath: '/historical/missing/first/lib/node_modules/npm/bin/npm-cli.js',
      npmCommandSha256: '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7',
      npmPackagePath: '/historical/missing/first/lib/node_modules/npm/package.json',
      npmPackageSha256: '5af906974b65fc1e48d709687e174a466614b9706f9479bea73c650bc3142fb5',
      npmVersion: '10.8.2',
      registry: 'https://registry.npmjs.org/',
      userconfigSha256: empty,
      globalconfigSha256: empty,
      runtimeLayout: {
        nodeRelativePath: 'bin/node',
        npmLauncherRelativePath: 'bin/npm',
        npmCliRelativePath: 'lib/node_modules/npm/bin/npm-cli.js',
        npmPackageRelativePath: 'lib/node_modules/npm/package.json',
        nodeIdentity: identity,
        npmCliIdentity: { ...identity, ino: 3 },
        npmPackageIdentity: { ...identity, ino: 4 },
        nodeSha256: '0'.repeat(64)
      }
    };
    expect(() => assertPortableRuntimeBinding(binding)).not.toThrow();
    expect(() =>
      assertPortableRuntimeBinding({
        ...binding,
        runtimeLayout: { ...binding.runtimeLayout, npmPackageRelativePath: '../escape' }
      })
    ).toThrow('not portable');
  });
});
