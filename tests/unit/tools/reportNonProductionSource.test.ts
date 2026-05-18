import { describe, expect, it } from 'vitest';

type NonProductionSourceModule = {
  classifySourceFile: (input: Record<string, unknown>) => {
    decision: string;
    requiredAction: string;
    owner?: string;
    deletionCondition?: string;
  };
  formatNonProductionSourceReport: (rows: Array<Record<string, unknown>>) => string;
  validateNonProductionSourceCheck: (rows: Array<Record<string, unknown>>) => {
    ok: boolean;
    violations: Array<{ file: string; reason: string }>;
  };
};

const { classifySourceFile, formatNonProductionSourceReport, validateNonProductionSourceCheck } =
  (await import(
    // @ts-expect-error Tool modules are authored as executable ESM without .d.ts files.
    '../../../tools/report-non-production-source.mjs'
  )) as NonProductionSourceModule;

const approvedPostTestDeleteCandidate = [
  'src',
  'options',
  'components',
  'layout',
  'Navigation.ts'
].join('/');
const approvedPostWidgetDeleteCandidate = ['src', 'options', 'widgets', 'UsageWidget.ts'].join('/');
const approvedReadingVideoDeleteCandidate = [
  'src',
  'options',
  'widgets',
  'ReadingSettingsWidget.ts'
].join('/');
const approvedFamilyWidgetDeleteCandidate = ['src', 'options', 'widgets', 'PrivacyWidget.ts'].join(
  '/'
);
const approvedFormSectionDeleteCandidate = [
  'src',
  'options',
  'components',
  'formSections',
  'formSectionManager.ts'
].join('/');
const approvedUtilsDefaultsDeleteCandidate = ['src', 'options', 'utils', 'defaults.ts'].join('/');
const approvedOptionsAppDeleteCandidate = [
  'src',
  'options',
  'components',
  'layout',
  'OptionsApp.ts'
].join('/');

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

  it('supports exact retained classifications for completion-audit source contracts', () => {
    const retainedContracts: Array<{
      pattern: string;
      owner: string;
      testOwners?: string[];
      scriptOwners?: string[];
      publicAssetOwners?: string[];
    }> = [
      {
        pattern: 'src/components/trial-notice.ts',
        owner: 'trial notice documented UI contract',
        testOwners: ['tests/unit/components/trialNotice.test.ts']
      },
      {
        pattern: 'src/content/clipper/shared/styleManager.ts',
        owner: 'clipper inline style manager documented contract',
        testOwners: ['tests/unit/content/styleManager.test.ts']
      },
      {
        pattern: 'src/env.d.ts',
        owner: 'TypeScript build and audit global declaration contract',
        scriptOwners: ['tools/report-ui-architecture-alignment.mjs']
      },
      {
        pattern: 'src/options/stitch/runtime/actions.ts',
        owner: 'Stitch runtime action id contract',
        testOwners: ['tests/unit/options/stitchSharedRegistry.test.ts']
      },
      {
        pattern: 'src/options/stitch/styles/variants/stitch-secondary.css',
        owner: 'Stitch Secondary static style asset contract',
        publicAssetOwners: ['public/content-orchestrator-harness.html']
      },
      {
        pattern: 'src/styles/clipper/highlight-themes.css',
        owner: 'reader and video highlight theme build asset contract',
        scriptOwners: ['scripts/build.mjs']
      },
      {
        pattern: 'src/styles/design-tokens.css',
        owner: 'design token source-of-truth asset',
        scriptOwners: ['scripts/build.mjs']
      },
      {
        pattern: 'src/ui/foundation/tokens/index.ts',
        owner: 'design token metadata source contract',
        scriptOwners: ['tools/report-design-system-doc.mjs']
      }
    ];

    for (const contract of retainedContracts) {
      const result = classifySourceFile(
        input({
          file: contract.pattern,
          testOwners: contract.testOwners ?? [],
          scriptOwners: contract.scriptOwners ?? [],
          publicAssetOwners: contract.publicAssetOwners ?? [],
          explicitClassificationPatterns: [
            {
              pattern: contract.pattern,
              decision: 'retain-production-facade',
              owner: contract.owner,
              deletionCondition: 'delete only after owner-approved migration or six-proof deletion'
            }
          ]
        })
      );

      expect(result.decision).toBe('retain-production-facade');
      expect(result.owner).toBe(contract.owner);
    }
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
        file: approvedPostTestDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'unknown',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('stop-unknown');
    expect(result.requiredAction).toContain('six owner proofs');
  });

  it('marks explicit unowned source as delete-now only after all six proofs are empty', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostTestDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('delete-now');
  });

  it('marks exact owner-approved post-widget candidates as delete-now after all six proofs are empty', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostWidgetDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedPostWidgetDeleteCandidate]
      })
    );

    expect(result.decision).toBe('delete-now');
    expect(result.requiredAction).toContain('planned deletion milestone');
  });

  it('marks exact reading and video widget candidates as delete-now after all six proofs are empty', () => {
    const result = classifySourceFile(
      input({
        file: approvedReadingVideoDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedReadingVideoDeleteCandidate]
      })
    );

    expect(result.decision).toBe('delete-now');
  });

  it('marks exact family widget candidates as delete-now after all six proofs are empty', () => {
    const result = classifySourceFile(
      input({
        file: approvedFamilyWidgetDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedFamilyWidgetDeleteCandidate]
      })
    );

    expect(result.decision).toBe('delete-now');
  });

  it('keeps exact post-test-delete candidates out of delete-now when any proof is non-empty', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostTestDeleteCandidate,
        scriptOwners: ['tools/report-ui-architecture-alignment.mjs'],
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-script-owner');
  });

  it('does not mark unapproved unowned source as delete-now', () => {
    const result = classifySourceFile(
      input({
        file: 'src/options/components/layout/UnapprovedLegacyShell.ts',
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('stop-unknown');
  });

  it('does not accept broad delete-now directory patterns', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostTestDeleteCandidate,
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: ['src/options/components/**']
      })
    );

    expect(result.decision).toBe('stop-unknown');
  });

  it('does not treat retained test owners as delete-now even for approved candidates', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostTestDeleteCandidate,
        testOwners: ['tests/unit/options/layout/Navigation.retainedLegacyCoverage.test.ts'],
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-test-owner');
  });

  it('does not classify formSectionManager as delete-now while retained source imports it', () => {
    const result = classifySourceFile(
      input({
        file: approvedFormSectionDeleteCandidate,
        retainedSourceImportOwners: [
          'src/options/components/layout/MainContent.ts',
          'src/options/components/sections/BaseSection.ts',
          'src/options/components/sections/FragmentSectionView.ts',
          'src/options/components/sections/restSectionRuntime.ts',
          'src/options/components/sections/RoutingSection.ts',
          'src/options/components/sections/YamlConfigSection.ts'
        ],
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedFormSectionDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-import-owner');
    expect(result.owner).toContain('retained source import');
  });

  it('does not classify defaults as delete-now while re-exported by a retained source barrel', () => {
    const result = classifySourceFile(
      input({
        file: approvedUtilsDefaultsDeleteCandidate,
        retainedSourceImportOwners: ['src/options/utils/index.ts'],
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedUtilsDefaultsDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-import-owner');
    expect(result.deletionCondition).toContain('re-exports');
  });

  it('does not classify layout and section files as delete-now while retained source imports remain', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostTestDeleteCandidate,
        retainedSourceImportOwners: ['src/options/components/layout/MainContent.ts'],
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedPostTestDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-import-owner');
  });

  it('does not classify OptionsApp as delete-now while it imports retained source dependencies', () => {
    const result = classifySourceFile(
      input({
        file: approvedOptionsAppDeleteCandidate,
        retainedSourceImportTargets: [
          'src/options/components/layout/MainContent.ts',
          'src/options/components/layout/Navigation.ts',
          'src/options/components/layout/NavigationController.ts',
          'src/options/components/layout/Sidebar.ts'
        ],
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        explicitDeleteNowPatterns: [approvedOptionsAppDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-import-owner');
    expect(result.deletionCondition).toContain('dependencies');
  });

  it('does not treat retained test owners as delete-now for approved post-widget candidates', () => {
    const result = classifySourceFile(
      input({
        file: approvedPostWidgetDeleteCandidate,
        testOwners: ['tests/unit/options/UsageWidget.retainedLegacyCoverage.test.ts'],
        explicitDeleteNowPatterns: [approvedPostWidgetDeleteCandidate]
      })
    );

    expect(result.decision).toBe('migrate-test-owner');
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

  it('keeps report mode inventory visible for migration rows', () => {
    const report = formatNonProductionSourceReport([
      classifySourceFile(
        input({ retainedSourceImportOwners: ['src/options/components/layout/MainContent.ts'] })
      ),
      classifySourceFile(input({ scriptOwners: ['tools/report-ui-architecture-alignment.mjs'] })),
      classifySourceFile(input({ testOwners: ['tests/unit/options/example.test.ts'] }))
    ]);

    expect(report).toContain('migrate-import-owner');
    expect(report).toContain('migrate-script-owner');
    expect(report).toContain('migrate-test-owner');
  });

  it('passes check mode for migrate and retain inventory without stop-unknown or delete-now', () => {
    const rows = [
      classifySourceFile(
        input({ retainedSourceImportOwners: ['src/options/components/layout/MainContent.ts'] })
      ),
      classifySourceFile(input({ scriptOwners: ['tools/report-ui-architecture-alignment.mjs'] })),
      classifySourceFile(input({ testOwners: ['tests/unit/options/example.test.ts'] })),
      classifySourceFile(
        input({
          productionBuildGraphOwners: ['options/index'],
          productionImportOwners: ['src/options/app/bootstrap.ts']
        })
      ),
      classifySourceFile(
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
      )
    ];

    expect(validateNonProductionSourceCheck(rows).ok).toBe(true);
  });

  it('fails check mode for stop-unknown rows', () => {
    const result = validateNonProductionSourceCheck([
      classifySourceFile(input({ file: 'src/unknown/unused.ts' }))
    ]);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toContain('stop-unknown');
  });

  it('fails check mode when delete-now coexists with retained import graph owners', () => {
    const result = validateNonProductionSourceCheck([
      {
        file: approvedOptionsAppDeleteCandidate,
        decision: 'delete-now',
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'empty',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'empty',
          requiredVerification: 'empty'
        },
        retainedSourceImportTargets: ['src/options/components/layout/MainContent.ts']
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toContain('retained source import');
  });

  it('fails check mode for delete-now rows with non-empty owner proofs', () => {
    const result = validateNonProductionSourceCheck([
      {
        file: approvedPostTestDeleteCandidate,
        decision: 'delete-now',
        ownerProofs: {
          productionBuildGraph: 'empty',
          importGraph: 'empty',
          packageBuildScripts: 'owned',
          publicManifestAssets: 'empty',
          testsVisualBrowser: 'owned',
          requiredVerification: 'owned'
        },
        scriptOwners: ['tools/report-ui-architecture-alignment.mjs'],
        testOwners: ['tests/unit/options/layout/Navigation.test.ts'],
        requiredVerificationOwners: ['package.json#scripts.quality']
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toContain('packageBuildScripts');
    expect(result.violations[0]?.reason).toContain('testsVisualBrowser');
    expect(result.violations[0]?.reason).toContain('requiredVerification');
  });
});
