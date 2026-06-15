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

const ENGLISH_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaResourceOnboardingTitle: 'Onboarding Title Sentinel',
  schemaResourceOnboardingDescription: 'Onboarding Description Sentinel',
  schemaResourceOnboardingGuideFlowTitle: 'Onboarding Flow Sentinel',
  schemaResourceOnboardingStepsTitle: 'Onboarding Steps Sentinel',
  step1Title: 'Onboarding Step 1 Title Sentinel',
  step1Description: 'Onboarding Step 1 Description Sentinel',
  step1Detail1: 'Onboarding Step 1 Detail 1 Sentinel',
  step2Title: 'Onboarding Step 2 Title Sentinel',
  step2Description: 'Onboarding Step 2 Description Sentinel',
  step3Title: 'Onboarding Step 3 Title Sentinel',
  step3Description: 'Onboarding Step 3 Description Sentinel',
  step3Section1Title: 'Onboarding Step 3 Section 1 Sentinel',
  step4Title: 'Onboarding Step 4 Title Sentinel',
  step4Detail4: 'Onboarding Step 4 Detail 4 Sentinel',
  step5Title: 'Onboarding Step 5 Title Sentinel',
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
  schemaResourceSupportScopeGroupTitle: 'Support Scope Sentinel',
  schemaResourceSupportKoFiDescription: 'Support Ko-fi Description Sentinel',
  schemaResourceSupportAfdianDescription: 'Support Afdian Description Sentinel',
  schemaResourceSupportScope1: 'Support Scope 1 Sentinel',
  schemaResourceSupportScope2: 'Support Scope 2 Sentinel',
  schemaResourceSupportScope3: 'Support Scope 3 Sentinel',
  schemaResourceSupportScope4: 'Support Scope 4 Sentinel',
  schemaResourceSuggestionsTitle: 'Suggestions Title Sentinel',
  schemaResourceSuggestionsDescription: 'Suggestions Description Sentinel',
  schemaResourceSuggestionsChannelsGroupTitle: 'Suggestions Channels Sentinel',
  schemaResourceSuggestionsGithubDescription: 'Suggestions GitHub Description Sentinel',
  schemaResourceSuggestionsRedditDescription: 'Suggestions Reddit Description Sentinel',
  schemaResourceContactTitle: 'Contact Title Sentinel',
  schemaResourceContactHint: 'Contact Hint Sentinel',
  schemaResourceContactDescription:
    'Contact Body Sentinel <a href="https://www.reddit.com/user/sxnian/" target="_blank" rel="noopener noreferrer">Reddit</a> Contact HTML Sentinel',
  schemaResourceContactChannelsGroupTitle: 'Contact Channels Sentinel',
  schemaResourceContactRedditTitle: 'Contact Reddit Title Sentinel',
  schemaResourceContactGithubTitle: 'Contact GitHub Title Sentinel',
  schemaResourceContactEmailTitle: 'Contact Email Title Sentinel',
  schemaResourceChangelogTitle: 'Changelog Title Sentinel',
  schemaResourceChangelogDescription: 'Changelog Description Sentinel',
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
  schemaResourceChangelogUsageAdviceTitle: 'Changelog Usage Advice Sentinel',
  schemaResourceChangelogUsageAdvice1: 'Changelog Usage Advice 1 Sentinel',
  schemaResourceChangelogUsageAdvice2: 'Changelog Usage Advice 2 Sentinel',
  schemaResourceChangelogUsageAdvice3: 'Changelog Usage Advice 3 Sentinel',
  schemaResourceChangelogV010Bullet1: 'Changelog v0.1.0 Bullet 1 Sentinel',
  schemaResourceChangelogV010Bullet2: 'Changelog v0.1.0 Bullet 2 Sentinel',
  schemaResourceChangelogV010Bullet3: 'Changelog v0.1.0 Bullet 3 Sentinel',
  schemaResourceChangelogV010Bullet4: 'Changelog v0.1.0 Bullet 4 Sentinel',
  schemaResourceChangelogV010Bullet5: 'Changelog v0.1.0 Bullet 5 Sentinel',
  schemaResourceChangelogV010Bullet6: 'Changelog v0.1.0 Bullet 6 Sentinel',
  privacyPolicyLink: 'Privacy Policy Link Sentinel',
  schemaResourcePrivacyPolicyTitle: 'Privacy Policy Title Sentinel',
  schemaResourcePrivacyPolicyDescription: 'Privacy Policy Description Sentinel',
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
  schemaResourceDataUsageConfigMigrationBody: 'Data Usage Config Migration Body Sentinel'
} as Messages;

