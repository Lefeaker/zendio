/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES, getMessagesForLanguage, type Messages } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { createProductionStitchSchemaContext } from '@options/app/productionStitchShellContext';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { getResourceView } from '@options/stitch/schema/registry';
import { previewUi } from '@options/stitch/ui/components';
import { el } from '@options/stitch/ui/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSchemaContext as createBaseSchemaContext } from '../../utils/productionStitchAssertions';
import {
  asOptionsController,
  createController,
  findButton,
  flushPromises,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaResourceOnboardingTitle: 'Onboarding Title Sentinel',
  schemaResourceOnboardingDescription: 'Onboarding Description Sentinel',
  schemaResourceOnboardingGuideFlowTitle: 'Onboarding Flow Sentinel',
  schemaResourceOnboardingStepsTitle: 'Onboarding Steps Sentinel',
  step1Title: 'Onboarding Step 1 Title Sentinel',
  step1Description: 'Onboarding Step 1 Description Sentinel',
  step1Detail1: 'Onboarding Step 1 Detail 1 Sentinel',
  step1Detail2: 'Onboarding Step 1 Detail 2 Sentinel',
  step1Detail3: 'Onboarding Step 1 Detail 3 Sentinel',
  step1Detail4: 'Onboarding Step 1 Detail 4 Sentinel',
  step1Detail5: 'Onboarding Step 1 Detail 5 Sentinel',
  step1Detail6: 'Onboarding Step 1 Detail 6 Sentinel',
  step1ChromeTitle: 'Onboarding Chrome Step 1 Title Sentinel',
  step1ChromeDescription: 'Onboarding Chrome Step 1 Description Sentinel',
  step1ChromeDetail1: 'Onboarding Chrome Step 1 Detail 1 Sentinel',
  step1ChromeDetail2: 'Onboarding Chrome Step 1 Detail 2 Sentinel',
  step1ChromeDetail3: 'Onboarding Chrome Step 1 Detail 3 Sentinel',
  step1ChromeDetail4: 'Onboarding Chrome Step 1 Detail 4 Sentinel',
  step1ChromeDetail5: 'Onboarding Chrome Step 1 Detail 5 Sentinel',
  step1ChromeDetail6: 'Onboarding Chrome Step 1 Detail 6 Sentinel',
  step2Title: 'Onboarding Step 2 Title Sentinel',
  step2Description: 'Onboarding Step 2 Description Sentinel',
  step2Detail1: 'Onboarding Step 2 Detail 1 Sentinel',
  step2Detail2: 'Onboarding Step 2 Detail 2 Sentinel',
  step2Detail3: 'Onboarding Step 2 Detail 3 Sentinel',
  step2Detail4: 'Onboarding Step 2 Detail 4 Sentinel',
  step3Title: 'Onboarding Step 3 Title Sentinel',
  step3Description: 'Onboarding Step 3 Description Sentinel',
  step3Section1Title: 'Onboarding Step 3 Section 1 Sentinel',
  step3Section1Detail1: 'Onboarding Step 3 Section 1 Detail 1 Sentinel',
  step3Section1Detail2: 'Onboarding Step 3 Section 1 Detail 2 Sentinel',
  step3Section2Title: 'Onboarding Step 3 Section 2 Sentinel',
  step3Section2Detail1: 'Onboarding Step 3 Section 2 Detail 1 Sentinel',
  step3Section2Detail4: 'Onboarding Step 3 Section 2 Detail 4 Sentinel',
  step3Section2Detail7: 'Onboarding Step 3 Section 2 Detail 7 Sentinel',
  step3Section3Title: 'Onboarding Step 3 Section 3 Sentinel',
  step3Section3Detail1: 'Onboarding Step 3 Section 3 Detail 1 Sentinel',
  step3Section3Detail4: 'Onboarding Step 3 Section 3 Detail 4 Sentinel',
  step3Section3Detail5: 'Onboarding Step 3 Section 3 Detail 5 Sentinel',
  step4Title: 'Onboarding Step 4 Title Sentinel',
  step4Description: 'Onboarding Step 4 Description Sentinel',
  step4Detail1: 'Onboarding Step 4 Detail 1 Sentinel',
  step4Detail2: 'Onboarding Step 4 Detail 2 Sentinel',
  step4Detail3: 'Onboarding Step 4 Detail 3 Sentinel',
  step4Detail4: 'Onboarding Step 4 Detail 4 Sentinel',
  step5Title: 'Onboarding Step 5 Title Sentinel',
  step5Description: 'Onboarding Step 5 Description Sentinel',
  step5Detail2: 'Onboarding Step 5 Detail 2 Sentinel',
  step5Detail3: 'Onboarding Step 5 Detail 3 Sentinel',
  footerSuggestionsLink: 'Onboarding Suggestions Link Sentinel',
  footerSupportLink: 'Onboarding Support Link Sentinel',
  footerContactLink: 'Onboarding Contact Link Sentinel',
  schemaResourcePluginSetupTitle: 'Plugin Setup Title Sentinel',
  schemaResourcePluginSetupDescription: 'Plugin Setup Description Sentinel',
  schemaResourcePluginSetupRecommendedValuesGroupTitle: 'Plugin Recommended Values Sentinel',
  schemaResourcePluginSetupSetupFlowGroupTitle: 'Plugin Setup Flow Sentinel',
  schemaResourcePluginSetupChecklistGroupTitle: 'Plugin Checklist Sentinel',
  schemaResourcePluginSetupFieldHttpsUrl: 'Plugin HTTPS Field Sentinel',
  schemaResourcePluginSetupFieldHttpUrl: 'Plugin HTTP Field Sentinel',
  schemaResourcePluginSetupFieldVault: 'Plugin Vault Field Sentinel',
  schemaResourcePluginSetupFieldApiKey: 'Plugin API Key Field Sentinel',
  apiConfigTitle: 'Plugin API Config Sentinel',
  testConnectionButton_short: 'Plugin Test Button Sentinel',
  schemaResourcePluginSetupGoToStorageButton: 'Plugin Go Storage Sentinel',
  schemaResourcePluginSetupStep1: 'Plugin Setup Step 1 Sentinel',
  schemaResourcePluginSetupStep2: 'Plugin Setup Step 2 Sentinel',
  schemaResourcePluginSetupStep3: 'Plugin Setup Step 3 Sentinel',
  schemaResourcePluginSetupStep4: 'Plugin Setup Step 4 Sentinel',
  schemaResourcePluginSetupStep5: 'Plugin Setup Step 5 Sentinel',
  schemaResourcePluginSetupChecklist1: 'Plugin Checklist Item 1 Sentinel',
  schemaResourcePluginSetupChecklist2: 'Plugin Checklist Item 2 Sentinel',
  schemaResourcePluginSetupChecklist3: 'Plugin Checklist Item 3 Sentinel',
  schemaResourcePluginSetupChecklist4: 'Plugin Checklist Item 4 Sentinel',
  schemaResourcePluginSetupChecklist5: 'Plugin Checklist Item 5 Sentinel',
  schemaResourceSupportTitle: 'Support Title Sentinel',
  schemaResourceSupportDescription: 'Support Description Sentinel',
  schemaResourceSupportChannelsGroupTitle: 'Support Channels Sentinel',
  schemaResourceSupportKoFiTitle: 'Support Ko-fi Title Sentinel',
  schemaResourceSupportKoFiDescription: 'Support Ko-fi Description Sentinel',
  schemaResourceSupportAfdianTitle: 'Support WeChat Reward Title Sentinel',
  schemaResourceSupportAfdianDescription: 'Support WeChat Reward Description Sentinel',
  schemaResourceSuggestionsTitle: 'Suggestions Title Sentinel',
  schemaResourceSuggestionsDescription: 'Suggestions Body Prefix Sentinel',
  schemaResourceSuggestionsChannelsGroupTitle: 'Suggestions Channels Sentinel',
  schemaResourceSuggestionsGithubTitle: 'Suggestions GitHub Title Sentinel',
  schemaResourceSuggestionsGithubDescription: ', ',
  schemaResourceSuggestionsRedditTitle: 'Suggestions Reddit Title Sentinel',
  schemaResourceSuggestionsRedditDescription: ' or ',
  schemaResourceSuggestionsXiaohongshuDescription: ' Suggestions Body Suffix Sentinel',
  schemaResourceSuggestionsXiaohongshuQrCaption: 'Xiaohongshu QR Caption Sentinel',
  schemaResourceSuggestionsXiaohongshuTitle: 'Suggestions Xiaohongshu Title Sentinel',
  schemaResourceContactTitle: 'Contact Title Sentinel',
  schemaResourceContactHint: 'Contact Hint Sentinel',
  schemaResourceContactDescription:
    'Contact Body Sentinel <a href="https://sxnian.com" target="_blank" rel="noopener noreferrer">Author Site Sentinel</a>, <a href="https://www.reddit.com/user/sxnian/" target="_blank" rel="noopener noreferrer">Reddit Link Sentinel</a>, <a href="https://github.com/Lefeaker" target="_blank" rel="noopener noreferrer">GitHub Link Sentinel</a>, or <a href="mailto:zendio@sxnian.com">Email Link Sentinel</a> Contact HTML Sentinel',
  schemaResourceContactChannelsGroupTitle: 'Contact Channels Sentinel',
  schemaResourceContactRedditTitle: 'Contact Reddit Title Sentinel',
  schemaResourceContactRedditDescription: 'Contact Reddit Description Sentinel',
  schemaResourceContactGithubTitle: 'Contact GitHub Title Sentinel',
  schemaResourceContactGithubDescription: 'Contact GitHub Description Sentinel',
  schemaResourceContactEmailTitle: 'Contact Email Title Sentinel',
  schemaResourceContactEmailDescription: 'Contact Email Description Sentinel',
  schemaResourceChangelogTitle: 'Changelog Title Sentinel',
  schemaResourceChangelogDescription: 'Changelog Description Sentinel',
  schemaResourceChangelogV021Bullet1: 'Changelog v0.2.1 Bullet 1 Sentinel',
  schemaResourceChangelogV021Bullet2: 'Changelog v0.2.1 Bullet 2 Sentinel',
  schemaResourceChangelogV021Bullet3: 'Changelog v0.2.1 Bullet 3 Sentinel',
  schemaResourceChangelogV021Bullet4: 'Changelog v0.2.1 Bullet 4 Sentinel',
  schemaResourceChangelogV021Bullet5: 'Changelog v0.2.1 Bullet 5 Sentinel',
  schemaResourceChangelogV021Summary: 'Changelog v0.2.1 Summary Sentinel',
  schemaResourceChangelogV020Bullet1: 'Changelog v0.2.0 Bullet 1 Sentinel',
  schemaResourceChangelogV020Bullet2: 'Changelog v0.2.0 Bullet 2 Sentinel',
  schemaResourceChangelogV020Bullet3: 'Changelog v0.2.0 Bullet 3 Sentinel',
  schemaResourceChangelogV020Bullet4: 'Changelog v0.2.0 Bullet 4 Sentinel',
  schemaResourceChangelogV020Bullet5: 'Changelog v0.2.0 Bullet 5 Sentinel',
  schemaResourceChangelogV020Bullet6: 'Changelog v0.2.0 Bullet 6 Sentinel',
  schemaResourceChangelogV020Bullet7: 'Changelog v0.2.0 Bullet 7 Sentinel',
  schemaResourceChangelogV020Bullet8: 'Changelog v0.2.0 Bullet 8 Sentinel',
  schemaResourceChangelogV020Bullet9: 'Changelog v0.2.0 Bullet 9 Sentinel',
  schemaResourceChangelogV020Bullet10: 'Changelog v0.2.0 Bullet 10 Sentinel',
  schemaResourceChangelogV020Summary: 'Changelog v0.2.0 Summary Sentinel',
  schemaResourceChangelogV010Bullet1: 'Changelog v0.1.0 Bullet 1 Sentinel',
  schemaResourceChangelogV010Bullet2: 'Changelog v0.1.0 Bullet 2 Sentinel',
  schemaResourceChangelogV010Bullet3: 'Changelog v0.1.0 Bullet 3 Sentinel',
  schemaResourceChangelogV010Bullet4: 'Changelog v0.1.0 Bullet 4 Sentinel',
  schemaResourceChangelogV010Bullet5: 'Changelog v0.1.0 Bullet 5 Sentinel',
  schemaResourceChangelogV010Bullet6: 'Changelog v0.1.0 Bullet 6 Sentinel',
  schemaResourceChangelogV010Summary: 'Changelog v0.1.0 Summary Sentinel',
  privacyPolicyLink: 'Privacy Policy Link Sentinel',
  schemaResourcePrivacyPolicyTitle: 'Privacy Policy Title Sentinel',
  schemaResourcePrivacyPolicyDescription: 'Privacy Policy Description Sentinel',
  schemaResourcePrivacyPolicyEffectiveTitle: 'Privacy Policy Effective Title Sentinel',
  schemaResourcePrivacyPolicyEffectiveBody: 'Privacy Policy Effective Body Sentinel',
  schemaResourcePrivacyPolicyScopeTitle: 'Privacy Policy Scope Title Sentinel',
  schemaResourcePrivacyPolicyScopeBody: 'Privacy Policy Scope Body Sentinel',
  schemaResourcePrivacyPolicyLocalFirstTitle: 'Privacy Policy Local First Title Sentinel',
  schemaResourcePrivacyPolicyLocalFirstBody: 'Privacy Policy Local First Body Sentinel',
  schemaResourcePrivacyPolicyLocalDataTitle: 'Privacy Policy Local Data Title Sentinel',
  schemaResourcePrivacyPolicyLocalDataBody: 'Privacy Policy Local Data Body Sentinel',
  schemaResourcePrivacyPolicyLocalDataBulletClip: 'Privacy Policy Clip Bullet Sentinel',
  schemaResourcePrivacyPolicyLocalDataBulletConfig: 'Privacy Policy Config Bullet Sentinel',
  schemaResourcePrivacyPolicyLocalDataBulletFolder: 'Privacy Policy Folder Bullet Sentinel',
  schemaResourcePrivacyPolicyLocalDataBulletDrafts: 'Privacy Policy Drafts Bullet Sentinel',
  schemaResourcePrivacyPolicyObsidianTitle: 'Privacy Policy Obsidian Title Sentinel',
  schemaResourcePrivacyPolicyObsidianBody: 'Privacy Policy Obsidian Body Sentinel',
  schemaResourcePrivacyPolicyTelemetryTitle: 'Privacy Policy Telemetry Title Sentinel',
  schemaResourcePrivacyPolicyTelemetryBody: 'Privacy Policy Telemetry Body Sentinel',
  schemaResourcePrivacyPolicyTelemetryBulletAnalytics: 'Privacy Policy Analytics Bullet Sentinel',
  schemaResourcePrivacyPolicyTelemetryBulletErrors: 'Privacy Policy Errors Bullet Sentinel',
  schemaResourcePrivacyPolicyTelemetryBulletProxy: 'Privacy Policy Proxy Bullet Sentinel',
  schemaResourcePrivacyPolicyTelemetryBulletIdentifiers:
    'Privacy Policy Identifiers Bullet Sentinel',
  schemaResourcePrivacyPolicyNotCollectedTitle: 'Privacy Policy Not Collected Title Sentinel',
  schemaResourcePrivacyPolicyNotCollectedBody: 'Privacy Policy Not Collected Body Sentinel',
  schemaResourcePrivacyPolicyNotCollectedBulletContent:
    'Privacy Policy Not Collected Content Bullet Sentinel',
  schemaResourcePrivacyPolicyNotCollectedBulletUrls:
    'Privacy Policy Not Collected URLs Bullet Sentinel',
  schemaResourcePrivacyPolicyNotCollectedBulletSecrets:
    'Privacy Policy Not Collected Secrets Bullet Sentinel',
  schemaResourcePrivacyPolicyNotCollectedBulletIdentity:
    'Privacy Policy Not Collected Identity Bullet Sentinel',
  schemaResourcePrivacyPolicySharingTitle: 'Privacy Policy Sharing Title Sentinel',
  schemaResourcePrivacyPolicySharingBody: 'Privacy Policy Sharing Body Sentinel',
  schemaResourcePrivacyPolicyRetentionTitle: 'Privacy Policy Retention Title Sentinel',
  schemaResourcePrivacyPolicyRetentionBody: 'Privacy Policy Retention Body Sentinel',
  schemaResourcePrivacyPolicySecurityTitle: 'Privacy Policy Security Title Sentinel',
  schemaResourcePrivacyPolicySecurityBody: 'Privacy Policy Security Body Sentinel',
  schemaResourcePrivacyPolicyChoicesTitle: 'Privacy Policy Choices Title Sentinel',
  schemaResourcePrivacyPolicyChoicesBody: 'Privacy Policy Choices Body Sentinel',
  schemaResourcePrivacyPolicyUpdatesTitle: 'Privacy Policy Updates Title Sentinel',
  schemaResourcePrivacyPolicyUpdatesBody: 'Privacy Policy Updates Body Sentinel',
  schemaResourcePrivacyPolicyContactTitle: 'Privacy Policy Contact Title Sentinel',
  schemaResourcePrivacyPolicyContactBody:
    'Privacy Policy Contact Body Sentinel <a href="mailto:zendio@sxnian.com">Privacy Email Sentinel</a> or <a href="https://github.com/Lefeaker/zendio/issues" target="_blank" rel="noopener noreferrer">Privacy GitHub Issues Sentinel</a>',
  errorReportingNotCollectedTitle: 'Privacy Not Collected Sentinel',
  errorReportingNotCollectedContent: 'Privacy Not Collected Content Sentinel',
  errorReportingNotCollectedUrls: 'Privacy Not Collected URLs Sentinel',
  errorReportingNotCollectedPasswords: 'Privacy Not Collected Passwords Sentinel',
  errorReportingNotCollectedPersonal: 'Privacy Not Collected Personal Sentinel',
  analyticsConsentTitle: 'Privacy Analytics Title Sentinel',
  analyticsConsentDescription: 'Privacy Analytics Description Sentinel',
  errorReportingConsentTitle: 'Privacy Error Reporting Title Sentinel',
  errorReportingConsentDescription: 'Privacy Error Reporting Description Sentinel',
  schemaResourcePrivacyLocalConfigTitle: 'Privacy Local Config Title Sentinel',
  schemaResourcePrivacyLocalConfigBody: 'Privacy Local Config Body Sentinel',
  dataUsageLink: 'Data Usage Link Sentinel',
  schemaResourceDataUsageTitle: 'Data Usage Title Sentinel',
  schemaResourceDataUsageDescription: 'Data Usage Description Sentinel',
  schemaResourceDataUsageAnonymousUsageTitle: 'Data Usage Anonymous Title Sentinel',
  schemaResourceDataUsageAnonymousUsageBody: 'Data Usage Anonymous Body Sentinel',
  errorReportingDetailsTitle: 'Data Usage Error Reporting Title Sentinel',
  errorReportingCollectedTitle: 'Data Usage Collected Title Sentinel',
  errorReportingCollectedError: 'Data Usage Collected Error Sentinel',
  errorReportingCollectedBrowser: 'Data Usage Collected Browser Sentinel',
  errorReportingCollectedExtension: 'Data Usage Collected Extension Sentinel',
  errorReportingCollectedTimestamp: 'Data Usage Collected Timestamp Sentinel',
  schemaResourceDataUsageConfigMigrationTitle: 'Data Usage Config Migration Title Sentinel',
  schemaResourceDataUsageConfigMigrationBody: 'Data Usage Config Migration Body Sentinel',
  schemaResourceTermsTitle: 'Terms Title Sentinel',
  schemaResourceTermsDescription: 'Terms Description Sentinel',
  schemaResourceTermsEffectiveTitle: 'Terms Effective Title Sentinel',
  schemaResourceTermsEffectiveBody: 'Terms Effective Body Sentinel',
  schemaResourceTermsAcceptanceTitle: 'Terms Acceptance Title Sentinel',
  schemaResourceTermsAcceptanceBody: 'Terms Acceptance Body Sentinel',
  schemaResourceTermsProductTitle: 'Terms Product Title Sentinel',
  schemaResourceTermsProductBody: 'Terms Product Body Sentinel',
  schemaResourceTermsLocalFirstTitle: 'Terms Local First Title Sentinel',
  schemaResourceTermsLocalFirstBody: 'Terms Local First Body Sentinel',
  schemaResourceTermsUserResponsibilityTitle: 'Terms Responsibility Title Sentinel',
  schemaResourceTermsUserResponsibilityBody: 'Terms Responsibility Body Sentinel',
  schemaResourceTermsUserResponsibilityBulletContent: 'Terms Content Bullet Sentinel',
  schemaResourceTermsUserResponsibilityBulletDestinations: 'Terms Destinations Bullet Sentinel',
  schemaResourceTermsUserResponsibilityBulletThirdParty: 'Terms Third Party Bullet Sentinel',
  schemaResourceTermsUserResponsibilityBulletSecurity: 'Terms Security Bullet Sentinel',
  schemaResourceTermsThirdPartyTitle: 'Terms Third Party Title Sentinel',
  schemaResourceTermsThirdPartyBody: 'Terms Third Party Body Sentinel',
  schemaResourceTermsPrivacyTitle: 'Terms Privacy Title Sentinel',
  schemaResourceTermsPrivacyBody: 'Terms Privacy Body Sentinel',
  schemaResourceTermsAvailabilityTitle: 'Terms Availability Title Sentinel',
  schemaResourceTermsAvailabilityBody: 'Terms Availability Body Sentinel',
  schemaResourceTermsLiabilityTitle: 'Terms Liability Title Sentinel',
  schemaResourceTermsLiabilityBody: 'Terms Liability Body Sentinel',
  schemaResourceTermsChangesTitle: 'Terms Changes Title Sentinel',
  schemaResourceTermsChangesBody: 'Terms Changes Body Sentinel',
  schemaResourceTermsContactTitle: 'Terms Contact Title Sentinel',
  schemaResourceTermsContactBody:
    'Terms Contact Body Sentinel <a href="mailto:zendio@sxnian.com">Terms Email Sentinel</a> or <a href="https://github.com/Lefeaker/zendio/issues" target="_blank" rel="noopener noreferrer">Terms GitHub Issues Sentinel</a>'
};

