import { describe, expect, it } from 'vitest';

type NonProductionSourceModule = {
  classifySourceFile: (input: Record<string, unknown>) => {
    decision: string;
    requiredAction: string;
    owner?: string;
    deletionCondition?: string;
  };
  formatNonProductionSourceReport: (rows: Array<Record<string, unknown>>) => string;
};

const { classifySourceFile, formatNonProductionSourceReport } = (await import(
  // @ts-expect-error Tool modules are authored as executable ESM without .d.ts files.
  '../../../tools/report-non-production-source.mjs'
)) as NonProductionSourceModule;

function input(overrides: Record<string, unknown> = {}) {
  return {
    file: 'src/options/widgets/ExampleWidget.ts',
    productionBuildGraphOwners: [],
    productionImportOwners: [],
    testOwners: [],
    scriptOwners: [],
    publicAssetOwners: [],
    requiredVerificationOwners: [],
    explicitRetainPatterns: [],
    explicitClassificationPatterns: [],
    explicitDeleteNowPatterns: [],
    ...overrides
  };
}

describe('report-non-production-source', () => {
  it('marks source with production build ownership as retain-production', () => {
    expect(
      classifySourceFile(
        input({
          productionBuildGraphOwners: ['options/index'],
          productionImportOwners: ['src/options/app/bootstrap.ts']
        })
      ).decision
    ).toBe('retain-production');
  });

  it('marks source owned only by tests as migrate-test-owner', () => {
    const result = classifySourceFile(
      input({
        testOwners: ['tests/unit/options/legacyWidget.test.ts']
      })
    );

    expect(result.decision).toBe('migrate-test-owner');
    expect(result.owner).toContain('test');
    expect(result.requiredAction).toContain('Move behavior coverage');
  });

  it('uses explicit retained facade rules with owner and deletion condition', () => {
    const result = classifySourceFile(
      input({
        file: 'src/ui/domains/theme/index.ts',
        explicitClassificationPatterns: [
          {
            pattern: 'src/ui/domains/theme/index.ts',
            decision: 'retain-production-facade',
            owner: 'theme domain public barrel',
            deletionCondition: 'delete only after public imports move to concrete theme module'
          }
        ]
      })
    );

    expect(result.decision).toBe('retain-production-facade');
    expect(result.owner).toBe('theme domain public barrel');
    expect(result.deletionCondition).toContain('public imports');
  });

  it('uses explicit migration rules without making unknown files pass by default', () => {
    const result = classifySourceFile(
      input({
        file: 'src/options/components/sections/restSectionRuntime.ts',
        explicitClassificationPatterns: [
          {
            pattern: 'src/options/components/sections/restSection*.ts',
            decision: 'migrate-test-owner',
            owner: 'legacy REST section helper retained by old section tests',
            deletionCondition: 'delete after REST behavior is covered by production Stitch tests'
          }
        ]
      })
    );

    expect(result.decision).toBe('migrate-test-owner');
    expect(result.owner).toContain('legacy REST');
    expect(classifySourceFile(input({ file: 'src/unknown/unused.ts' })).decision).toBe(
      'stop-unknown'
    );
  });

  it('matches explicit brace classification patterns without broadening ownership', () => {
    const result = classifySourceFile(
      input({
        file: 'src/content/reader/styles.ts',
        explicitClassificationPatterns: [
          {
            pattern: 'src/content/reader/{highlightController,sessionExportUtils,styles,types}.ts',
            decision: 'retain-production-facade',
            owner: 'reader runtime compatibility contract',
            deletionCondition: 'delete only after reader runtime imports migrate'
          }
        ]
      })
    );

    expect(result.decision).toBe('retain-production-facade');
    expect(result.owner).toContain('reader runtime');
    expect(
      classifySourceFile(
        input({
          file: 'src/content/reader/unrelated.ts',
          explicitClassificationPatterns: [
            {
              pattern:
                'src/content/reader/{highlightController,sessionExportUtils,styles,types}.ts',
              decision: 'retain-production-facade',
              owner: 'reader runtime compatibility contract',
              deletionCondition: 'delete only after reader runtime imports migrate'
            }
          ]
        })
      ).decision
    ).toBe('stop-unknown');
  });

  it('does not allow delete-now when one owner proof is unknown', () => {
    const result = classifySourceFile(
      input({
        file: 'src/options/preview/runtime.ts',
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'unknown',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: ['src/options/preview/**']
      })
    );

    expect(result.decision).toBe('stop-unknown');
    expect(result.requiredAction).toContain('six owner proofs');
  });

  it('marks explicit unowned source as delete-now only after all six proofs are empty', () => {
    const result = classifySourceFile(
      input({
        file: 'src/options/preview/runtime.ts',
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: ['src/options/preview/**']
      })
    );

    expect(result.decision).toBe('delete-now');
  });

  it('fails unknown source outside production build graph closed', () => {
    const result = classifySourceFile(input({ file: 'src/unknown/unused.ts' }));

    expect(result.decision).toBe('stop-unknown');
    expect(result.requiredAction).toContain('Classify ownership');
  });

  it('formats a report with stable headings', () => {
    const report = formatNonProductionSourceReport([
      classifySourceFile(input({ testOwners: ['tests/unit/options/example.test.ts'] }))
    ]);

    expect(report).toContain('Non-Production Source Ownership Report');
    expect(report).toContain('Owner');
    expect(report).toContain('Deletion condition');
    expect(report).toContain('migrate-test-owner');
    expect(report).toContain('src/options/widgets/ExampleWidget.ts');
  });
});
