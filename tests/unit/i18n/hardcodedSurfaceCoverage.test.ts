import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CoverageEvidence {
  file: string;
  includes: string[];
}

interface SurfaceCoverage {
  milestone: string;
  surface: string;
  proves: string;
  evidence: CoverageEvidence[];
}

const COVERAGE: SurfaceCoverage[] = [
  {
    milestone: 'P03',
    surface: 'support prompt progress and descriptor failure copy',
    proves: 'support prompt progress and failures resolve catalog keys instead of legacy strings',
    evidence: [
      {
        file: 'tests/unit/content/SupportPrompt.test.ts',
        includes: [
          'supportPromptStatusWarningWithReason',
          'prefers descriptor-based failure copy over legacy error strings',
          'renders shared rest errors through descriptor-based failure copy'
        ]
      }
    ]
  },
  {
    milestone: 'P04',
    surface: 'local vault permission frame and iframe title',
    proves: 'permission UI renders localized copy and iframe metadata through resolved messages',
    evidence: [
      {
        file: 'tests/unit/content/localVaultPermissionFrame.test.ts',
        includes: [
          'renders English copy without CJK and uses the localized folder fallback',
          'localizes the iframe title and passes the resolved language to the permission page'
        ]
      }
    ]
  },
  {
    milestone: 'P05',
    surface: 'background connection result descriptor payloads',
    proves: 'background connection checks serialize message descriptors across response boundaries',
    evidence: [
      {
        file: 'tests/unit/background/connectionTester.test.ts',
        includes: [
          'preserves top-level and channel descriptors when the response is valid',
          'rejects malformed top-level or channel descriptors as invalid responses'
        ]
      },
      {
        file: 'tests/unit/background/runtimeMessages.test.ts',
        includes: ['returns fallback responses for connection test failures', 'messageDescriptor']
      }
    ]
  },
  {
    milestone: 'P05',
    surface: 'Options connection renderer localized channel rows',
    proves:
      'Options resolves channel descriptors with the active catalog before rendering status rows',
    evidence: [
      {
        file: 'tests/unit/options/productionStitchShell.storageI18n.test.ts',
        includes: [
          'resolves localized storage fallback messages without Chinese defaults',
          'connectionLocalFolderNotConfigured',
          'connectionRestUrlMissing'
        ]
      },
      {
        file: 'tests/unit/options/vaultConnectionTests.test.ts',
        includes: ['messageDescriptor', 'schemaStorageNoEnabledVaults']
      }
    ]
  },
  {
    milestone: 'P06',
    surface: 'shared AppError descriptor serialization',
    proves:
      'shared errors keep typed user message descriptors without requiring legacy userMessage text',
    evidence: [
      {
        file: 'tests/unit/shared/errorHandler.test.ts',
        includes: [
          'preserves descriptor-based user messages during serialization without requiring legacy userMessage',
          'userMessageDescriptor'
        ]
      },
      {
        file: 'tests/unit/shared/errors/contentErrors.test.ts',
        includes: ['errorContentStorageOperationFailed', 'userMessageDescriptor']
      }
    ]
  },
  {
    milestone: 'P07',
    surface: 'diagnostics reports',
    proves:
      'diagnostics output is English no-CJK under English messages and catalog-backed under zh-CN',
    evidence: [
      {
        file: 'tests/unit/options/diagnostics.test.ts',
        includes: [
          'renders diagnostic output from controller snapshots',
          'expect(output?.textContent).not.toMatch(HAN_REGEX)',
          'renders zh-CN diagnostics text from the active catalog messages'
        ]
      }
    ]
  },
  {
    milestone: 'P08',
    surface: 'onboarding static shell and support modal',
    proves:
      'onboarding document metadata and support modal copy resolve from onboarding runtime resources',
    evidence: [
      {
        file: 'tests/unit/onboarding/bootstrap.test.ts',
        includes: [
          'sets document lang and title from the active onboarding runtime resource',
          'renders the support modal from onboarding catalog messages',
          'uses English-only support modal fallback before onboarding messages are available'
        ]
      }
    ]
  },
  {
    milestone: 'P09',
    surface: 'exported Markdown fragment comment heading',
    proves:
      'fragment comment headings are caller-supplied localized strings, never implicit Chinese fallback text',
    evidence: [
      {
        file: 'tests/unit/content/fragmentBuilder.test.ts',
        includes: [
          'throws when plain markdown comment heading is missing',
          'uses the provided localized comment heading when supplied',
          'Missing fragment comment heading',
          'expect(markdown).not.toContain'
        ]
      }
    ]
  },
  {
    milestone: 'P10',
    surface: 'trial notice UI',
    proves: 'trial notices render English without CJK and zh-CN from catalog-backed modal copy',
    evidence: [
      {
        file: 'tests/unit/components/trialNotice.test.ts',
        includes: [
          'renders English $name notices without CJK',
          "expect(element.textContent ?? '').not.toMatch(CJK_REGEX)",
          'renders zh-CN catalog-backed notice and modal copy'
        ]
      }
    ]
  },
  {
    milestone: 'P10',
    surface: 'trial notifications and summaries',
    proves:
      'trial manager notification text and date summaries are localized without English-mode CJK',
    evidence: [
      {
        file: 'tests/unit/shared/trialManager.test.ts',
        includes: [
          'localizes notifications and summaries in English without CJK',
          'renders catalog-backed zh-CN notifications and summaries',
          'expect(summary).not.toMatch(CJK_REGEX)'
        ]
      }
    ]
  },
  {
    milestone: 'P11',
    surface: 'retained changelog compatibility fallback',
    proves: 'legacy changelog compatibility keeps Chinese resources scoped to zh-CN only',
    evidence: [
      {
        file: 'tests/unit/options/changelogContent.test.ts',
        includes: [
          'falls back to English for unsupported non-Chinese languages',
          'keeps the Chinese changelog only for zh-CN'
        ]
      }
    ]
  },
  {
    milestone: 'P11',
    surface: 'vault default name compatibility fallback',
    proves: 'default vault fallback resolution is isolated to vault store behavior',
    evidence: [
      {
        file: 'tests/unit/options/vaultRouterStore.test.ts',
        includes: ['resets state and applies fallback default vault resolution']
      }
    ]
  },
  {
    milestone: 'P12',
    surface: 'hardcoded user-copy audit samples',
    proves:
      'audit tooling detects production literals, translation fallbacks, descriptor-boundary regressions, and stale allowlists',
    evidence: [
      {
        file: 'tests/unit/scripts/i18nHardcodedUserCopyAudit.test.ts',
        includes: [
          'flags production Chinese UI literals in source files',
          'flags Chinese translation fallback arguments',
          'flags descriptor-boundary payload regressions without descriptor siblings',
          'fails on stale allowlist entries'
        ]
      }
    ]
  },
  {
    milestone: 'P12',
    surface: 'hardcoded user-copy audit production tree gate',
    proves: 'the audit has a real-tree check and a package script hard gate',
    evidence: [
      {
        file: 'tests/unit/scripts/i18nHardcodedUserCopyAudit.test.ts',
        includes: [
          'produces explainable current-tree output',
          'has no unexpected legacy-user-message-fallback findings in the current tree'
        ]
      },
      {
        file: 'package.json',
        includes: ['audit:i18n-hardcoded-user-copy:check']
      }
    ]
  },
  {
    milestone: 'P16',
    surface: 'Options and Stitch settings panels',
    proves:
      'all production settings panels render catalog-backed English copy without residual CJK',
    evidence: [
      {
        file: 'tests/unit/options/productionStitchShell.i18nCoverage.test.ts',
        includes: [
          'keeps all six settings panels free of residual Chinese outside language options in English mode',
          'keeps production settings panels free of Chinese when selected catalog keys are missing'
        ]
      }
    ]
  },
  {
    milestone: 'P16',
    surface: 'Options resource modals and runtime surfaces',
    proves:
      'resource modals and runtime preview surfaces use catalog defaults when messages are missing',
    evidence: [
      {
        file: 'tests/unit/options/productionStitchShell.i18nCoverage.test.ts',
        includes: [
          'keeps every resource modal free of residual Chinese in English mode',
          'keeps every runtime surface preview free of residual Chinese in English mode',
          'keeps production overview, privacy resource, and reader surface catalog-backed when messages is null'
        ]
      }
    ]
  },
  {
    milestone: 'P17',
    surface: 'changelog resource catalogization',
    proves:
      'production changelog resources ignore raw appData and fall back through English catalog copy',
    evidence: [
      {
        file: 'tests/unit/options/productionStitchShell.resourcesI18n.test.ts',
        includes: [
          'renders zh-CN changelog copy from the active catalog instead of raw appData text',
          'falls back to English resource copy when selected catalog keys are missing',
          'RAW CHANGELOG TITLE SENTINEL'
        ]
      }
    ]
  },
  {
    milestone: 'P18',
    surface: 'shared AppError descriptor factories',
    proves: 'the full shared factory set emits descriptor-backed user messages',
    evidence: [
      {
        file: 'tests/unit/shared/errors/userMessageDescriptorFactories.test.ts',
        includes: [
          'emits descriptor-backed user messages for the full P18 factory set',
          'expect(error.userMessageDescriptor).toEqual({ key })'
        ]
      },
      {
        file: 'tests/unit/options/connectionTestRunner.test.ts',
        includes: [
          'renders descriptor-backed shared options errors without falling back to legacy userMessage copy'
        ]
      }
    ]
  },
  {
    milestone: 'P19',
    surface: 'vault, config, and storage fallback descriptors',
    proves: 'storage fallback copy resolves from descriptors and localized no-vault messages',
    evidence: [
      {
        file: 'tests/unit/options/productionStitchShell.storageI18n.test.ts',
        includes: [
          'uses the localized no-enabled-vaults fallback',
          'schemaStorageNoEnabledVaults',
          'errorDescriptor'
        ]
      }
    ]
  },
  {
    milestone: 'P19',
    surface: 'schema catalog defaults',
    proves:
      'schema translators and generated schema catalogs provide catalog-backed defaults without handwritten locale facades',
    evidence: [
      {
        file: 'tests/unit/options/schemaContextI18n.test.ts',
        includes: [
          'returns the default English catalog when messages are missing',
          'returns the catalog-backed message when one exists'
        ]
      },
      {
        file: 'tests/unit/options/schemaI18nParity.test.ts',
        includes: [
          'publishes representative P03-P13 schema keys through the shell catalog and page-message merge path',
          'keeps Stitch registry free of previous schema-shell hardcoded sentences'
        ]
      }
    ]
  },
  {
    milestone: 'P20',
    surface: 'content runtime Clipper, Stitch, and export-destination fallbacks',
    proves:
      'content runtime compatibility defaults are non-Chinese and do not synthesize user-visible labels',
    evidence: [
      {
        file: 'tests/unit/content/runtimeSurfaceContent.test.ts',
        includes: ['uses non-Chinese compatibility defaults for renderer labels']
      },
      {
        file: 'tests/unit/content/exportDestinationDom.test.ts',
        includes: [
          'preserves an existing localized setup link label while updating the href',
          'returns false instead of synthesizing a new setup link label'
        ]
      }
    ]
  },
  {
    milestone: 'P21',
    surface: 'AI chat fallback titles',
    proves:
      'AI chat extraction requires localized fallback titles and supplies neutral product titles for product-native fallbacks',
    evidence: [
      {
        file: 'tests/unit/content/aiChatExtractor.test.ts',
        includes: [
          'fails fast when a required localized fallback title is missing',
          'injects English-neutral fallback titles for Doubao and Monica exports',
          'fallbackTitle'
        ]
      }
    ]
  },
  {
    milestone: 'P21',
    surface: 'AI parser site-native token classification',
    proves:
      'parser logic narrowly strips site-native role tokens while preserving user-provided Chinese content',
    evidence: [
      {
        file: 'tests/unit/third_party/parsers.test.ts',
        includes: ['strips native Chinese ChatGPT role labels without changing message roles']
      },
      {
        file: 'tests/unit/third_party/kimi.test.ts',
        includes: ['preserves user-provided Chinese titles instead of replacing them']
      },
      {
        file: 'tests/unit/third_party/tongyi.test.ts',
        includes: ['preserves user-provided Chinese question titles instead of replacing them']
      },
      {
        file: 'tests/unit/third_party/deepseek.test.ts',
        includes: ['preserves user-provided Chinese titles instead of replacing them']
      }
    ]
  },
  {
    milestone: 'P22',
    surface: 'hardcoded audit hard gate',
    proves: 'quality runs the hardcoded user-copy audit hard gate',
    evidence: [
      {
        file: 'package.json',
        includes: ['audit:i18n-hardcoded-user-copy:check', 'quality']
      }
    ]
  }
] as const;

