import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type BrandRenameResidualModule = {
  classifyFinding: (
    finding: {
      path: string;
      line: number;
      column: number;
      token: string;
      lineText: string;
    },
    allowlist: Record<string, unknown>
  ) => {
    class: string;
    reason: string;
    ownerConfirmationRequired: boolean;
    ruleId: string | null;
  };
  loadAllowlist: (path?: string) => Promise<Record<string, unknown>>;
  scanResiduals: (options?: {
    root?: string;
    allowlist?: Record<string, unknown>;
    allowlistPath?: string;
  }) => Promise<{
    ok: boolean;
    findings: Array<{ path: string; token: string; class: string; ruleId: string | null }>;
    counts: Record<string, number>;
    validationErrors: string[];
  }>;
  validateAllowlist: (allowlist: Record<string, unknown>) => string[];
};

const { classifyFinding, loadAllowlist, scanResiduals, validateAllowlist } = (await import(
  // @ts-expect-error Tool modules are authored as executable ESM without .d.ts files.
  '../../../tools/report-brand-rename-residuals.mjs'
)) as BrandRenameResidualModule;

async function writeFixture(root: string, relativePath: string, content: string) {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

describe('report-brand-rename-residuals', () => {
  it('keeps the source-map token set including AllInObsidian', async () => {
    const allowlist = await loadAllowlist();

    expect(validateAllowlist(allowlist)).toEqual([]);
    expect(allowlist.tokens).toContain('AllInObsidian');
  });

  it('classifies owner-confirmation support channels separately from repo paths', async () => {
    const allowlist = await loadAllowlist();

    expect(
      classifyFinding(
        {
          path: 'docs/zh-cn/support-contact.md',
          line: 11,
          column: 8,
          token: 'allinobsidian',
          lineText: '- **电子邮箱**：allinobsidian@outlook.com'
        },
        allowlist
      )
    ).toMatchObject({
      class: 'external-owner-confirmation-required',
      ownerConfirmationRequired: true
    });

    expect(
      classifyFinding(
        {
          path: 'docs/en/guides/QUICKSTART.md',
          line: 11,
          column: 9,
          token: 'AiiinOB',
          lineText: '5. 选择文件夹：`AiiinOB/your-extension/dist`'
        },
        allowlist
      )
    ).toMatchObject({
      class: 'repo-path-or-history',
      ownerConfirmationRequired: false
    });
  });

  it('scans fixtures and returns class counts for compatible residuals', async () => {
    const allowlist = await loadAllowlist();
    const root = await mkdtemp(join(tmpdir(), 'zendio-brand-residuals-'));

    try {
      await writeFixture(
        root,
        'src/platform/chrome/localVaultCore.ts',
        "const DB = 'ai2ob-vault';\n"
      );
      await writeFixture(
        root,
        'tests/fixtures/options-preview/app/runtime.ts',
        "const fallback = 'AllInObsidian';\n"
      );
      await writeFixture(root, 'docs/zh-cn/clipper/旧文档.md', '找到 "All in Ob" 扩展\n');

      const result = await scanResiduals({ root, allowlist });

      expect(result.ok).toBe(true);
      expect(result.counts['compat-retain-user-data']).toBe(1);
      expect(result.counts['internal-dev-preview']).toBe(1);
      expect(result.counts['historical-doc']).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed on unclassified active-looking residuals', async () => {
    const allowlist = await loadAllowlist();
    const root = await mkdtemp(join(tmpdir(), 'zendio-brand-residuals-'));

    try {
      await writeFixture(root, 'src/activeBrand.ts', "export const label = 'All in Ob';\n");

      const result = await scanResiduals({ root, allowlist });

      expect(result.ok).toBe(false);
      expect(result.counts.unclassified).toBe(1);
      expect(result.findings[0]).toMatchObject({
        path: 'src/activeBrand.ts',
        class: 'unclassified',
        ruleId: null
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
