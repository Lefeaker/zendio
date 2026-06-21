import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type BrandRenameAllowlistRule = {
  id: string;
  class: string;
  reason: string;
  paths?: string[];
  tokens?: string[];
  lineIncludes?: string[];
  lineRegex?: string;
  lineNotRegex?: string;
  ownerConfirmationRequired?: boolean;
};

type BrandRenameAllowlist = {
  classes?: string[];
  ignorePaths?: string[];
  rules: BrandRenameAllowlistRule[];
  tokens: string[];
};

type BrandRenameResidualModule = {
  classifyFinding: (
    finding: {
      path: string;
      line: number;
      column: number;
      token: string;
      lineText: string;
    },
    allowlist: BrandRenameAllowlist
  ) => {
    class: string;
    reason: string;
    ownerConfirmationRequired: boolean;
    ruleId: string | null;
  };
  loadAllowlist: (path?: string) => Promise<BrandRenameAllowlist>;
  scanResiduals: (options?: {
    root?: string;
    allowlist?: BrandRenameAllowlist;
    allowlistPath?: string;
  }) => Promise<{
    ok: boolean;
    findings: Array<{ path: string; token: string; class: string; ruleId: string | null }>;
    counts: Record<string, number>;
    validationErrors: string[];
  }>;
  validateAllowlist: (allowlist: BrandRenameAllowlist) => string[];
};

const toolModuleUrl = pathToFileURL(
  join(process.cwd(), 'tools/report-brand-rename-residuals.mjs')
).href;
const { classifyFinding, loadAllowlist, scanResiduals, validateAllowlist } = (await import(
  toolModuleUrl
)) as BrandRenameResidualModule;

const legacyVaultToken = ['All', 'In', 'Obsidian'].join('');
const legacyRepoSlugToken = ['Allin', 'OB'].join('');

async function writeFixture(root: string, relativePath: string, content: string) {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

describe('report-brand-rename-residuals', () => {
  it('keeps the source-map token set including AllInObsidian', async () => {
    const allowlist = await loadAllowlist();

    expect(validateAllowlist(allowlist)).toEqual([]);
    expect(allowlist.tokens).toContain(legacyVaultToken);
    expect(allowlist.tokens).toContain(legacyRepoSlugToken);
    expect(allowlist.ignorePaths).toEqual(expect.arrayContaining(['.tmp/**', 'tmp/**']));
  });

  it('fails closed on retired public support channels while keeping repo paths classified', async () => {
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
      class: 'unclassified',
      ownerConfirmationRequired: false,
      ruleId: null
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

    expect(
      classifyFinding(
        {
          path: 'src/onboarding/bootstrap.ts',
          line: 215,
          column: 61,
          token: legacyRepoSlugToken,
          lineText: `await this.navigationRepo.openExternalLink('https://github.com/Lefeaker/${legacyRepoSlugToken}/issues');`
        },
        allowlist
      )
    ).toMatchObject({
      class: 'unclassified',
      ownerConfirmationRequired: false,
      ruleId: null
    });

    expect(
      classifyFinding(
        {
          path: 'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html',
          line: 1567,
          column: 75,
          token: legacyRepoSlugToken,
          lineText: `<a href="https://github.com/Lefeaker/${legacyRepoSlugToken}/issues/new">Feedback</a>`
        },
        allowlist
      )
    ).toMatchObject({
      class: 'frozen-reference',
      ownerConfirmationRequired: false,
      ruleId: 'archive-legacy-options-fixtures'
    });

    expect(
      classifyFinding(
        {
          path: 'docs/reference-fixtures/legacy-options/obsidian-hybrid-preview.html',
          line: 1567,
          column: 75,
          token: legacyRepoSlugToken,
          lineText: `<a href="https://github.com/Lefeaker/${legacyRepoSlugToken}/issues/new">Feedback</a>`
        },
        allowlist
      )
    ).toMatchObject({
      class: 'frozen-reference',
      ownerConfirmationRequired: false,
      ruleId: 'reference-fixtures'
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
        `const fallback = '${legacyVaultToken}';\n`
      );
      await writeFixture(root, 'docs/zh-cn/clipper/旧文档.md', '找到 "All in Ob" 扩展\n');
      await writeFixture(root, 'docs/251126-design-system-poc/old.md', 'darkTheme: "allinob"\n');

      const result = await scanResiduals({ root, allowlist });

      expect(result.ok).toBe(true);
      expect(result.counts['compat-retain-user-data']).toBe(1);
      expect(result.counts['internal-dev-preview']).toBe(1);
      expect(result.counts['historical-doc']).toBe(2);
      expect(result.counts['external-owner-confirmation-required']).toBeUndefined();
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