const expectedMilestones = [
  'P03',
  'P04',
  'P05',
  'P06',
  'P07',
  'P08',
  'P09',
  'P10',
  'P11',
  'P12',
  'P16',
  'P17',
  'P18',
  'P19',
  'P20',
  'P21',
  'P22'
] as const;

const cjkRegex = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('hardcoded user-copy migrated surface coverage', () => {
  it('keeps every migrated milestone mapped to executable regression evidence', () => {
    const missingEvidence: string[] = [];

    for (const row of COVERAGE) {
      for (const evidence of row.evidence) {
        const absolutePath = join(process.cwd(), evidence.file);
        if (!existsSync(absolutePath)) {
          missingEvidence.push(`${row.milestone} ${row.surface}: missing ${evidence.file}`);
          continue;
        }

        const source = readRepoFile(evidence.file);
        for (const expected of evidence.includes) {
          if (!source.includes(expected)) {
            missingEvidence.push(
              `${row.milestone} ${row.surface}: ${evidence.file} lacks ${expected}`
            );
          }
        }
      }
    }

    expect(missingEvidence).toEqual([]);
  });

  it('covers the full post-migration milestone set without embedding new CJK literals', () => {
    const coveredMilestones = new Set(COVERAGE.map((row) => row.milestone));

    expect([...coveredMilestones].sort()).toEqual([...expectedMilestones].sort());
    expect(COVERAGE).toHaveLength(24);
    expect(JSON.stringify(COVERAGE)).not.toMatch(cjkRegex);
  });
});
