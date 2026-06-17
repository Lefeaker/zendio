/* @vitest-environment jsdom */

import type { Messages } from '@i18n';
import { RELEASE_LANGUAGE_CONFIG, RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asOptionsController,
  createController,
  createEnglishPageMessages,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGE_OVERRIDES = {
  schemaOverviewTitle: 'Overview Hero Sentinel',
  schemaOverviewHeroDescription: 'Overview Description Sentinel',
  schemaOverviewHeroPillDefaultVaultReady: 'Default Vault Pill Sentinel',
  schemaOverviewHeroPillRoutingActive: 'Routing Pill Sentinel',
  schemaOverviewHeroPillYamlConfigured: 'YAML Pill Sentinel',
  schemaOverviewUsageGroupTitle: 'Usage Group Sentinel',
  usageDashboardTitle: 'Usage Dashboard Sentinel',
  usageDashboardSubtitle: 'Usage Dashboard Description Sentinel',
  schemaOverviewOpenDiagnosisButton: 'Diagnosis Sentinel',
  schemaOverviewClearUsageDataButton: 'Clear Usage Sentinel',
  schemaOverviewInterfaceGroupTitle: 'Interface Sentinel',
  schemaOverviewLanguageRowTitle: 'Language Row Sentinel',
  schemaOverviewThemeRowTitle: 'Theme Row Sentinel',
  schemaOverviewThemeSystemOption: 'System Theme Sentinel',
  privacySettingsNote: 'Consent Section Sentinel',
  analyticsConsentTitle: 'Analytics Sentinel',
  analyticsConsentDescription: 'Analytics Description Sentinel',
  errorReportingConsentTitle: 'Error Reporting Sentinel',
  errorReportingConsentDescription: 'Error Reporting Description Sentinel',
  analyticsDebugTitle: 'Debug Title Sentinel',
  analyticsDebugDescription: 'Debug Description Sentinel',
  errorReportingCollectedTitle: 'Collected Sentinel',
  errorReportingNotCollectedTitle: 'Not Collected Sentinel',
  clearAllAnalyticsData: 'Clear Data Sentinel',
  privacyPolicyLink: 'Privacy Policy Sentinel',
  dataUsageLink: 'Data Usage Sentinel'
} satisfies Partial<Messages>;

describe('mountProductionStitchShell overview i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders overview copy from English messages instead of hardcoded Chinese strings', async () => {
    const englishSentinelMessages = await createEnglishPageMessages(
      ENGLISH_SENTINEL_MESSAGE_OVERRIDES
    );

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: englishSentinelMessages,
      language: 'en'
    });

    const text = document.body.textContent ?? '';

    expect(text).toContain('Interface Sentinel');
    expect(text).toContain('Language Row Sentinel');
    expect(text).toContain('System Theme Sentinel');
    expect(text).toContain('Consent Section Sentinel');
    expect(text).toContain('Analytics Sentinel');
    expect(text).toContain('Clear Data Sentinel');

    expect(text).toContain('Overview Hero Sentinel');
    expect(text).toContain('Usage Dashboard Sentinel');
    expect(text).toContain('Diagnosis Sentinel');
    expect(text).toContain('Privacy Policy Sentinel');
    expect(text).toContain('Data Usage Sentinel');

    expect(text).not.toContain('使用概览');
    expect(text).not.toContain('语言');
    expect(text).not.toContain('会收集');
    expect(text).not.toContain('不会收集');
    expect(text).not.toContain('清空全部分析数据');

    const languageSelect = document.querySelector<HTMLSelectElement>('select');
    expect(languageSelect).not.toBeNull();
    const optionTexts = Array.from(languageSelect?.options ?? []).map((option) => option.text);
    expect(optionTexts).toEqual(
      RELEASE_LANGUAGE_ORDER.map((code) => RELEASE_LANGUAGE_CONFIG[code].nativeName)
    );
  });
});
