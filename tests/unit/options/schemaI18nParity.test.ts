import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '@i18n/generated/locales/de.generated';
import en from '@i18n/generated/locales/en.generated';
import es419 from '@i18n/generated/locales/es-419.generated';
import esES from '@i18n/generated/locales/es-ES.generated';
import fr from '@i18n/generated/locales/fr.generated';
import itLocale from '@i18n/generated/locales/it.generated';
import ja from '@i18n/generated/locales/ja.generated';
import ko from '@i18n/generated/locales/ko.generated';
import ptBR from '@i18n/generated/locales/pt-BR.generated';
import ru from '@i18n/generated/locales/ru.generated';
import zhCN from '@i18n/generated/locales/zh-CN.generated';
import zhTW from '@i18n/generated/locales/zh-TW.generated';
import { getMessagesForLanguage } from '@i18n';
import {
  schemaShellMessagesDe,
  schemaShellMessagesEn,
  schemaShellMessagesEnglish,
  schemaShellMessagesEs419,
  schemaShellMessagesEsEs,
  schemaShellMessagesFr,
  schemaShellMessagesIt,
  schemaShellMessagesJa,
  schemaShellMessagesKo,
  schemaShellMessagesPtBr,
  schemaShellMessagesRu,
  schemaShellMessagesZhHans,
  schemaShellMessagesZhHant
} from '@i18n/generated/schemaMessages.generated';

