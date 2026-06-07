/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asOptionsController,
  createController,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaOverviewTitle: 'Overview Hero Sentinel',
  schemaOverviewHeroDescription: 'Overview Description Sentinel',
  schemaOverviewUsageGroupTitle: 'Usage Group Sentinel',
  usageDashboardTitle: 'Usage Dashboard Sentinel',
  usageDashboardSubtitle: 'Usage Dashboard Description Sentinel',
  schemaOverviewOpenDiagnosisButton: 'Diagnosis Sentinel',
  schemaOverviewClearUsageDataButton: 'Clear Usage Sentinel',
  schemaOverviewInterfaceGroupTitle: 'Interface Sentinel',
  schemaOverviewLanguageRowTitle: 'Language Row Sentinel',
  schemaOverviewThemeRowTitle: 'Theme Row Sentinel',
  schemaOverviewThemeSystemOption: 'System Theme Sentinel',
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
};

describe('mountProductionStitchShell overview i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders overview copy from English messages instead of hardcoded Chinese strings', () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const text = document.body.textContent ?? '';

    expect(text).toContain('Interface Sentinel');
    expect(text).toContain('Language Row Sentinel');
    expect(text).toContain('System Theme Sentinel');
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
  });
});
