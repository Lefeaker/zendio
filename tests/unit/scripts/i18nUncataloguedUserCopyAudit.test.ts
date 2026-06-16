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
  kind: 'english-literal' | 'translation-fallback' | 'descriptor-boundary';
  category: string;
  classification: 'unexpected' | 'allowlisted';
  literal: string;
  message: string;
}

interface AuditResult {
  ok: boolean;
  usedProductionBuildGraph: boolean;
  findings: AuditFinding[];
  unexpectedFindings: AuditFinding[];
  staleAllowlistEntries: Array<{
    id: string;
    path: string;
    missingRequiredMetadata?: boolean;
    missingLocator?: boolean;
  }>;
}

interface AllowlistRule {
  id: string;
  path: string;
  line?: number;
  pattern?: string;
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
  productionGraphPath?: string;
}) => Promise<AuditResult>;

const tempDirs: string[] = [];
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function loadAuditModule(): Promise<{ scanI18nUncataloguedUserCopy: ScanFn }> {
  const moduleUrl = new URL(
    '../../../scripts/audit-i18n-uncatalogued-user-copy.mjs',
    import.meta.url
  ).href;
  return (await import(moduleUrl)) as { scanI18nUncataloguedUserCopy: ScanFn };
}

async function createProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-i18n-uncatalogued-copy-'));
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
  allowlist: AllowlistRule[] = [],
  options: { productionGraphPath?: string } = {}
): Promise<AuditResult> {
  const root = await createProject(files);
  const { scanI18nUncataloguedUserCopy } = await loadAuditModule();
  return scanI18nUncataloguedUserCopy({
    root,
    allowlist: { rules: allowlist },
    ...options
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('audit-i18n-uncatalogued-user-copy', () => {
  it('flags production English UI literals in user-visible object fields', async () => {
    const result = await scanProject({
      'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save this page now' };\n`
    });

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings).toHaveLength(1);
    expect(result.unexpectedFindings[0]).toMatchObject({
      file: 'src/content/runtime/clipPrompt.ts',
      kind: 'english-literal',
      category: 'uncatalogued-ui-copy'
    });
  });

  it('ignores technical identifiers, URLs, class names, icon names, and analytics event names', async () => {
    const result = await scanProject({
      'src/background/services/analyticsEvents.ts': [
        `export const url = 'https://example.com/docs';`,
        `export const event = { eventName: 'runtime_harness_open', category: 'usage' };`,
        `export const view = { className: 'aobx-button-row', icon: 'download', id: 'clipper-dialog' };`,
        `export const classByTone = { error: 'alert alert-error mt-3' };`
      ].join('\n')
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('ignores CSS assigned to a style element textContent', async () => {
    const result = await scanProject({
      'src/content/runtime/localVaultPermissionFrame.ts': [
        `const style = document.createElement('style');`,
        "style.textContent = '.permission-shell { font-family: system-ui, sans-serif; }';"
      ].join('\n')
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags English translation fallback arguments', async () => {
    const result = await scanProject({
      'src/options/stitch/schema/example.ts': `export const title = context.t('save.title', 'Save this page now');\n`
    });

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings[0]).toMatchObject({
      file: 'src/options/stitch/schema/example.ts',
      kind: 'translation-fallback'
    });
  });

  it('scans HTML text nodes without treating attributes or style rules as copy', async () => {
    const result = await scanProject({
      'public/local-vault-permission.html': [
        '<html lang="en" class="aobx-preview">',
        '<head>',
        '  <style>',
        '    .permission-shell { font-family: system-ui, sans-serif; }',
        '  </style>',
        '  <title>Local vault permission</title>',
        '</head>',
        '<body>',
        '  <button class="btn primary">Grant local vault access</button>',
        '</body>',
        '</html>'
      ].join('\n')
    });

    expect(result.unexpectedFindings.map((finding) => finding.literal)).toEqual([
      'Local vault permission',
      'Grant local vault access'
    ]);
  });

  it('excludes public harness HTML declared as excluded by the production graph', async () => {
    const result = await scanProject(
      {
        'build/reports/production-build-graph.json': JSON.stringify({
          reachableSources: {},
          excludedHarnessEntrypoints: {
            'content-orchestrator-harness': 'src/dev/contentOrchestratorHarness.ts'
          }
        }),
        'public/content-orchestrator-harness.html':
          '<h1>Content Orchestrator Harness</h1><p>Open the development harness.</p>',
        'public/local-vault-permission.html': '<title>Local vault permission</title>'
      },
      [],
      { productionGraphPath: 'build/reports/production-build-graph.json' }
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      file: 'public/local-vault-permission.html',
      literal: 'Local vault permission'
    });
  });

  it('flags descriptor-boundary English payloads without descriptor siblings', async () => {
    const result = await scanProject({
      'src/background/pipelines/connectionResult.ts': [
        'export const payload = {',
        `  message: 'Connection failed. Check your token.',`,
        '  ok: false',
        '};'
      ].join('\n')
    });

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings[0]).toMatchObject({
      file: 'src/background/pipelines/connectionResult.ts',
      kind: 'descriptor-boundary'
    });
  });

  it('does not flag descriptor-boundary literals when a descriptor sibling is present', async () => {
    const result = await scanProject({
      'src/background/pipelines/connectionResult.ts': [
        'export const payload = {',
        `  message: 'Connection failed. Check your token.',`,
        `  messageDescriptor: { key: 'connection.failed', params: { channel: 'https' } },`,
        '  ok: false',
        '};'
      ].join('\n')
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('fails on stale allowlist entries', async () => {
    const result = await scanProject(
      {
        'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save' };\n`
      },
      [
        {
          id: 'stale-entry',
          path: 'src/content/runtime/clipPrompt.ts',
          category: 'retained-copy',
          reason: 'stale test entry',
          ownerPlan: 'follow-up',
          revisit: 'remove once literal disappears',
          literalIncludes: ['Missing literal'],
          findingKinds: ['english-literal']
        }
      ]
    );

    expect(result.ok).toBe(false);
    expect(result.staleAllowlistEntries).toHaveLength(1);
    expect(result.staleAllowlistEntries[0]).toMatchObject({
      id: 'stale-entry',
      missingRequiredMetadata: false,
      missingLocator: false
    });
  });

  it('fails on allowlist entries with missing required metadata', async () => {
    const result = await scanProject(
      {
        'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save this page now' };\n`
      },
      [
        {
          id: 'missing-reason',
          path: 'src/content/runtime/clipPrompt.ts',
          category: 'retained-copy',
          reason: '',
          ownerPlan: 'follow-up',
          revisit: 'fill in reason',
          line: 1,
          literalIncludes: ['Save this page now'],
          findingKinds: ['english-literal']
        }
      ]
    );

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings).toHaveLength(1);
    expect(result.staleAllowlistEntries[0]).toMatchObject({
      id: 'missing-reason',
      missingRequiredMetadata: true,
      missingLocator: false
    });
  });

  it('fails on broad allowlist entries without a stable locator', async () => {
    const result = await scanProject(
      {
        'src/content/runtime/clipPrompt.ts': `export const prompt = { label: 'Save this page now' };\n`
      },
      [
        {
          id: 'path-only',
          path: 'src/content/runtime/clipPrompt.ts',
          category: 'retained-copy',
          reason: 'path-only rules are too broad',
          ownerPlan: 'follow-up',
          revisit: 'replace with stable locator'
        }
      ]
    );

    expect(result.ok).toBe(false);
    expect(result.unexpectedFindings).toHaveLength(1);
    expect(result.staleAllowlistEntries[0]).toMatchObject({
      id: 'path-only',
      missingRequiredMetadata: false,
      missingLocator: true
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
    const { scanI18nUncataloguedUserCopy } = await loadAuditModule();
    const result = await scanI18nUncataloguedUserCopy({ root: repoRoot });

    expect(result.usedProductionBuildGraph).toBe(true);
    expect(result.staleAllowlistEntries).toEqual([]);
    expect(
      result.findings.every(
        (finding) =>
          finding.file.length > 0 &&
          finding.line > 0 &&
          finding.kind.length > 0 &&
          finding.category.length > 0 &&
          finding.message.length > 0 &&
          finding.literal.length > 0
      )
    ).toBe(true);
  });
});