type ResourceRenderOptions = {
  language?: 'en' | 'zh-CN';
  messages?: Messages;
  browserTarget?: 'chrome' | 'firefox';
  mutateAppData?: (appData: ReturnType<typeof createBaseSchemaContext>['appData']) => void;
};

function createLocalizedSchemaContext(options: ResourceRenderOptions = {}) {
  const base = createBaseSchemaContext();
  options.mutateAppData?.(base.appData);
  const language = options.language ?? 'en';
  return createProductionStitchSchemaContext({
    appData: base.appData,
    state: {
      ...base.state,
      previewLanguage: language
    },
    ...(options.browserTarget ? { browserTarget: options.browserTarget } : {}),
    language,
    messages: options.messages ?? ENGLISH_SENTINEL_MESSAGES
  });
}

function renderResourcePage(resourceId: string, options: ResourceRenderOptions = {}): HTMLElement {
  const schemaContext = createLocalizedSchemaContext(options);
  const view = getResourceView(resourceId, schemaContext);
  expect(view).toBeTruthy();

  const rendererContext: RendererContext = {
    ...schemaContext,
    el,
    ui: previewUi,
    dispatch: vi.fn()
  };

  const rendered = renderPreviewView(view!, rendererContext);
  expect(rendered).toBeTruthy();
  return rendered!;
}

