import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

interface AuditFinding {
  file: string;
  line: number;
  kind: 'cjk-literal' | 'translation-fallback' | 'descriptor-boundary';
  category: string;
  classification: 'unexpected' | 'allowlisted';
  message: string;
}

interface AuditResult {
  ok: boolean;
  usedProductionBuildGraph: boolean;
  findings: AuditFinding[];
  unexpectedFindings: AuditFinding[];
  staleAllowlistEntries: Array<{ id: string; path: string }>;
}

interface AllowlistRule {
  id: string;
  path: string;
  category: string;
  reason: string;
  ownerPlan: string;
  revisit: string;
  literalIncludes?: string[];
  findingKinds?: string[];
}

type ScanFn = (options: {
  root: string;
  allowlist?: { rules: AllowlistRule[] };
}) => Promise<AuditResult>;

const tempDirs: string[] = [];
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function loadAuditModule(): Promise<{ scanI18nHardcodedUserCopy: ScanFn }> {
  const moduleUrl = new URL('../../../scripts/audit-i18n-hardcoded-user-copy.mjs', import.meta.url)
    .href;
  return (await import(moduleUrl)) as { scanI18nHardcodedUserCopy: ScanFn };
}

async function createProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-i18n-user-copy-'));
  tempDirs.push(root);

  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, source, 'utf8');
  }

  return root;
}

async function scanProject(
  files: Record<string, string>,
  allowlist: AllowlistRule[] = []
): Promise<AuditResult> {
  const root = await createProject(files);
  const { scanI18nHardcodedUserCopy } = await loadAuditModule();
  return scanI18nHardcodedUserCopy({
    root,
    allowlist: { rules: allowlist }
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('audit-i18n-hardcoded-user-copy', () => {
  it('flags production Chinese UI literals in source files', async () => {
    const result = await scanProject({
      'src/content/runtime/clipPrompt.ts': `export const prompt = { label: '立即保存' };\n`
    });

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings).toHaveLength(1);
    expect(result.unexpectedFindings[0]).toMatchObject({
      file: 'src/content/runtime/clipPrompt.ts',
      kind: 'cjk-literal'
    });
  });

  it('ignores catalog, generated artifacts, and fixture-like user content', async () => {
    const result = await scanProject({
      'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save now' };\n`,
      'src/i18n/catalog/messages/zh-CN/runtime.json': '{"cta":"立即保存"}\n',
      'src/i18n/generated/locales/zh-CN.generated.ts': `export const zh = { cta: '立即保存' };\n`,
      'public/_locales/zh_CN/messages.json': '{"cta":{"message":"立即保存"}}\n',
      'src/content/fixtures/user-content.ts': `export const fixture = { text: '这是用户自己的内容' };\n`
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags Chinese translation fallback arguments', async () => {
    const result = await scanProject({
      'src/options/schema/runtime.ts': `export const title = ctx.t?.('pageTitle', '立即保存') ?? '立即保存';\n`
    });

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings).toHaveLength(1);
    expect(result.unexpectedFindings[0]).toMatchObject({
      file: 'src/options/schema/runtime.ts',
      kind: 'translation-fallback'
    });
  });

  it('flags descriptor-boundary payload regressions without descriptor siblings', async () => {
    const result = await scanProject({
      'src/background/pipelines/connectionResult.ts': [
        'export const payload = {',
        `  label: '默认仓库',`,
        `  message: '连接成功',`,
        '  ok: true',
        '};'
      ].join('\n')
    });

    expect(result.ok).toBe(false);
    expect(
      result.unexpectedFindings.some((finding) => finding.kind === 'descriptor-boundary')
    ).toBe(true);
  });

  it('fails on stale allowlist entries', async () => {
    const result = await scanProject(
      {
        'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save now' };\n`
      },
      [
        {
          id: 'stale-entry',
          path: 'src/content/runtime/clipPrompt.ts',
          category: 'compatibility-copy',
          reason: 'stale test entry',
          ownerPlan: 'P12',
          revisit: 'remove once literal disappears',
          literalIncludes: ['不会命中'],
          findingKinds: ['cjk-literal']
        }
      ]
    );

    expect(result.ok).toBe(false);
    expect(result.staleAllowlistEntries).toHaveLength(1);
    expect(result.staleAllowlistEntries[0]).toMatchObject({
      id: 'stale-entry',
      path: 'src/content/runtime/clipPrompt.ts'
    });
  });

  it('produces explainable current-tree output', async () => {
    await execFileAsync(
      'node',
      [
        'tools/report-production-build-graph.mjs',
        '--write-json',
        'build/reports/production-build-graph.json'
      ],
      { cwd: repoRoot }
    );
    const { scanI18nHardcodedUserCopy } = await loadAuditModule();
    const result = await scanI18nHardcodedUserCopy({ root: repoRoot });

    expect(result.usedProductionBuildGraph).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.staleAllowlistEntries).toEqual([]);
    expect(result.findings.some((finding) => finding.classification === 'allowlisted')).toBe(true);
    expect(
      result.unexpectedFindings.every(
        (finding) =>
          finding.file.length > 0 &&
          finding.line > 0 &&
          finding.kind.length > 0 &&
          finding.category.length > 0 &&
          finding.message.length > 0
      )
    ).toBe(true);
  });
});
