import { describe, expect, it } from 'vitest';

type DeepImportFinding = {
  file: string;
  line: number;
  importPath: string;
  kind: string;
};

type ReportDeepImportsModule = {
  collectDeepImportFindings: (
    files: Array<{ file: string; source: string }>
  ) => DeepImportFinding[];
  formatDeepImportFindings: (findings: DeepImportFinding[]) => string;
  hasBlockingDeepImports: (
    findings: DeepImportFinding[],
    allowlist?: Array<{ file: string; importPath: string; reason: string; expiresWhen: string }>
  ) => boolean;
};

const { collectDeepImportFindings, formatDeepImportFindings, hasBlockingDeepImports } =
  (await import(
    // @ts-expect-error Tool modules are executable ESM without .d.ts files.
    '../../../tools/report-deep-imports.mjs'
  )) as ReportDeepImportsModule;

describe('report-deep-imports', () => {
  it('finds three-level relative imports', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/options/components/example.ts',
        source: "import { BaseComponent } from '../../../ui/foundation/lifecycle/BaseComponent';"
      }
    ]);

    expect(findings).toEqual([
      {
        file: 'src/options/components/example.ts',
        line: 1,
        importPath: '../../../ui/foundation/lifecycle/BaseComponent',
        kind: 'static-or-reexport'
      }
    ]);
  });

  it('does not report alias imports', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/options/components/example.ts',
        source: "import { BaseComponent } from '@ui/foundation/lifecycle/BaseComponent';"
      }
    ]);

    expect(findings).toEqual([]);
  });

  it('scans tsx, mts, and cts source records', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/ui/example.tsx',
        source: "import view from '../../../options/app/view';"
      },
      {
        file: 'src/ui/example.mts',
        source: "import data from '../../../options/app/data';"
      },
      {
        file: 'src/ui/example.cts',
        source: "import legacy from '../../../options/app/legacy';"
      }
    ]);

    expect(findings.map((finding) => finding.file)).toEqual([
      'src/ui/example.cts',
      'src/ui/example.mts',
      'src/ui/example.tsx'
    ]);
  });

  it('finds dynamic imports and re-exports', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/options/components/example.ts',
        source: [
          "export { helper } from '../../../ui/helper';",
          "const modulePromise = import('../../../ui/lazy');"
        ].join('\n')
      }
    ]);

    expect(findings).toEqual([
      {
        file: 'src/options/components/example.ts',
        line: 1,
        importPath: '../../../ui/helper',
        kind: 'static-or-reexport'
      },
      {
        file: 'src/options/components/example.ts',
        line: 2,
        importPath: '../../../ui/lazy',
        kind: 'dynamic'
      }
    ]);
  });

  it('formats empty and populated reports', () => {
    expect(formatDeepImportFindings([])).toBe('No deep relative imports found.');
    expect(
      formatDeepImportFindings([
        {
          file: 'src/a.ts',
          line: 2,
          importPath: '../../../b',
          kind: 'static-or-reexport'
        }
      ])
    ).toBe('src/a.ts:2 ../../../b');
  });

  it('does not block allowlisted findings with owner reason and expiration', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/a.ts',
        source: "import { b } from '../../../b';"
      }
    ]);

    expect(
      hasBlockingDeepImports(findings, [
        {
          file: 'src/a.ts',
          importPath: '../../../b',
          reason: 'temporary owner-approved migration',
          expiresWhen: 'delete after shared helper lands'
        }
      ])
    ).toBe(false);
  });

  it('blocks non-allowlisted findings', () => {
    const findings = collectDeepImportFindings([
      {
        file: 'src/a.ts',
        source: "import { b } from '../../../b';"
      }
    ]);

    expect(hasBlockingDeepImports(findings)).toBe(true);
    expect(
      hasBlockingDeepImports(findings, [
        {
          file: 'src/a.ts',
          importPath: '../../../b',
          reason: '',
          expiresWhen: 'missing reason keeps this blocking'
        }
      ])
    ).toBe(true);
  });
});
