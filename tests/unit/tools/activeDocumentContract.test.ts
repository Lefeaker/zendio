import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  auditActiveDocumentContract,
  parseActiveDocumentContractArgs
} from '../../../tools/report-active-document-contract.mjs';

type Status = 'active' | 'historical' | 'fixture';
type Row = { path: string; status: Status; extra?: string };
type FixtureRow = { path?: string; status?: string; extra?: string };
type FixtureTopLevel = { owner?: string };

const toolPath = resolve('tools/report-active-document-contract.mjs');
const defaultRows: Row[] = [
  { path: 'README.md', status: 'active' },
  { path: 'docs/history.md', status: 'historical' },
  {
    path: 'tests/fixtures/tools/example/docs/sample.md',
    status: 'fixture'
  }
];

function writeFixtureFile(root: string, path: string, content = ''): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

function writeManifest(
  root: string,
  rows: FixtureRow[] = defaultRows,
  topLevel: FixtureTopLevel = {}
): void {
  writeFixtureFile(
    root,
    'tools/active-document-status.json',
    `${JSON.stringify({ schemaVersion: 1, documents: rows, ...topLevel }, null, 2)}\n`
  );
  git(root, ['add', '--', 'tools/active-document-status.json']);
}

function createFixture(rows: FixtureRow[] = defaultRows): string {
  const root = mkdtempSync(join(tmpdir(), 'zendio-active-doc-contract-'));
  git(root, ['init', '--quiet']);
  writeFixtureFile(root, 'README.md', '# Current\n');
  writeFixtureFile(root, 'docs/history.md', '# Historical\n');
  writeFixtureFile(
    root,
    'tests/fixtures/tools/example/docs/sample.md',
    'node tools/report-production-code-shape.mjs\n'
  );
  git(root, [
    'add',
    '--',
    'README.md',
    'docs/history.md',
    'tests/fixtures/tools/example/docs/sample.md'
  ]);
  writeManifest(root, rows);
  return root;
}

