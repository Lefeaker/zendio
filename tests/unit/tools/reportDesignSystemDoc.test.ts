import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-design-system-doc.mjs');

function writeFile(root: string, path: string, content = ''): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function writeFixture(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'aiiinob-design-doc-'));
  const requiredRefs = [
    'src/ui/foundation/tokens/index.ts',
    'src/ui/foundation/icons/index.ts',
    'src/ui/primitives/button/index.ts',
    'src/ui/primitives/layout/index.ts',
    'src/ui/patterns/section-shell/index.ts',
    'src/ui/hosts/shadow/index.ts',
    'src/ui/domains/vault-router/index.ts',
    'docs/archive/legacy-options-assets/obsidian-hybrid-preview.html'
  ];
  for (const ref of requiredRefs) {
    writeFile(root, ref);
  }

  writeFile(
    root,
    'docs/design-system-governance.md',
    [
      '# 设计系统治理基线',
      '## 1. 当前正式入口',
      ...requiredRefs.map((ref) => `- \`${ref}\``),
      '## 2. 组件分层规则',
      '## 3. 命名与交互现状',
      '## 4. 样式与 Token 真值',
      'Historical Tailwind and DaisyUI notes are retired archive-only references, not active guidance.',
      '## 5. 迁移期兼容层与归档资产',
      'legacy wrapper',
      'legacy-options-assets',
      '## 6. 持续守门',
      'audit:ui-architecture:report',
      'lucide'
    ].join('\n')
  );
  writeFile(root, 'AGENTS.md', 'Tailwind / DaisyUI are historical migration references only.\n');
  writeFile(root, 'README.md', 'Stitch runtime CSS is the current production style path.\n');
  writeFile(root, '.github/PULL_REQUEST_TEMPLATE.md', '- [ ] npm run quality\n');
  writeFile(root, 'src/options/README.md', 'Stitch runtime CSS owns Options styles.\n');
  writeFile(
    root,
    'src/options/components/README.md',
    'Stitch/runtime owners are production truth.\n'
  );

  for (const [path, content] of Object.entries(overrides)) {
    writeFile(root, path, content);
  }

  return root;
}

function runReport(root: string): string {
  return execFileSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, AIIOB_DESIGN_SYSTEM_DOC_ROOT: root }
  });
}

function expectReportFailure(root: string, expected: string): void {
  try {
    runReport(root);
  } catch (error) {
    const stdout =
      typeof error === 'object' && error !== null && 'stdout' in error ? error.stdout : '';
    expect(String(stdout)).toContain(expected);
    return;
  }
  throw new Error('Expected design-system documentation report to fail');
}

describe('design system documentation report', () => {
  it('fails on active DaisyUI guidance', () => {
    const root = writeFixture({
      'docs/current-style.md': 'Use DaisyUI for new Options components.\n'
    });
    try {
      expectReportFailure(root, 'Stale current-style guidance');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on active Tailwind baseline requirements', () => {
    const root = writeFixture({
      '.github/PULL_REQUEST_TEMPLATE.md': '- [ ] attach tmp/tailwind-baseline/*.log\n'
    });
    try {
      expectReportFailure(root, 'tailwind-baseline');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows archive-only historical wording', () => {
    const root = writeFixture({
      'docs/archive/old-style.md': 'Use DaisyUI for archived migration notes.\n'
    });
    try {
      expect(runReport(root)).toContain('Stale current-style guidance findings: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat top-level Options refresh logs as archive-only docs', () => {
    const root = writeFixture({
      'docs/options-doc-refresh-log.md': 'Use DaisyUI for new Options components.\n'
    });
    try {
      expectReportFailure(root, 'docs/options-doc-refresh-log.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores git-ignored local process archives when scanning active guidance', () => {
    const root = writeFixture({
      '.gitignore': 'docs/local-process-archive/\n',
      'docs/local-process-archive/current-style.md': 'Use DaisyUI for new Options components.\n'
    });
    try {
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
      expect(runReport(root)).toContain('Stale current-style guidance findings: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows Stitch runtime CSS current-truth wording', () => {
    const root = writeFixture({
      'docs/current-style.md':
        'Stitch runtime CSS and design tokens are the production style path.\n'
    });
    try {
      expect(runReport(root)).toContain('Stale current-style guidance findings: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores source aliases in TypeScript files', () => {
    const root = writeFixture({
      'src/options/components/Example.ts':
        "import { UiButton as DaisyButton } from '@ui/primitives/button';\n"
    });
    try {
      expect(runReport(root)).toContain('Stale current-style guidance findings: 0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on active Daisy guidance in options component docs', () => {
    const root = writeFixture({
      'src/options/components/README.md': 'Import DaisyButton for new settings sections.\n'
    });
    try {
      expectReportFailure(root, 'src/options/components/README.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