describe('schema i18n parity', () => {
  it('removes legacy handwritten locale and schema-shell facades', () => {
    const localesDir = resolve(process.cwd(), 'src/i18n/locales');
    const localeFiles = existsSync(localesDir)
      ? readdirSync(localesDir).filter((file) => file.endsWith('.ts'))
      : [];

    expect(localeFiles).toEqual([]);
    expect(existsSync(resolve(process.cwd(), 'src/i18n/schemaShellMessages.ts'))).toBe(false);
  });

  it('keeps generated schema catalogs aligned with the English keyset', () => {
    const englishKeys = Object.keys(schemaShellMessagesEnglish).sort();
    const generatedShellExports = [
      schemaShellMessagesEn,
      schemaShellMessagesEnglish,
      schemaShellMessagesZhHans,
      schemaShellMessagesDe,
      schemaShellMessagesEs419,
      schemaShellMessagesEsEs,
      schemaShellMessagesFr,
      schemaShellMessagesIt,
      schemaShellMessagesJa,
      schemaShellMessagesKo,
      schemaShellMessagesPtBr,
      schemaShellMessagesRu,
      schemaShellMessagesZhHant
    ];

    generatedShellExports.forEach((shellMessages) => {
      expect(Object.keys(shellMessages).sort()).toEqual(englishKeys);
    });

    [
      schemaShellMessagesZhHans,
      schemaShellMessagesDe,
      schemaShellMessagesEs419,
      schemaShellMessagesEsEs,
      schemaShellMessagesFr,
      schemaShellMessagesIt,
      schemaShellMessagesJa,
      schemaShellMessagesKo,
      schemaShellMessagesPtBr,
      schemaShellMessagesRu,
      schemaShellMessagesZhHant
    ].forEach((shellMessages) => {
      expect(shellMessages).not.toEqual(schemaShellMessagesEnglish);
    });
  });

  it('keeps generated runtime locale modules schema-free while page messages merge schema catalogs', async () => {
    const runtimeLocales = [
      en.runtime,
      zhCN.runtime,
      ja.runtime,
      de.runtime,
      fr.runtime,
      esES.runtime,
      es419.runtime,
      itLocale.runtime,
      ko.runtime,
      ptBR.runtime,
      ru.runtime,
      zhTW.runtime
    ] as Array<Record<string, string>>;

    for (const runtime of runtimeLocales) {
      expect('schemaOverviewTitle' in runtime).toBe(false);
      expect('schemaRuntimeUiGroupTitle' in runtime).toBe(false);
      expect('schemaStorageConnectionNotRun' in runtime).toBe(false);
    }

    const englishMessages = await getMessagesForLanguage('en');
    const zhHansMessages = await getMessagesForLanguage('zh-CN');

    expect(englishMessages.schemaOverviewTitle).toBe(
      schemaShellMessagesEnglish.schemaOverviewTitle
    );
    expect(englishMessages.schemaRuntimeUiGroupTitle).toBe(
      schemaShellMessagesEnglish.schemaRuntimeUiGroupTitle
    );
    expect(zhHansMessages.schemaOverviewTitle).toBe(schemaShellMessagesZhHans.schemaOverviewTitle);
    expect(zhHansMessages.schemaStorageConnectionNotRun).toBe(
      schemaShellMessagesZhHans.schemaStorageConnectionNotRun
    );
  });

  it('publishes representative P03-P13 schema keys through the shell catalog and page-message merge path', async () => {
    const representativeKeys = [
      'schemaRendererResourceOpenAction',
      'schemaNavOverviewHint',
      'schemaRuntimeUiGroupTitle',
      'schemaOverviewLanguageRowTitle',
      'schemaOverviewClearUsageDataButton',
      'schemaStorageConnectionNotRun',
      'schemaStorageVaultEnabledColumnLabel',
      'schemaStorageRoutingActionsColumnLabel',
      'schemaStorageCertificateDownloadTrustLink',
      'schemaCaptureSourcesAiChatGroupTitle',
      'schemaCaptureSourcesVideoEntryBehaviorTitle',
      'schemaCaptureSourcesAttachmentPathGroupTitle',
      'schemaCaptureSourcesAttachmentGuidanceLink',
      'schemaCaptureSourcesScreenshotLocationTitle',
      'schemaCaptureBehaviorReadingGroupTitle',
      'schemaCaptureBehaviorModifierConflictSystem',
      'schemaOutputTemplatesGroupTitle',
      'schemaOutputTemplateHelperText',
      'schemaOutputYamlGroupTitle',
      'schemaMaintenanceTransferGroupTitle',
      'schemaMaintenanceDiagnosisButton',
      'schemaMaintenanceDiagnosisResultLog',
      'schemaResourcePluginSetupGoToStorageButton',
      'schemaResourceSupportScopeGroupTitle',
      'schemaResourcePrivacyLocalConfigTitle',
      'schemaResourceChangelogV020Bullet10',
      'schemaResourceChangelogV020Bullet11',
      'schemaResourceChangelogUsageAdvice3',
      'schemaResourceChangelogV010Bullet6',
      'schemaResourceChangelogV010Bullet7',
      'schemaRuntimeClipperSelectedText',
      'schemaRuntimeReaderHighlightOneExcerpt',
      'schemaRuntimeReaderHighlightTwoExcerpt',
      'schemaRuntimeReaderHighlightThreeFullText',
      'schemaRuntimeSurfaceSaveToLabel',
      'schemaRuntimeTaskSuccessTitle',
      'schemaRuntimeVideoCaptureTwoFullText',
      'schemaRuntimeVideoFloatingPromptTitle'
    ] as const;

    const englishMessages = await getMessagesForLanguage('en');
    const zhHansMessages = await getMessagesForLanguage('zh-CN');

    for (const key of representativeKeys) {
      expect(schemaShellMessagesEnglish[key]).toBeTypeOf('string');
      expect(schemaShellMessagesEn[key]).toBe(schemaShellMessagesEnglish[key]);
      expect(englishMessages[key]).toBe(schemaShellMessagesEnglish[key]);

      expect(schemaShellMessagesZhHans[key]).toBeTypeOf('string');
      expect(zhHansMessages[key]).toBe(schemaShellMessagesZhHans[key]);
    }
  });

  it('keeps Stitch registry free of previous schema-shell hardcoded sentences', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/schema/registry.ts'),
      'utf8'
    );

    expect(source).not.toContain('Usage overview, interface language, and privacy controls.');
    expect(source).not.toContain('Manage vault connections and routing rules.');
    expect(source).not.toContain('保存页面时生成 AI 总结');
    expect(source).not.toContain('Support the project through the available public channels.');
  });

  it('keeps P04 settings/surfaces source files free of representative English fallback literals', () => {
    const representativeP04Files = [
      {
        file: 'src/options/app/productionStitchRenderLifecycle.ts',
        banned: ['Runtime UI']
      },
      {
        file: 'src/options/app/productionStitchActionGroups.ts',
        banned: ['Connection Test Result']
      },
      {
        file: 'src/options/app/productionStitchStorageSubscriptions.ts',
        banned: ['Local Folder needs permission again']
      },
      {
        file: 'src/options/stitch/schema/settings/maintenance.ts',
        banned: ['Configuration Transfer']
      },
      {
        file: 'src/options/stitch/schema/settings/output.ts',
        banned: ['Path Templates']
      },
      {
        file: 'src/options/stitch/schema/settings/overview.ts',
        banned: ["privacySettingsNote', 'Consent'"]
      },
      {
        file: 'src/options/stitch/schema/builders/output.ts',
        banned: ['YAML filter']
      }
    ] as const;

    for (const { file, banned } of representativeP04Files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const literal of banned) {
        expect(source).not.toContain(literal);
      }
    }
  });

  it('keeps P03 resource source files free of representative legacy English fallback prose', () => {
    const resourceSources = [
      {
        file: 'src/options/stitch/schema/resources/onboarding.ts',
        banned: [
          'Guide Flow',
          'This content mirrors the current onboarding flow instead of placeholder copy.',
          'Configure Obsidian Local REST API (Required)',
          'More Exciting Features, Continuous Iteration'
        ]
      },
      {
        file: 'src/options/stitch/schema/resources/plugin-setup.ts',
        banned: [
          'Configure Obsidian Local REST API before editing advanced storage rules.',
          'Recommended Values',
          'Install and enable Obsidian Local REST API in Community Plugins.'
        ]
      },
      {
        file: 'src/options/stitch/schema/resources/support.ts',
        banned: [
          'Support the project through the available public channels.',
          'Buy me a coffee',
          'Support the project in Chinese'
        ]
      },
      {
        file: 'src/options/stitch/schema/resources/suggestions.ts',
        banned: [
          'Send feedback through the currently supported public channels.',
          'Feature requests and bug reports',
          'Direct public discussion with the author'
        ]
      },
      {
        file: 'src/options/stitch/schema/resources/contact.ts',
        banned: ['Contact the author', 'Public Channels', 'GitHub Repository', 'Support Email']
      },
      {
        file: 'src/options/stitch/schema/resources/privacy-policy.ts',
        banned: [
          'Learn what the extension processes, what it never collects, and how to disable related capabilities.',
          'Collect anonymized usage metrics to improve the extension. No personal-identifiable information is stored.'
        ]
      },
      {
        file: 'src/options/stitch/schema/resources/data-usage.ts',
        banned: [
          'Understand how usage metrics, error reports, and configuration transfer features use local or anonymous data.',
          'Anonymous Usage Counts',
          'Configuration Migration'
        ]
      },
      {
        file: 'src/options/stitch/changelogResourceData.ts',
        banned: ['This modal highlights the latest shipped updates from the project changelog.']
      }
    ] as const;

    for (const { file, banned } of resourceSources) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const literal of banned) {
        expect(source).not.toContain(literal);
      }
    }
  });
});
