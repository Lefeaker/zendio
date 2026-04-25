import type { Messages } from '@i18n';
import type { ResourceSchema, SettingsSchema } from '@options/schema-runtime';
import { getChangelogByLanguage } from '@options/app/changelogContent';
import {
  SCHEMA_LANGUAGE_OPTIONS,
  SCHEMA_AI_PLATFORM_LINKS,
  SCHEMA_NAV_COPY,
  SCHEMA_PAGE_COPY,
  SCHEMA_RESOURCE_COPY,
  SCHEMA_RESOURCE_GROUP_COPY,
  SCHEMA_SELECT_OPTION_COPY,
  SCHEMA_SUBTITLE_LANGUAGE_OPTIONS,
  SCHEMA_TEMPLATE_TOKENS,
  resolveSchemaOverviewThemeCopy,
  resolveSchemaMessage,
  resolveSchemaOptionCopy
} from './content';
import {
  createResourceLinkCard,
  createResourceModalCard,
  createResourceModalSection,
  createResourceTextList
} from './helpers/resources';
import { createOutputWidgetGroup } from './helpers/output';
import {
  createAiPlatformShell,
  createDeepResearchNotice,
  createDeepResearchPureModeRow,
  createThemeSegmentedSwitch
} from './helpers/settings';
import { schemaClassNames } from './helpers/classNames';
import { createShellNavItem, createShellResourceGroup, SETTINGS_ORDER } from './helpers/shell';
import type { SchemaShellAppData, SchemaShellState } from './model';

export function createSchemaShellAppData(messages: Messages | null): SchemaShellAppData {
  return {
    brand: {
      title: resolveSchemaMessage(messages, 'extensionName'),
      subtitle: resolveSchemaMessage(messages, 'extensionSubtitle')
    },
    messages,
    panelOrder: [...SETTINGS_ORDER],
    settingsGroupTitle: resolveSchemaMessage(
      messages,
      SCHEMA_RESOURCE_GROUP_COPY.settingsGroupTitle
    ),
    nav: SETTINGS_ORDER.map((id) => createShellNavItem(id, messages)),
    resources: [createShellResourceGroup(messages)],
    languageOptions: [...SCHEMA_LANGUAGE_OPTIONS],
    subtitleLanguages: [...SCHEMA_SUBTITLE_LANGUAGE_OPTIONS],
    yamlFilterOptions: resolveSchemaOptionCopy(
      messages,
      SCHEMA_SELECT_OPTION_COPY.yamlFilterOptions
    ),
    readingPathModes: resolveSchemaOptionCopy(messages, SCHEMA_SELECT_OPTION_COPY.readingPathModes),
    templateTokens: [...SCHEMA_TEMPLATE_TOKENS]
  };
}

function createOverviewSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY.overview;
  return {
    id: 'overview',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.overview.label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.overview.hint),
    createView: (ctx) => {
      const themeCopy = resolveSchemaOverviewThemeCopy(ctx.state.language);

      return {
        id: 'overview',
        kind: 'page',
        hero: {
          title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.overview.label),
          description: resolveSchemaMessage(messages, copy.heroDescription)
        },
        children: [
          {
            kind: 'group',
            title: resolveSchemaMessage(messages, copy.groups.usage),
            children: [
              {
                kind: 'card',
                children: [
                  {
                    kind: 'widget',
                    widgetType: 'usage',
                    props: { options: ctx.state.options, messages: ctx.appData.messages }
                  }
                ]
              }
            ]
          },
          {
            kind: 'group',
            title: resolveSchemaMessage(messages, copy.groups.interface),
            children: [
              {
                kind: 'card',
                children: [
                  {
                    kind: 'element',
                    tag: 'div',
                    className: schemaClassNames.settings.interfaceThemeGrid,
                    children: [
                      {
                        kind: 'row',
                        title: resolveSchemaMessage(messages, copy.language.title),
                        className: 'schema-settings-language-row',
                        control: {
                          kind: 'select',
                          value: { source: 'state', path: 'language' },
                          options: { source: 'appData', path: 'languageOptions' },
                          action: { id: 'options:changeLanguage', valueFrom: 'target.value' }
                        }
                      },
                      createThemeSegmentedSwitch({
                        title: themeCopy.title,
                        options: themeCopy.options,
                        getValue: () => ''
                      })
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'group',
            title: resolveSchemaMessage(messages, copy.groups.privacy),
            children: [
              {
                kind: 'card',
                children: [
                  {
                    kind: 'widget',
                    widgetType: 'privacy',
                    props: { options: ctx.state.options, messages: ctx.appData.messages }
                  }
                ]
              }
            ]
          }
        ]
      };
    }
  };
}

function createStorageSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY.storage;
  return {
    id: 'storage',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.storage.label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.storage.hint),
    createView: (ctx) => ({
      id: 'storage',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.storage.label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.vaults),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'widget',
                  widgetType: 'restStorage',
                  props: { options: ctx.state.options, messages: ctx.appData.messages }
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.routing),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'widget',
                  widgetType: 'vaultRouter',
                  props: { options: ctx.state.options, messages: ctx.appData.messages }
                }
              ]
            }
          ]
        }
      ]
    })
  };
}

function createCaptureSourcesSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY['capture-sources'];
  return {
    id: 'capture-sources',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-sources'].label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-sources'].hint),
    createView: (ctx) => ({
      id: 'capture-sources',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-sources'].label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.aiChat),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'stack',
                  children: [
                    createAiPlatformShell(
                      resolveSchemaMessage(messages, copy.aiChat.platformsTitle),
                      SCHEMA_AI_PLATFORM_LINKS.map((platform) => ({
                        label: resolveSchemaMessage(messages, platform.label),
                        href: platform.href
                      }))
                    ),
                    {
                      kind: 'row',
                      title: resolveSchemaMessage(messages, copy.aiChat.userNameTitle),
                      description: resolveSchemaMessage(messages, copy.aiChat.userNameDescription),
                      control: {
                        kind: 'input',
                        bind: { source: 'state', path: 'options.aiChat.userName' },
                        placeholder: resolveSchemaMessage(
                          messages,
                          copy.aiChat.userNamePlaceholder
                        ),
                        action: {
                          id: 'aiChat:updateUserName',
                          valueFrom: 'target.value'
                        }
                      }
                    },
                    {
                      kind: 'row',
                      title: resolveSchemaMessage(messages, copy.aiChat.timestampsTitle),
                      description: resolveSchemaMessage(
                        messages,
                        copy.aiChat.timestampsDescription
                      ),
                      control: {
                        kind: 'switch',
                        checked: false,
                        disabled: true,
                        stateText: resolveSchemaMessage(messages, copy.state.disabled)
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.deepResearch),
          children: [
            {
              kind: 'card',
              children: [
                createDeepResearchPureModeRow(
                  resolveSchemaMessage(messages, copy.deepResearch.pureModeTitle),
                  resolveSchemaMessage(messages, copy.deepResearch.pureModeDescription),
                  (current) =>
                    current.state.options.deepResearch.pureMode
                      ? resolveSchemaMessage(messages, copy.state.enabled)
                      : resolveSchemaMessage(messages, copy.state.disabled),
                  {
                    id: 'options:setValue',
                    args: ['deepResearch.pureMode'],
                    valueFrom: 'target.checked'
                  }
                ),
                createDeepResearchNotice(
                  resolveSchemaMessage(messages, copy.deepResearch.reportsNoticeTitle),
                  resolveSchemaMessage(messages, copy.deepResearch.reportsNoticeBody)
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.video),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'widget',
                  widgetType: 'videoSettings',
                  props: { options: ctx.state.options, messages: ctx.appData.messages }
                }
              ]
            }
          ]
        }
      ]
    })
  };
}

function createCaptureBehaviorSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY['capture-behavior'];
  return {
    id: 'capture-behavior',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-behavior'].label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-behavior'].hint),
    createView: (ctx) => ({
      id: 'capture-behavior',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY['capture-behavior'].label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.reading),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'widget',
                  widgetType: 'readingSettings',
                  props: { options: ctx.state.options, messages: ctx.appData.messages }
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.fragment),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'widget',
                  widgetType: 'fragmentSettings',
                  props: { options: ctx.state.options, messages: ctx.appData.messages }
                }
              ]
            }
          ]
        }
      ]
    })
  };
}

function createOutputSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY.output;
  return {
    id: 'output',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.output.label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.output.hint),
    createView: (ctx) => ({
      id: 'output',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.output.label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        ...[
          {
            title: resolveSchemaMessage(messages, copy.groups.templates),
            widgetType: 'templates'
          },
          {
            title: resolveSchemaMessage(messages, copy.groups.domainMappings),
            widgetType: 'domainMappings'
          },
          {
            title: resolveSchemaMessage(messages, copy.groups.yaml),
            widgetType: 'yamlConfig'
          }
        ].map((section) =>
          createOutputWidgetGroup(
            section.title,
            section.widgetType,
            ctx.state.options,
            ctx.appData.messages
          )
        )
      ]
    })
  };
}

function createExperimentalSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY.experimental;
  return {
    id: 'experimental',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.experimental.label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.experimental.hint),
    createView: () => ({
      id: 'experimental',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.experimental.label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.aiService),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'field',
                  label: resolveSchemaMessage(messages, copy.aiFields.provider),
                  control: {
                    kind: 'input',
                    bind: { source: 'state', path: 'options.experimentalAi.provider' },
                    action: {
                      id: 'options:setValue',
                      args: ['experimentalAi.provider'],
                      valueFrom: 'target.value'
                    }
                  }
                },
                {
                  kind: 'field',
                  label: resolveSchemaMessage(messages, copy.aiFields.model),
                  control: {
                    kind: 'input',
                    bind: { source: 'state', path: 'options.experimentalAi.model' },
                    action: {
                      id: 'options:setValue',
                      args: ['experimentalAi.model'],
                      valueFrom: 'target.value'
                    }
                  }
                },
                {
                  kind: 'field',
                  label: resolveSchemaMessage(messages, copy.aiFields.apiUrl),
                  control: {
                    kind: 'input',
                    bind: { source: 'state', path: 'options.experimentalAi.apiUrl' },
                    action: {
                      id: 'options:setValue',
                      args: ['experimentalAi.apiUrl'],
                      valueFrom: 'target.value'
                    }
                  }
                },
                {
                  kind: 'field',
                  label: resolveSchemaMessage(messages, copy.aiFields.apiKey),
                  control: {
                    kind: 'input',
                    type: 'password',
                    bind: { source: 'state', path: 'options.experimentalAi.apiKey' },
                    action: {
                      id: 'options:setValue',
                      args: ['experimentalAi.apiKey'],
                      valueFrom: 'target.value'
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.pageSummary),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'row',
                  title: resolveSchemaMessage(messages, copy.pageSummaryRows.saveSummaryTitle),
                  description: resolveSchemaMessage(
                    messages,
                    copy.pageSummaryRows.saveSummaryDescription
                  ),
                  control: {
                    kind: 'switch',
                    bind: { source: 'state', path: 'options.pageSummary.enabled' },
                    stateText: (current) =>
                      current.state.options.pageSummary.enabled
                        ? resolveSchemaMessage(messages, copy.state.enabled)
                        : resolveSchemaMessage(messages, copy.state.disabled),
                    action: {
                      id: 'options:setValue',
                      args: ['pageSummary.enabled'],
                      valueFrom: 'target.checked'
                    }
                  }
                },
                {
                  kind: 'row',
                  title: resolveSchemaMessage(messages, copy.pageSummaryRows.overlayTitle),
                  description: resolveSchemaMessage(
                    messages,
                    copy.pageSummaryRows.overlayDescription
                  ),
                  control: {
                    kind: 'switch',
                    bind: { source: 'state', path: 'options.readingOverlaySummary.enabled' },
                    stateText: (current) =>
                      current.state.options.readingOverlaySummary.enabled
                        ? resolveSchemaMessage(messages, copy.state.enabled)
                        : resolveSchemaMessage(messages, copy.state.disabled),
                    action: {
                      id: 'options:setValue',
                      args: ['readingOverlaySummary.enabled'],
                      valueFrom: 'target.checked'
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.subtitle),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'row',
                  title: resolveSchemaMessage(messages, copy.subtitleRows.toggleTitle),
                  description: resolveSchemaMessage(messages, copy.subtitleRows.toggleDescription),
                  control: {
                    kind: 'switch',
                    bind: { source: 'state', path: 'options.subtitleTranslation.enabled' },
                    stateText: (current) =>
                      current.state.options.subtitleTranslation.enabled
                        ? resolveSchemaMessage(messages, copy.state.enabled)
                        : resolveSchemaMessage(messages, copy.state.disabled),
                    action: {
                      id: 'options:setValue',
                      args: ['subtitleTranslation.enabled'],
                      valueFrom: 'target.checked'
                    }
                  }
                },
                {
                  kind: 'row',
                  title: resolveSchemaMessage(messages, copy.subtitleRows.targetTitle),
                  description: resolveSchemaMessage(messages, copy.subtitleRows.targetDescription),
                  control: {
                    kind: 'select',
                    bind: { source: 'state', path: 'options.subtitleTranslation.targetLanguage' },
                    options: { source: 'appData', path: 'subtitleLanguages' },
                    action: {
                      id: 'options:setValue',
                      args: ['subtitleTranslation.targetLanguage'],
                      valueFrom: 'target.value'
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    })
  };
}

function createMaintenanceSchema(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_PAGE_COPY.maintenance;
  return {
    id: 'maintenance',
    navLabel: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.maintenance.label),
    navHint: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.maintenance.hint),
    createView: (ctx) => ({
      id: 'maintenance',
      kind: 'page',
      hero: {
        title: resolveSchemaMessage(messages, SCHEMA_NAV_COPY.maintenance.label),
        description: resolveSchemaMessage(messages, copy.heroDescription)
      },
      children: [
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.transfer),
          children: [
            {
              kind: 'card',
              children: [
                {
                  kind: 'stack',
                  children: [
                    {
                      kind: 'button',
                      label: resolveSchemaMessage(messages, copy.transfer.copyButton),
                      variant: 'primary',
                      action: { id: 'maintenance:copyConfig' }
                    },
                    {
                      kind: 'button',
                      label: resolveSchemaMessage(messages, copy.transfer.importButton),
                      variant: 'secondary',
                      action: { id: 'maintenance:importConfig' }
                    },
                    ctx.state.transferLogMessage
                      ? {
                          kind: 'notice',
                          title: resolveSchemaMessage(messages, copy.transfer.lastActionTitle),
                          body: ctx.state.transferLogMessage,
                          variant: 'info'
                        }
                      : null
                  ]
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: resolveSchemaMessage(messages, copy.groups.diagnosis),
          children: [
            {
              kind: 'card',
              actions: [
                {
                  kind: 'button',
                  label: resolveSchemaMessage(messages, copy.diagnosis.diagnoseButton),
                  variant: 'primary',
                  action: { id: 'maintenance:runDiagnostics' }
                },
                {
                  kind: 'button',
                  label: resolveSchemaMessage(messages, copy.diagnosis.fixButton),
                  variant: 'danger',
                  action: { id: 'maintenance:fixConfiguration' }
                },
                {
                  kind: 'button',
                  label: resolveSchemaMessage(messages, copy.diagnosis.reloadButton),
                  variant: 'ghost',
                  action: { id: 'maintenance:reloadDiagnostics' }
                }
              ],
              children: [
                {
                  kind: 'element',
                  tag: 'div',
                  attrs: { id: 'diagSection' },
                  children: [
                    {
                      kind: 'element',
                      tag: 'pre',
                      attrs: { id: 'diagOutput' },
                      text: { source: 'state', path: 'diagnosisOutput' }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
  };
}

function createPluginSetupResource(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_RESOURCE_COPY.pluginSetup;
  return {
    id: 'plugin-setup',
    label: resolveSchemaMessage(messages, copy.title),
    hint: resolveSchemaMessage(
      messages,
      SCHEMA_RESOURCE_GROUP_COPY.resources.items['plugin-setup'].hint
    ),
    openMode: 'modal',
    createView: () => ({
      id: 'plugin-setup',
      kind: 'modal',
      title: resolveSchemaMessage(messages, copy.title),
      description: resolveSchemaMessage(messages, copy.description),
      size: 'large',
      children: [
        createResourceModalSection(
          resolveSchemaMessage(messages, copy.sections.recommendedValues),
          [
            createResourceModalCard([
              {
                kind: 'table',
                columns: [
                  resolveSchemaMessage(messages, copy.table.fieldColumn),
                  resolveSchemaMessage(messages, copy.table.valueColumn)
                ],
                rows: [
                  {
                    cells: [
                      { text: resolveSchemaMessage(messages, copy.fields.httpsUrl) },
                      { text: 'https://127.0.0.1:27124/' }
                    ]
                  },
                  {
                    cells: [
                      { text: resolveSchemaMessage(messages, copy.fields.httpUrl) },
                      { text: 'http://127.0.0.1:27123/' }
                    ]
                  },
                  {
                    cells: [
                      { text: resolveSchemaMessage(messages, copy.fields.vault) },
                      { text: 'your-vault-name' }
                    ]
                  },
                  {
                    cells: [
                      { text: resolveSchemaMessage(messages, copy.fields.apiKey) },
                      { text: 'your-api-key' }
                    ]
                  }
                ]
              }
            ])
          ]
        ),
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.setupFlow), [
          createResourceModalCard([createResourceTextList(messages, copy.steps)])
        ]),
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.checklist), [
          createResourceModalCard([
            createResourceTextList(messages, copy.checklist),
            {
              kind: 'button',
              label: resolveSchemaMessage(messages, copy.goToStorageButton),
              variant: 'primary',
              action: { id: 'navigation:activatePanel', args: ['storage'] }
            }
          ])
        ])
      ]
    })
  };
}

function createSupportResource(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_RESOURCE_COPY.support;
  return {
    id: 'support',
    label: resolveSchemaMessage(messages, copy.title),
    hint: resolveSchemaMessage(messages, SCHEMA_RESOURCE_GROUP_COPY.resources.items.support.hint),
    openMode: 'modal',
    createView: () => ({
      id: 'support',
      kind: 'modal',
      title: resolveSchemaMessage(messages, copy.title),
      description: resolveSchemaMessage(messages, copy.description),
      children: [
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.channels), [
          createResourceLinkCard(
            messages,
            copy.cards.koFiTitle,
            copy.cards.koFiDescription,
            'https://ko-fi.com/xiannian'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.afdianTitle,
            copy.cards.afdianDescription,
            'https://afdian.com/a/LefShi'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.emailTitle,
            copy.cards.emailDescription,
            'mailto:allinobsidian@outlook.com'
          )
        ]),
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.scope), [
          createResourceModalCard([createResourceTextList(messages, copy.scope)])
        ])
      ]
    })
  };
}

function createSuggestionsResource(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_RESOURCE_COPY.suggestions;
  return {
    id: 'suggestions',
    label: resolveSchemaMessage(messages, copy.title),
    hint: resolveSchemaMessage(
      messages,
      SCHEMA_RESOURCE_GROUP_COPY.resources.items.suggestions.hint
    ),
    openMode: 'modal',
    createView: () => ({
      id: 'suggestions',
      kind: 'modal',
      title: resolveSchemaMessage(messages, copy.title),
      description: resolveSchemaMessage(messages, copy.description),
      children: [
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.channels), [
          createResourceLinkCard(
            messages,
            copy.cards.githubTitle,
            copy.cards.githubDescription,
            'https://github.com/Lefeaker/AllinOB/issues/new?labels=enhancement&title=%5B建议%5D%20'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.redditTitle,
            copy.cards.redditDescription,
            'https://www.reddit.com/user/sxnian/'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.xiaohongshuTitle,
            copy.cards.xiaohongshuDescription
          )
        ])
      ]
    })
  };
}

function createContactResource(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_RESOURCE_COPY.contact;
  return {
    id: 'contact',
    label: resolveSchemaMessage(messages, copy.title),
    hint: resolveSchemaMessage(messages, SCHEMA_RESOURCE_GROUP_COPY.resources.items.contact.hint),
    openMode: 'modal',
    createView: () => ({
      id: 'contact',
      kind: 'modal',
      title: resolveSchemaMessage(messages, copy.title),
      children: [
        createResourceModalCard([
          {
            kind: 'element',
            tag: 'div',
            html: resolveSchemaMessage(messages, copy.description)
          }
        ]),
        createResourceModalSection(resolveSchemaMessage(messages, copy.sections.channels), [
          createResourceLinkCard(
            messages,
            copy.cards.redditTitle,
            copy.cards.redditDescription,
            'https://www.reddit.com/user/sxnian/'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.githubTitle,
            copy.cards.githubDescription,
            'https://github.com/Lefeaker/AllinOB'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.emailTitle,
            copy.cards.emailDescription,
            'mailto:allinobsidian@outlook.com'
          ),
          createResourceLinkCard(
            messages,
            copy.cards.wechatTitle,
            copy.cards.wechatDescription,
            undefined,
            copy.cards.wechatNote
          )
        ])
      ]
    })
  };
}

function createChangelogResource(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const copy = SCHEMA_RESOURCE_COPY.changelog;
  return {
    id: 'changelog',
    label: resolveSchemaMessage(messages, copy.title),
    hint: resolveSchemaMessage(messages, copy.hint),
    openMode: 'modal',
    createView: (ctx) => ({
      id: 'changelog',
      kind: 'modal',
      title: resolveSchemaMessage(messages, copy.title),
      description: resolveSchemaMessage(messages, 'versionNumber'),
      size: 'large',
      children: [
        {
          kind: 'card',
          children: [
            {
              kind: 'element',
              tag: 'div',
              className: 'schema-changelog-html',
              html: getChangelogByLanguage(ctx.state.language)
            }
          ]
        }
      ]
    })
  };
}

export function createSettingsSchemas(
  messages: Messages | null
): SettingsSchema<SchemaShellState, SchemaShellAppData>[] {
  return [
    createOverviewSchema(messages),
    createStorageSchema(messages),
    createCaptureSourcesSchema(messages),
    createCaptureBehaviorSchema(messages),
    createOutputSchema(messages),
    createExperimentalSchema(messages),
    createMaintenanceSchema(messages)
  ];
}

export function createResourceSchemas(
  messages: Messages | null
): ResourceSchema<SchemaShellState, SchemaShellAppData>[] {
  return [
    {
      id: 'onboarding',
      label: resolveSchemaMessage(
        messages,
        SCHEMA_RESOURCE_GROUP_COPY.resources.items.onboarding.label
      ),
      hint: resolveSchemaMessage(
        messages,
        SCHEMA_RESOURCE_GROUP_COPY.resources.items.onboarding.hint
      ),
      openMode: 'page',
      href: '../onboarding/index.html',
      createView: () => ({
        id: 'onboarding',
        kind: 'standalone-page',
        title: resolveSchemaMessage(messages, SCHEMA_RESOURCE_COPY.onboarding.title)
      })
    },
    createPluginSetupResource(messages),
    createSupportResource(messages),
    createSuggestionsResource(messages),
    createContactResource(messages),
    createChangelogResource(messages)
  ];
}