async function openResource(label: string): Promise<HTMLElement> {
  findButton(label).click();
  await flushPromises();
  return queryRequired<HTMLElement>('[role="dialog"]');
}

async function closeResource(): Promise<void> {
  document.querySelector<HTMLElement>('.resource-modal-overlay')?.click();
  await flushPromises();
}

function expectText(root: ParentNode, ...values: string[]): void {
  const text = root.textContent ?? '';
  for (const value of values) {
    expect(text).toContain(value);
  }
}

function expectNoText(root: ParentNode, ...values: string[]): void {
  const text = root.textContent ?? '';
  for (const value of values) {
    expect(text).not.toContain(value);
  }
}

function expectContactAuthorLinks(root: ParentNode): void {
  expect(root.querySelector<HTMLAnchorElement>('a[href="https://sxnian.com"]')).toBeTruthy();
  expect(
    root.querySelector<HTMLAnchorElement>('a[href="https://www.reddit.com/user/sxnian/"]')
  ).toBeTruthy();
  expect(
    root.querySelector<HTMLAnchorElement>('a[href="https://github.com/Lefeaker"]')
  ).toBeTruthy();
  expect(root.querySelector<HTMLAnchorElement>('a[href="mailto:zendio@sxnian.com"]')).toBeTruthy();
}