function withFixture(run: (root: string) => void, rows: FixtureRow[] = defaultRows): void {
  const root = createFixture(rows);
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('active document contract', () => {
  it('accepts an exact active, historical, and fixture inventory', () => {
    withFixture((root) => {
      expect(auditActiveDocumentContract({ repoRoot: root })).toEqual({
        schemaVersion: 1,
        manifestPath: 'tools/active-document-status.json',
        counts: {
          trackedMarkdown: 3,
          classifiedDocuments: 3,
          active: 1,
          historical: 1,
          fixture: 1
        },
        findings: [],
        ok: true
      });
    });
  });

  it('fails when added tracked Markdown is unclassified', () => {
    withFixture((root) => {
      writeFixtureFile(root, 'docs/new-current.md', '# New\n');
      git(root, ['add', '--', 'docs/new-current.md']);

      const report = auditActiveDocumentContract({ repoRoot: root });
      expect(report.ok).toBe(false);
      expect(report.findings).toContainEqual(
        expect.objectContaining({
          code: 'tracked-markdown-unclassified',
          path: 'docs/new-current.md'
        })
      );
    });
  });

  it('fails when a manifest row remains after the tracked file is deleted', () => {
    withFixture((root) => {
      rmSync(join(root, 'docs/history.md'));
      git(root, ['add', '--update', '--', 'docs/history.md']);

      const report = auditActiveDocumentContract({ repoRoot: root });
      expect(report.findings).toContainEqual(
        expect.objectContaining({ code: 'manifest-path-stale', path: 'docs/history.md' })
      );
    });
  });

  it.each([
    {
      label: 'duplicate rows',
      rows: [...defaultRows, defaultRows[2]],
      code: 'document-path-duplicate'
    },
    {
      label: 'unsorted rows',
      rows: [defaultRows[1], defaultRows[0], defaultRows[2]],
      code: 'documents-unsorted'
    },
    {
      label: 'unknown row keys',
      rows: [
        { path: 'README.md', status: 'active', extra: 'not allowed' },
        ...defaultRows.slice(1)
      ],
      code: 'document-row-schema-invalid'
    },
    {
      label: 'invalid status',
      rows: [{ path: 'README.md', status: 'current' }, ...defaultRows.slice(1)],
      code: 'document-status-invalid'
    },
    {
      label: 'non-Markdown paths',
      rows: [{ path: 'README.txt', status: 'active' }, ...defaultRows.slice(1)],
      code: 'document-path-invalid'
    },
    {
      label: 'escaping paths',
      rows: [{ path: '../README.md', status: 'active' }, ...defaultRows.slice(1)],
      code: 'document-path-invalid'
    }
  ])('fails on $label', ({ rows, code }) => {
    withFixture((root) => {
      const report = auditActiveDocumentContract({ repoRoot: root });
      expect(report.ok).toBe(false);
      expect(report.findings.some((item) => item.code === code)).toBe(true);
    }, rows);
  });

  it('fails on unknown top-level keys', () => {
    withFixture((root) => {
      writeManifest(root, defaultRows, { owner: 'not allowed' });
      const report = auditActiveDocumentContract({ repoRoot: root });
      expect(report.findings.some((item) => item.code === 'manifest-schema-invalid')).toBe(true);
    });
  });

  it('rejects tracked Markdown symlinks', () => {
    withFixture((root) => {
      symlinkSync('../README.md', join(root, 'docs/link.md'));
      git(root, ['add', '--', 'docs/link.md']);
      writeManifest(root, [
        defaultRows[0],
        defaultRows[1],
        { path: 'docs/link.md', status: 'active' },
        defaultRows[2]
      ]);

      const report = auditActiveDocumentContract({ repoRoot: root });
      expect(report.findings).toContainEqual(
        expect.objectContaining({ code: 'tracked-markdown-symlink', path: 'docs/link.md' })
      );
    });
  });

  it('uses exact report/check CLI modes', () => {
    withFixture((root) => {
      writeFixtureFile(root, 'docs/unclassified.md', '# New\n');
      git(root, ['add', '--', 'docs/unclassified.md']);

      const reportRun = spawnSync(process.execPath, [toolPath, '--report'], {
        cwd: root,
        encoding: 'utf8'
      });
      expect(reportRun.status).toBe(0);
      expect(JSON.parse(reportRun.stdout).ok).toBe(false);

      const checkRun = spawnSync(process.execPath, [toolPath, '--check'], {
        cwd: root,
        encoding: 'utf8'
      });
      expect(checkRun.status).toBe(1);
      expect(JSON.parse(checkRun.stdout).findings).toContainEqual(
        expect.objectContaining({ path: 'docs/unclassified.md' })
      );

      for (const args of [[], ['--other'], ['--report', '--check']]) {
        const invalid = spawnSync(process.execPath, [toolPath, ...args], {
          cwd: root,
          encoding: 'utf8'
        });
        expect(invalid.status).toBe(2);
        expect(invalid.stderr).toContain('expected exactly one mode');
      }
    });
  });

  it('parses only the two supported modes', () => {
    expect(parseActiveDocumentContractArgs(['--report'])).toBe('report');
    expect(parseActiveDocumentContractArgs(['--check'])).toBe('check');
    expect(() => parseActiveDocumentContractArgs([])).toThrow('expected exactly one mode');
  });

  it('has no CLI side effect when imported', () => {
    const imported = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(pathToFileURL(toolPath).href)})`
      ],
      { encoding: 'utf8' }
    );
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe('');
    expect(imported.stderr).toBe('');
  });

  it('treats fixture Markdown as classification data without executing its prose', () => {
    withFixture((root) => {
      const fixtureSource = readFileSync(
        join(root, 'tests/fixtures/tools/example/docs/sample.md'),
        'utf8'
      );
      expect(fixtureSource).toContain('report-production-code-shape');
      expect(auditActiveDocumentContract({ repoRoot: root }).ok).toBe(true);
    });
  });
});
