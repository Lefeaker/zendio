import { configProvider } from '@shared/config';
import type { NodeChild, NodeSchema, ResourceStep, SchemaContext, ViewSchema } from '../../types';
import { code } from '../builders/primitives';
import {
  heroPills,
  modalSection,
  modalSectionHead,
  modalSectionRaw,
  resourceModalStack,
  stepCard,
  stepGrid
} from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

type SetupGuideKind = 'standalone-page' | 'modal';
type SetupGuideBrowserTarget = 'chrome' | 'firefox';
type SetupGuideStepKeys = {
  title: SchemaMessageKey;
  description: SchemaMessageKey;
  details: readonly SchemaMessageKey[];
};

interface SetupGuideOptions {
  id: string;
  kind: SetupGuideKind;
}

const FIREFOX_STEP1_KEYS: SetupGuideStepKeys = {
  title: 'step1Title',
  description: 'step1Description',
  details: [
    'step1Detail1',
    'step1Detail2',
    'step1Detail3',
    'step1Detail4',
    'step1Detail5',
    'step1Detail6'
  ]
};
const CHROME_STEP1_KEYS: SetupGuideStepKeys = {
  title: 'step1ChromeTitle',
  description: 'step1ChromeDescription',
  details: [
    'step1ChromeDetail1',
    'step1ChromeDetail2',
    'step1ChromeDetail3',
    'step1ChromeDetail4',
    'step1ChromeDetail5',
    'step1ChromeDetail6'
  ]
};