function expectLegalContactLinks(root: ParentNode): void {
  expect(root.querySelector<HTMLAnchorElement>('a[href="mailto:zendio@sxnian.com"]')).toBeTruthy();
  expect(
    root.querySelector<HTMLAnchorElement>('a[href="https://github.com/Lefeaker/zendio/issues"]')
  ).toBeTruthy();
}

describe('mountProductionStitchShell resource i18n', () => {
  beforeEach(() => {
    setupProductionStitchShellTest();
    Reflect.deleteProperty(globalThis, 'browser');
  });

  it('opens onboarding through the production page path and renders onboarding copy from generated messages', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const sidebarText = document.querySelector('.sidebar')?.textContent ?? '';
    expect(sidebarText).toContain('Onboarding Title Sentinel');
    expect(sidebarText).not.toContain('Plugin Setup Title Sentinel');

    findButton('Onboarding Title Sentinel').click();

    expect(openSpy).toHaveBeenCalledWith(
      '../onboarding/index.html',
      '_blank',
      'noopener,noreferrer'
    );

    const onboardingPage = renderResourcePage('onboarding');
    expectText(
      onboardingPage,
      'Onboarding Title Sentinel',
      'Onboarding Description Sentinel',
      'Onboarding Flow Sentinel',
      'Onboarding Steps Sentinel',
      'Plugin Recommended Values Sentinel',
      'Plugin Setup Flow Sentinel',
      'Plugin Checklist Sentinel',
      'Plugin HTTPS Field Sentinel',
      'Plugin HTTP Field Sentinel',
      'Plugin Vault Field Sentinel',
      'Plugin API Key Field Sentinel',
      'Plugin Test Button Sentinel',
      'Plugin Go Storage Sentinel',
      'Plugin Setup Step 1 Sentinel',
      'Plugin Setup Step 5 Sentinel',
      'Plugin Checklist Item 1 Sentinel',
      'Plugin Checklist Item 5 Sentinel',
      'Onboarding Chrome Step 1 Title Sentinel',
      'Onboarding Chrome Step 1 Description Sentinel',
      'Onboarding Chrome Step 1 Detail 1 Sentinel',
      'Onboarding Chrome Step 1 Detail 2 Sentinel',
      'Onboarding Chrome Step 1 Detail 3 Sentinel',
      'Onboarding Chrome Step 1 Detail 4 Sentinel',
      'Onboarding Chrome Step 1 Detail 5 Sentinel',
      'Onboarding Chrome Step 1 Detail 6 Sentinel',
      'Onboarding Step 2 Title Sentinel',
      'Onboarding Step 2 Description Sentinel',
      'Onboarding Step 2 Detail 1 Sentinel',
      'Onboarding Step 2 Detail 2 Sentinel',
      'Onboarding Step 2 Detail 3 Sentinel',
      'Onboarding Step 2 Detail 4 Sentinel',
      'Onboarding Step 3 Title Sentinel',
      'Onboarding Step 3 Description Sentinel',
      'Onboarding Step 3 Section 1 Sentinel',
      'Onboarding Step 3 Section 1 Detail 1 Sentinel',
      'Onboarding Step 3 Section 1 Detail 2 Sentinel',
      'Onboarding Step 3 Section 2 Sentinel',
      'Onboarding Step 3 Section 2 Detail 1 Sentinel',
      'Onboarding Step 3 Section 2 Detail 4 Sentinel',
      'Onboarding Step 3 Section 2 Detail 7 Sentinel',
      'Onboarding Step 3 Section 3 Sentinel',
      'Onboarding Step 3 Section 3 Detail 1 Sentinel',
      'Onboarding Step 3 Section 3 Detail 4 Sentinel',
      'Onboarding Step 3 Section 3 Detail 5 Sentinel',
      'Onboarding Step 4 Title Sentinel',
      'Onboarding Step 4 Description Sentinel',
      'Onboarding Step 4 Detail 1 Sentinel',
      'Onboarding Step 4 Detail 2 Sentinel',
      'Onboarding Step 4 Detail 3 Sentinel',
      'Onboarding Step 4 Detail 4 Sentinel',
      'Onboarding Step 5 Title Sentinel',
      'Onboarding Step 5 Description Sentinel',
      'Onboarding Step 5 Detail 2 Sentinel',
      'Onboarding Step 5 Detail 3 Sentinel'
    );
    expectNoText(
      onboardingPage,
      'Guide Flow',
      'Go To Storage',
      'Configure Obsidian Local REST API (Required)',
      'More Exciting Features, Continuous Iteration',
      'Onboarding Step 5 Detail 1 Sentinel',
      '配置 Obsidian Local REST API',
      '欢迎提出建议，开发不易，感谢支持'
    );
  });

  it('renders onboarding REST API copy for Firefox builds from schema context', () => {
    Reflect.deleteProperty(globalThis, 'browser');

    const onboardingPage = renderResourcePage('onboarding', { browserTarget: 'firefox' });

    expectText(
      onboardingPage,
      'Onboarding Step 1 Title Sentinel',
      'Onboarding Step 1 Description Sentinel',
      'Onboarding Step 1 Detail 1 Sentinel',
      'Onboarding Step 1 Detail 6 Sentinel'
    );
    expectNoText(
      onboardingPage,
      'Onboarding Chrome Step 1 Title Sentinel',
      'Onboarding Chrome Step 1 Description Sentinel'
    );
  });

  it('keeps the retired plugin setup resource id as a unified setup guide compatibility alias', () => {
    const pluginSetup = renderResourcePage('plugin-setup');
    expectText(
      pluginSetup,
      'Onboarding Title Sentinel',
      'Onboarding Description Sentinel',
      'Plugin Recommended Values Sentinel',
      'Plugin Setup Flow Sentinel',
      'Plugin Checklist Sentinel',
      'Plugin HTTPS Field Sentinel',
      'Plugin HTTP Field Sentinel',
      'Plugin Vault Field Sentinel',
      'Plugin API Key Field Sentinel',
      'Plugin Test Button Sentinel',
      'Plugin Go Storage Sentinel',
      'Plugin Setup Step 1 Sentinel',
      'Plugin Setup Step 5 Sentinel',
      'Plugin Checklist Item 1 Sentinel',
      'Plugin Checklist Item 5 Sentinel'
    );
  });

  it('renders footer resource modals from sentinel English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const support = await openResource('Support Title Sentinel');
    expectText(
      support,
      'Support Title Sentinel',
      'Support Description Sentinel',
      'Support Channels Sentinel',
      'Support Ko-fi Title Sentinel',
      'Support Ko-fi Description Sentinel',
      'Support WeChat Reward Title Sentinel',
      'Support WeChat Reward Description Sentinel'
    );
    expect(
      support.querySelector<HTMLImageElement>('img.resource-link-icon[src="../icons/ko-fi.svg"]')
    ).toBeTruthy();
    expect(
      support.querySelector<HTMLImageElement>(
        'img.resource-link-icon[src="../icons/wechat-reward.svg"]'
      )
    ).toBeTruthy();
    expect(
      support.querySelector<HTMLImageElement>(
        'img.resource-link-preview[src="../icons/wechat-reward-qr.jpg"]'
      )
    ).toBeNull();
    expect(support.querySelector('.resource-link-action')).toBeNull();
    support.querySelector<HTMLButtonElement>('[data-role="resource-image-modal-trigger"]')?.click();
    await flushPromises();
    const rewardDialog = document.querySelector<HTMLElement>('.resource-image-modal-overlay');
    expect(rewardDialog).toBeTruthy();
    expect(rewardDialog?.textContent?.trim()).toBe('');
    expect(
      rewardDialog
        ?.querySelector<HTMLImageElement>('img.resource-image-modal-media')
        ?.getAttribute('src')
    ).toBe('../icons/wechat-reward-qr.jpg');
    rewardDialog?.click();
    await flushPromises();
    expect(document.querySelector('.resource-image-modal-overlay')).toBeNull();
    expect(
      support.querySelector<HTMLAnchorElement>('a.resource-link-card[href*="afdian.com"]')
    ).toBeNull();
    expectNoText(
      support,
      'Support the project through the available public channels.',
      'Buy me a coffee',
      'Support the project in Chinese',
      '感谢支持'
    );
    await closeResource();

    const suggestions = await openResource('Suggestions Title Sentinel');
    expectText(
      suggestions,
      'Suggestions Title Sentinel',
      'Suggestions Body Prefix Sentinel',
      'Suggestions GitHub Title Sentinel',
      'Suggestions Xiaohongshu Title Sentinel',
      'Contact Email Title Sentinel',
      'Suggestions Body Suffix Sentinel'
    );
    expect(suggestions.querySelector('.resource-link-card')).toBeNull();
    expect(suggestions.querySelector('.resource-link-action')).toBeNull();
    expect(
      suggestions.querySelector<HTMLAnchorElement>(
        'a[href*="github.com/Lefeaker/Zendio/issues/new"]'
      )
    ).toBeTruthy();
    const xiaohongshuLink = suggestions.querySelector<HTMLButtonElement>(
      'button.resource-inline-popover-trigger[data-role="xiaohongshu-feedback-qr-trigger"]'
    );
    expect(xiaohongshuLink).toBeTruthy();
    expect(xiaohongshuLink?.getAttribute('type')).toBe('button');
    expect(xiaohongshuLink?.hasAttribute('href')).toBe(false);
    expect(xiaohongshuLink?.hasAttribute('target')).toBe(false);
    const xiaohongshuPopoverHost = xiaohongshuLink?.closest<HTMLElement>(
      '.resource-inline-popover-host'
    );
    expect(xiaohongshuPopoverHost).toBeTruthy();
    expect(
      xiaohongshuPopoverHost
        ?.querySelector<HTMLImageElement>(
          '.resource-inline-popover img.resource-inline-popover-media'
        )
        ?.getAttribute('src')
    ).toBe('https://sxnian.com/products/zendio/xiaohongshu-feedback.jpg');
    expect(
      xiaohongshuPopoverHost?.querySelector<HTMLElement>('.resource-inline-popover-caption')
        ?.textContent
    ).toBe('Xiaohongshu QR Caption Sentinel');
    expect(
      suggestions.querySelector<HTMLAnchorElement>('a[href="mailto:zendio@sxnian.com"]')
    ).toBeTruthy();
    expectNoText(
      suggestions,
      'Suggestions Channels Sentinel',
      'Suggestions Reddit Title Sentinel',
      'Send feedback through the currently supported public channels.',
      'Feature requests and bug reports',
      'Direct public discussion with the author'
    );
    await closeResource();

    const contact = await openResource('Contact Title Sentinel');
    expectText(
      contact,
      'Contact Title Sentinel',
      'Contact Body Sentinel',
      'Author Site Sentinel',
      'Reddit Link Sentinel',
      'GitHub Link Sentinel',
      'Email Link Sentinel',
      'Contact HTML Sentinel'
    );
    expect(contact.querySelector('.resource-link-card')).toBeNull();
    expectNoText(
      contact,
      'Contact Hint Sentinel',
      'Contact Channels Sentinel',
      'Contact Reddit Title Sentinel',
      'Contact GitHub Title Sentinel',
      'Contact Email Title Sentinel',
      'Contact Reddit Description Sentinel',
      'Contact GitHub Description Sentinel',
      'Contact Email Description Sentinel',
      'https://www.reddit.com/user/sxnian/',
      'https://github.com/Lefeaker/zendio'
    );
    expect(contact.querySelector('.resource-link-action')).toBeNull();
    expectContactAuthorLinks(contact);
    expectNoText(
      contact,
      'Contact the author',
      'Public Channels',
      'GitHub Repository',
      'Support Email'
    );
    await closeResource();

    const changelog = await openResource('Changelog Title Sentinel');
    const releaseCards = Array.from(changelog.querySelectorAll<HTMLElement>('.release-card'));
    expect(releaseCards).toHaveLength(3);
    expect(
      releaseCards.map((card) => card.querySelector<HTMLElement>('.release-summary')?.textContent)
    ).toEqual([
      'Changelog v0.2.1 Summary Sentinel',
      'Changelog v0.2.0 Summary Sentinel',
      'Changelog v0.1.0 Summary Sentinel'
    ]);
    expect(
      Array.from(releaseCards[0].querySelectorAll('li')).map((item) => item.textContent)
    ).not.toContain('Changelog v0.2.1 Summary Sentinel');
    expect(
      Array.from(releaseCards[1].querySelectorAll('li')).map((item) => item.textContent)
    ).not.toContain('Changelog v0.2.0 Summary Sentinel');
    expect(
      Array.from(releaseCards[2].querySelectorAll('li')).map((item) => item.textContent)
    ).not.toContain('Changelog v0.1.0 Summary Sentinel');
    expectText(
      changelog,
      'Changelog Title Sentinel',
      'Changelog Description Sentinel',
      'Changelog v0.2.1 Summary Sentinel',
      'Changelog v0.2.1 Bullet 1 Sentinel',
      'Changelog v0.2.1 Bullet 2 Sentinel',
      'Changelog v0.2.1 Bullet 3 Sentinel',
      'Changelog v0.2.1 Bullet 4 Sentinel',
      'Changelog v0.2.1 Bullet 5 Sentinel',
      'Changelog v0.2.0 Summary Sentinel',
      'Changelog v0.2.0 Bullet 1 Sentinel',
      'Changelog v0.2.0 Bullet 2 Sentinel',
      'Changelog v0.2.0 Bullet 3 Sentinel',
      'Changelog v0.2.0 Bullet 4 Sentinel',
      'Changelog v0.2.0 Bullet 5 Sentinel',
      'Changelog v0.2.0 Bullet 6 Sentinel',
      'Changelog v0.2.0 Bullet 7 Sentinel',
      'Changelog v0.2.0 Bullet 8 Sentinel',
      'Changelog v0.2.0 Bullet 9 Sentinel',
      'Changelog v0.2.0 Bullet 10 Sentinel',
      'Changelog v0.1.0 Summary Sentinel',
      'Changelog v0.1.0 Bullet 1 Sentinel',
      'Changelog v0.1.0 Bullet 2 Sentinel',
      'Changelog v0.1.0 Bullet 3 Sentinel',
      'Changelog v0.1.0 Bullet 4 Sentinel',
      'Changelog v0.1.0 Bullet 5 Sentinel',
      'Changelog v0.1.0 Bullet 6 Sentinel'
    );
    expect(changelog.querySelector('.release-note-section')).toBeNull();
    expectNoText(
      changelog,
      'Changelog Usage Advice Sentinel',
      'Changelog Usage Advice 1 Sentinel',
      'Changelog Usage Advice 2 Sentinel',
      'Changelog Usage Advice 3 Sentinel',
      '重构选项页为新的设置中心',
      '这里直接使用项目中的更新日志重点内容，保持和真实版本记录一致。',
      '使用建议'
    );
  });

  it('renders privacy and data usage resources from sentinel English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const privacyPolicy = await openResource('Privacy Policy Link Sentinel');
    expectText(
      privacyPolicy,
      'Privacy Policy Title Sentinel',
      'Privacy Policy Description Sentinel',
      'Privacy Policy Effective Title Sentinel',
      'Privacy Policy Effective Body Sentinel',
      'Privacy Policy Local First Title Sentinel',
      'Privacy Policy Clip Bullet Sentinel',
      'Privacy Policy Obsidian Body Sentinel',
      'Privacy Policy Telemetry Title Sentinel',
      'Privacy Policy Proxy Bullet Sentinel',
      'Privacy Policy Not Collected Content Bullet Sentinel',
      'Privacy Policy Retention Body Sentinel',
      'Privacy Policy Contact Body Sentinel',
      'Privacy Email Sentinel',
      'Privacy GitHub Issues Sentinel'
    );
    expectLegalContactLinks(privacyPolicy);
    expectNoText(
      privacyPolicy,
      'Learn what the extension processes, what it never collects, and how to disable related capabilities.',
      'Local Configuration',
      '页面正文与剪藏内容',
      'Privacy Author Site Sentinel',
      'Privacy Reddit Sentinel',
      'https://sxnian.com',
      'https://www.reddit.com/user/sxnian/'
    );
    await closeResource();

    const dataUsage = await openResource('Data Usage Link Sentinel');
    expectText(
      dataUsage,
      'Data Usage Title Sentinel',
      'Data Usage Description Sentinel',
      'Data Usage Anonymous Title Sentinel',
      'Data Usage Anonymous Body Sentinel',
      'Data Usage Error Reporting Title Sentinel',
      'Data Usage Collected Title Sentinel',
      'Data Usage Collected Error Sentinel',
      'Data Usage Collected Timestamp Sentinel',
      'Data Usage Config Migration Title Sentinel',
      'Data Usage Config Migration Body Sentinel'
    );
    expectNoText(
      dataUsage,
      'Understand how usage metrics, error reports, and configuration transfer features use local or anonymous data.',
      'Anonymous Usage Counts',
      'Configuration Migration',
      '匿名功能使用次数'
    );
    await closeResource();

    const terms = renderResourcePage('terms-of-use');
    expectText(
      terms,
      'Terms Title Sentinel',
      'Terms Effective Body Sentinel',
      'Terms Contact Body Sentinel',
      'Terms Email Sentinel',
      'Terms GitHub Issues Sentinel'
    );
    expectLegalContactLinks(terms);
    expectNoText(
      terms,
      'Terms of Use',
      '使用协议',
      'Terms Author Site Sentinel',
      'Terms Reddit Sentinel',
      'https://sxnian.com',
      'https://www.reddit.com/user/sxnian/'
    );
  });

  it('uses Chinese legal copy only for zh-CN and zh-TW while other interface languages use English', async () => {
    const zhHansMessages = await getMessagesForLanguage('zh-CN');
    const zhHantMessages = await getMessagesForLanguage('zh-TW');
    const japaneseMessages = await getMessagesForLanguage('ja');

    expect(zhHansMessages.schemaResourceTermsTitle).toBe('使用协议');
    expect(zhHansMessages.schemaResourcePrivacyPolicyTitle).toBe('隐私政策');
    expect(zhHansMessages.schemaResourcePrivacyPolicyLocalFirstBody).toContain(
      '默认情况下，Zendio 不会把页面内容发送给开发者'
    );
    expect(zhHansMessages.schemaResourcePrivacyPolicyContactBody).toContain('隐私相关问题或请求');
    expect(zhHansMessages.schemaResourcePrivacyPolicyContactBody).toContain(
      'href="mailto:zendio@sxnian.com"'
    );
    expect(zhHansMessages.schemaResourcePrivacyPolicyContactBody).toContain(
      'href="https://github.com/Lefeaker/zendio/issues"'
    );
    expect(zhHansMessages.schemaResourcePrivacyPolicyContactBody).not.toContain('如果你认可本项目');
    expect(zhHansMessages.schemaResourcePrivacyPolicyContactBody).not.toContain(
      'href="https://sxnian.com"'
    );

    expect(zhHantMessages.schemaResourceTermsTitle).toBe('使用协议');
    expect(zhHantMessages.privacyPolicyLink).toBe('隐私政策');
    expect(zhHantMessages.schemaResourcePrivacyPolicyTelemetryBody).toContain('匿名使用统计');
    expect(zhHantMessages.schemaResourceTermsContactBody).toContain('本使用協議');
    expect(zhHantMessages.schemaResourceTermsContactBody).toContain(
      'href="mailto:zendio@sxnian.com"'
    );
    expect(zhHantMessages.schemaResourceTermsContactBody).not.toContain('如果你认可本项目');

    expect(japaneseMessages.schemaResourceTermsTitle).toBe('Terms of Use');
    expect(japaneseMessages.schemaResourcePrivacyPolicyTitle).toBe('Privacy Policy');
    expect(japaneseMessages.onboardingTermsOfUseLink).toBe('Terms of Use');
    expect(japaneseMessages.schemaResourcePrivacyPolicyLocalFirstBody).toContain(
      'Zendio does not send page content to the developer by default'
    );
    expect(japaneseMessages.schemaResourceTermsContactBody).toContain(
      'For questions about these terms'
    );
    expect(japaneseMessages.schemaResourceTermsContactBody).toContain(
      'href="mailto:zendio@sxnian.com"'
    );
    expect(japaneseMessages.schemaResourceTermsContactBody).toContain(
      'href="https://github.com/Lefeaker/zendio/issues"'
    );
    expect(japaneseMessages.schemaResourceTermsContactBody).not.toContain(
      'If you appreciate this project or want to connect'
    );
  });

  it('renders zh-CN changelog copy from the active catalog instead of raw appData text', async () => {
    const zhMessages = await getMessagesForLanguage('zh-CN');

    const changelog = renderResourcePage('changelog', {
      language: 'zh-CN',
      messages: zhMessages,
      mutateAppData(appData) {
        appData.resources.changelog.hero.title = 'RAW CHANGELOG TITLE SENTINEL';
        appData.resources.changelog.hero.description = 'RAW CHANGELOG DESCRIPTION SENTINEL';
        appData.resources.changelog.entries[0].bullets[0] = 'RAW CHANGELOG BULLET SENTINEL';
      }
    });

    expectText(
      changelog,
      zhMessages.schemaResourceChangelogTitle,
      zhMessages.schemaResourceChangelogDescription,
      zhMessages.schemaResourceChangelogV021Summary,
      zhMessages.schemaResourceChangelogV021Bullet1
    );
    expectNoText(
      changelog,
      'RAW CHANGELOG TITLE SENTINEL',
      'RAW CHANGELOG DESCRIPTION SENTINEL',
      'RAW CHANGELOG BULLET SENTINEL',
      'RAW CHANGELOG NOTES TITLE SENTINEL',
      'RAW CHANGELOG NOTE ITEM SENTINEL',
      '使用建议'
    );
  });

  it('falls back to English resource copy when selected catalog keys are missing', async () => {
    const fallbackProbeMessages: Messages = {
      ...ENGLISH_SENTINEL_MESSAGES,
      schemaResourceSupportTitle: '',
      schemaResourceSupportDescription: '',
      schemaResourceChangelogTitle: '',
      schemaResourceChangelogDescription: '',
      schemaResourceChangelogV021Bullet1: ''
    };

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: fallbackProbeMessages,
      language: 'en'
    });

    const support = await openResource('Support');
    expectText(support, 'Support', 'Support the project through the available public channels.');
    expectNoText(
      support,
      'Support Scope',
      'Install, upgrade, and environment setup questions.',
      '感谢支持',
      '开发不易，如果这个插件对你有帮助，欢迎通过以下方式支持。'
    );
    await closeResource();

    const changelog = await openResource('Changelog');
    expectText(
      changelog,
      'Changelog',
      'This modal highlights the latest shipped updates from the project changelog.',
      'AI chat export stability has been improved.'
    );
    expectNoText(
      changelog,
      'Notes',
      'Configure the default vault first, then add extra vaults and routing rules as needed.',
      '更新日志',
      '重构选项页为新的设置中心',
      '先在 Storage 中配置默认仓库',
      '这里直接使用项目中的更新日志重点内容。'
    );
  });
});