type ResourceRenderOptions = {
  language?: 'en' | 'zh-CN';
  messages?: Messages;
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

describe('mountProductionStitchShell resource i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('opens onboarding through the production page path and renders onboarding copy from generated messages', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

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
      'Onboarding Step 1 Title Sentinel',
      'Onboarding Step 1 Description Sentinel',
      'Onboarding Step 1 Detail 1 Sentinel',
      'Onboarding Step 2 Title Sentinel',
      'Onboarding Step 2 Description Sentinel',
      'Onboarding Step 3 Title Sentinel',
      'Onboarding Step 3 Section 1 Sentinel',
      'Onboarding Step 4 Title Sentinel',
      'Onboarding Step 4 Detail 4 Sentinel',
      'Onboarding Step 5 Title Sentinel',
      'Onboarding Step 5 Detail 3 Sentinel'
    );
    expectNoText(
      onboardingPage,
      '配置 Obsidian Local REST API',
      '欢迎提出建议，开发不易，感谢支持'
    );
  });

  it('renders footer resource modals from sentinel English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const pluginSetup = await openResource('Plugin Setup Title Sentinel');
    expectText(
      pluginSetup,
      'Plugin Setup Title Sentinel',
      'Plugin Setup Description Sentinel',
      'Plugin Recommended Values Sentinel',
      'Plugin Setup Flow Sentinel',
      'Plugin Checklist Sentinel',
      'Plugin HTTPS Field Sentinel',
      'Plugin HTTP Field Sentinel',
      'Plugin Vault Field Sentinel',
      'Plugin API Key Field Sentinel',
      'Plugin Go Storage Sentinel',
      'Plugin Setup Step 1 Sentinel',
      'Plugin Setup Step 5 Sentinel',
      'Plugin Checklist Item 1 Sentinel',
      'Plugin Checklist Item 5 Sentinel'
    );
    expectNoText(pluginSetup, '跳到 Storage');
    await closeResource();

    const support = await openResource('Support Title Sentinel');
    expectText(
      support,
      'Support Title Sentinel',
      'Support Description Sentinel',
      'Support Channels Sentinel',
      'Support Scope Sentinel',
      'Support Ko-fi Description Sentinel',
      'Support Afdian Description Sentinel',
      'Support Scope 1 Sentinel',
      'Support Scope 4 Sentinel'
    );
    expectNoText(support, '感谢支持');
    await closeResource();

    const suggestions = await openResource('Suggestions Title Sentinel');
    expectText(
      suggestions,
      'Suggestions Title Sentinel',
      'Suggestions Description Sentinel',
      'Suggestions Channels Sentinel',
      'Suggestions GitHub Description Sentinel',
      'Suggestions Reddit Description Sentinel'
    );
    await closeResource();

    const contact = await openResource('Contact Title Sentinel');
    expectText(
      contact,
      'Contact Title Sentinel',
      'Contact Body Sentinel',
      'Contact Channels Sentinel',
      'Contact Reddit Title Sentinel',
      'Contact GitHub Title Sentinel',
      'Contact Email Title Sentinel',
      'https://www.reddit.com/user/sxnian/',
      'https://github.com/Lefeaker/AllinOB',
      'allinobsidian@outlook.com'
    );
    await closeResource();

    const changelog = await openResource('Changelog Title Sentinel');
    expectText(
      changelog,
      'Changelog Title Sentinel',
      'Changelog Description Sentinel',
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
      'Changelog Usage Advice Sentinel',
      'Changelog Usage Advice 1 Sentinel',
      'Changelog Usage Advice 2 Sentinel',
      'Changelog Usage Advice 3 Sentinel',
      'Changelog v0.1.0 Bullet 1 Sentinel',
      'Changelog v0.1.0 Bullet 2 Sentinel',
      'Changelog v0.1.0 Bullet 3 Sentinel',
      'Changelog v0.1.0 Bullet 4 Sentinel',
      'Changelog v0.1.0 Bullet 5 Sentinel',
      'Changelog v0.1.0 Bullet 6 Sentinel'
    );
    expectNoText(
      changelog,
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
      'Privacy Not Collected Sentinel',
      'Privacy Not Collected Content Sentinel',
      'Privacy Not Collected Personal Sentinel',
      'Privacy Analytics Title Sentinel',
      'Privacy Analytics Description Sentinel',
      'Privacy Error Reporting Title Sentinel',
      'Privacy Error Reporting Description Sentinel',
      'Privacy Local Config Title Sentinel',
      'Privacy Local Config Body Sentinel'
    );
    expectNoText(privacyPolicy, '页面正文与剪藏内容');
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
    expectNoText(dataUsage, '匿名功能使用次数');
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
        appData.resources.changelog.entries[0].notes = [
          {
            title: 'RAW CHANGELOG NOTES TITLE SENTINEL',
            items: ['RAW CHANGELOG NOTE ITEM SENTINEL']
          }
        ];
      }
    });

    expectText(
      changelog,
      zhMessages.schemaResourceChangelogTitle,
      zhMessages.schemaResourceChangelogDescription,
      zhMessages.schemaResourceChangelogV020Bullet1,
      zhMessages.schemaResourceChangelogUsageAdviceTitle,
      zhMessages.schemaResourceChangelogUsageAdvice1
    );
    expectNoText(
      changelog,
      'RAW CHANGELOG TITLE SENTINEL',
      'RAW CHANGELOG DESCRIPTION SENTINEL',
      'RAW CHANGELOG BULLET SENTINEL',
      'RAW CHANGELOG NOTES TITLE SENTINEL',
      'RAW CHANGELOG NOTE ITEM SENTINEL'
    );
  });

  it('falls back to English resource copy when selected catalog keys are missing', async () => {
    const fallbackProbeMessages: Messages = {
      ...ENGLISH_SENTINEL_MESSAGES,
      schemaResourceSupportTitle: '',
      schemaResourceSupportDescription: '',
      schemaResourceChangelogTitle: '',
      schemaResourceChangelogDescription: '',
      schemaResourceChangelogV020Bullet1: '',
      schemaResourceChangelogUsageAdviceTitle: '',
      schemaResourceChangelogUsageAdvice1: ''
    };

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: fallbackProbeMessages,
      language: 'en'
    });

    const support = await openResource('Support');
    expectText(support, 'Support', 'Support the project through the available public channels.');
    expectNoText(support, '感谢支持', '开发不易，如果这个插件对你有帮助，欢迎通过以下方式支持。');
    await closeResource();

    const changelog = await openResource('Changelog');
    expectText(
      changelog,
      'Changelog',
      'This modal highlights the latest shipped updates from the project changelog.',
      'Rebuilt Options as a new settings center for overview, language, privacy, storage, capture, output, and maintenance workflows.',
      'Notes',
      'Configure the default vault first, then add extra vaults and routing rules as needed.'
    );
    expectNoText(
      changelog,
      '更新日志',
      '重构选项页为新的设置中心',
      '先在 Storage 中配置默认仓库',
      '这里直接使用项目中的更新日志重点内容。'
    );
  });
});