function replaceGuideUrl(message: string, pattern: RegExp, value: string): string {
  return message.replace(pattern, value);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function getStep1Keys(ctx: Pick<SchemaContext, 'browserTarget'>): SetupGuideStepKeys {
  return ctx.browserTarget === 'firefox' ? FIREFOX_STEP1_KEYS : CHROME_STEP1_KEYS;
}

function setupActionFor(kind: SetupGuideKind, tr: (key: SchemaMessageKey) => string): NodeSchema {
  return {
    kind: 'button',
    label: tr('schemaResourcePluginSetupGoToStorageButton'),
    variant: kind === 'modal' ? 'primary' : 'secondary',
    action: {
      id:
        kind === 'modal'
          ? 'navigation:closeResourceAndScrollToPanel'
          : 'navigation:openMainAtPanel',
      args: ['storage']
    }
  };
}

function createConnectionValueRows(
  tr: (key: SchemaMessageKey) => string
): Array<[label: string, value: string]> {
  const restDefaults = configProvider.getRestDefaults();
  return [
    [tr('schemaResourcePluginSetupFieldHttpsUrl'), stripTrailingSlash(restDefaults.httpsUrl)],
    [tr('schemaResourcePluginSetupFieldHttpUrl'), stripTrailingSlash(restDefaults.httpUrl)],
    [tr('schemaResourcePluginSetupFieldVault'), restDefaults.vault],
    [tr('schemaResourcePluginSetupFieldApiKey'), restDefaults.apiKey]
  ];
}

function createConnectionSections(
  kind: SetupGuideKind,
  tr: (key: SchemaMessageKey) => string
): NodeChild[] {
  return [
    modalSection(tr('schemaResourceOnboardingGuideFlowTitle'), [
      heroPills([
        tr('apiConfigTitle'),
        tr('schemaResourcePluginSetupFieldHttpsUrl'),
        tr('schemaResourcePluginSetupFieldVault'),
        tr('testConnectionButton_short')
      ])
    ]),
    modalSection(tr('schemaResourcePluginSetupRecommendedValuesGroupTitle'), [
      {
        kind: 'table',
        columns: [tr('schemaCommonFieldColumnLabel'), tr('schemaCommonValueColumnLabel')],
        rows: createConnectionValueRows(tr).map(([label, value]) => ({
          cells: [{ text: label }, { node: code(value) }]
        }))
      }
    ]),
    modalSectionRaw([
      modalSectionHead(
        tr('schemaResourcePluginSetupSetupFlowGroupTitle'),
        setupActionFor(kind, tr)
      ),
      stepGrid(
        [
          tr('schemaResourcePluginSetupStep1'),
          tr('schemaResourcePluginSetupStep2'),
          tr('schemaResourcePluginSetupStep3'),
          tr('schemaResourcePluginSetupStep4'),
          tr('schemaResourcePluginSetupStep5')
        ].map((step, index) =>
          stepCard({
            number: String(index + 1),
            title: step,
            description: ''
          })
        ),
        true
      )
    ]),
    modalSection(tr('schemaResourcePluginSetupChecklistGroupTitle'), [
      {
        kind: 'list',
        items: [
          tr('schemaResourcePluginSetupChecklist1'),
          tr('schemaResourcePluginSetupChecklist2'),
          tr('schemaResourcePluginSetupChecklist3'),
          tr('schemaResourcePluginSetupChecklist4'),
          tr('schemaResourcePluginSetupChecklist5')
        ]
      }
    ])
  ];
}

function createOnboardingStepCards(
  ctx: SchemaContext,
  tr: (key: SchemaMessageKey) => string
): ResourceStep[] {
  const restDefaults = configProvider.getRestDefaults();
  const defaultHttpsUrl = stripTrailingSlash(restDefaults.httpsUrl);
  const defaultHttpUrl = stripTrailingSlash(restDefaults.httpUrl);
  const step1Keys = getStep1Keys(ctx);

  return [
    {
      number: '1',
      title: tr(step1Keys.title),
      description: tr(step1Keys.description),
      bullets: step1Keys.details.map((key) =>
        replaceGuideUrl(
          replaceGuideUrl(tr(key), /https:\/\/[^\s)]+/, defaultHttpsUrl),
          /http:\/\/[^\s)]+/,
          defaultHttpUrl
        )
      )
    },
    {
      number: '2',
      title: tr('step2Title'),
      description: tr('step2Description'),
      bullets: [tr('step2Detail1'), tr('step2Detail2'), tr('step2Detail3'), tr('step2Detail4')]
    },
    {
      number: '3',
      title: tr('step3Title'),
      description: tr('step3Description'),
      bullets: [
        `${tr('step3Section1Title')}: ${tr('step3Section1Detail1')}`,
        `${tr('step3Section1Title')}: ${tr('step3Section1Detail2')}`,
        `${tr('step3Section2Title')}: ${tr('step3Section2Detail1')}`,
        `${tr('step3Section2Title')}: ${tr('step3Section2Detail4')}`,
        `${tr('step3Section2Title')}: ${tr('step3Section2Detail7')}`,
        `${tr('step3Section3Title')}: ${tr('step3Section3Detail1')}`,
        `${tr('step3Section3Title')}: ${tr('step3Section3Detail4')}`,
        `${tr('step3Section3Title')}: ${tr('step3Section3Detail5')}`
      ]
    },
    {
      number: '4',
      title: tr('step4Title'),
      description: tr('step4Description'),
      bullets: [tr('step4Detail1'), tr('step4Detail2'), tr('step4Detail3'), tr('step4Detail4')]
    },
    {
      number: '5',
      title: tr('step5Title'),
      description: tr('step5Description'),
      bullets: [tr('step5Detail2'), tr('step5Detail3')]
    }
  ];
}

export function createSetupGuideView(ctx: SchemaContext, options: SetupGuideOptions): ViewSchema {
  const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
  const title = tr('schemaResourceOnboardingTitle');
  const description = tr('schemaResourceOnboardingDescription');
  const children = [
    resourceModalStack([
      ...createConnectionSections(options.kind, tr),
      modalSection(tr('schemaResourceOnboardingStepsTitle'), [
        stepGrid(createOnboardingStepCards(ctx, tr).map((step) => stepCard(step)))
      ])
    ])
  ];

  if (options.kind === 'modal') {
    return {
      id: options.id,
      kind: 'modal',
      title,
      description,
      size: 'large',
      children
    };
  }

  return {
    id: options.id,
    kind: 'standalone-page',
    hero: {
      title,
      description,
      pills: [
        tr('apiConfigTitle'),
        tr('schemaStorageVaultListTitle'),
        tr('schemaStorageRoutingGroupTitle'),
        tr('schemaOutputYamlGroupTitle')
      ],
      icon: 'rocket_launch'
    },
    children
  };
}
