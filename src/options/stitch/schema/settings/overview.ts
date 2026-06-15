import type { SchemaContext, SettingsSchema } from '../../types';
import { div, paragraph, stack, state, strong } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { themeSegmentedSwitch } from '../builders/settings';
import { boundSwitch } from '../builders/controls';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES, type SchemaMessageKey } from '../i18n';

function translate(current: SchemaContext, key: SchemaMessageKey, fallback: string): string {
  return current.t?.(key, fallback) ?? fallback;
}

function localizeOverviewStats(current: SchemaContext) {
  return current.appData.overview.stats.map((stat, index) => {
    switch (index) {
      case 0:
        return { ...stat, label: translate(current, 'usageTotalLabel', stat.label) };
      case 1:
        return { ...stat, label: translate(current, 'usageAiLabel', stat.label) };
      case 2:
        return { ...stat, label: translate(current, 'usageFragmentLabel', stat.label) };
      case 3:
        return { ...stat, label: translate(current, 'usageArticleLabel', stat.label) };
      default:
        return stat;
    }
  });
}

function resolvePrivacyCollected(current: SchemaContext): string[] {
  if (!current.messages) {
    return current.appData.privacyCollected;
  }

  return [
    translate(
      current,
      'errorReportingCollectedError',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingCollectedError
    ),
    translate(
      current,
      'errorReportingCollectedBrowser',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingCollectedBrowser
    ),
    translate(
      current,
      'errorReportingCollectedExtension',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingCollectedExtension
    ),
    translate(
      current,
      'errorReportingCollectedTimestamp',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingCollectedTimestamp
    ),
    translate(
      current,
      'schemaResourceDataUsageAnonymousUsageTitle',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceDataUsageAnonymousUsageTitle
    )
  ];
}

function resolvePrivacyExcluded(current: SchemaContext): string[] {
  if (!current.messages) {
    return current.appData.privacyExcluded;
  }

  return [
    translate(
      current,
      'errorReportingNotCollectedPersonal',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedPersonal
    ),
    translate(
      current,
      'errorReportingNotCollectedContent',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedContent
    ),
    translate(
      current,
      'errorReportingNotCollectedUrls',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedUrls
    ),
    translate(
      current,
      'errorReportingNotCollectedPasswords',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedPasswords
    )
  ];
}

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'overview',
      kind: 'page',
      hero: {
        ...ctx.appData.overview.hero,
        title: translate(ctx, 'schemaOverviewTitle', ctx.appData.overview.hero.title),
        description: translate(
          ctx,
          'schemaOverviewHeroDescription',
          ctx.appData.overview.hero.description
        )
      },
      children: [
        {
          kind: 'group',
          title: translate(
            ctx,
            'schemaOverviewUsageGroupTitle',
            DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewUsageGroupTitle
          ),
          children: [
            {
              kind: 'card',
              title: translate(ctx, 'usageDashboardTitle', 'Usage Dashboard'),
              description: translate(
                ctx,
                'usageDashboardSubtitle',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.usageDashboardSubtitle
              ),
              actions: [
                {
                  kind: 'button',
                  label: translate(
                    ctx,
                    'schemaOverviewOpenDiagnosisButton',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewOpenDiagnosisButton
                  ),
                  variant: 'secondary',
                  action: { id: 'navigation:scrollToPanel', args: ['maintenance'] }
                },
                {
                  kind: 'button',
                  label: translate(
                    ctx,
                    'schemaOverviewClearUsageDataButton',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewClearUsageDataButton
                  ),
                  variant: 'danger',
                  action: { id: 'overview:clearUsageData' }
                }
              ],
              body: [
                { kind: 'statsGrid', items: (current) => localizeOverviewStats(current) },
                { kind: 'usageChart' }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate(
            ctx,
            'schemaOverviewInterfaceGroupTitle',
            DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewInterfaceGroupTitle
          ),
          children: [
            {
              kind: 'card',
              body: [
                div(classNames.settings.interfaceThemeGrid, [
                  {
                    kind: 'field',
                    label: translate(
                      ctx,
                      'schemaOverviewLanguageRowTitle',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewLanguageRowTitle
                    ),
                    control: {
                      kind: 'select',
                      options: (current) => current.appData.languageOptions,
                      bind: 'previewLanguage',
                      onChange: {
                        id: 'preview:setLanguage',
                        valueFrom: 'target.value'
                      }
                    }
                  },
                  {
                    kind: 'field',
                    label: translate(
                      ctx,
                      'schemaOverviewThemeRowTitle',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewThemeRowTitle
                    ),
                    control: themeSegmentedSwitch()
                  }
                ])
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate(
            ctx,
            'schemaOverviewPrivacyGroupTitle',
            DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewPrivacyGroupTitle
          ),
          children: [
            {
              kind: 'card',
              title: translate(ctx, 'privacySettingsNote', 'Consent'),
              description: translate(
                ctx,
                'privacySettingsDescription',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.privacySettingsDescription
              ),
              body: [
                div('consent-inline-grid', [
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong(
                        translate(
                          ctx,
                          'analyticsConsentTitle',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.analyticsConsentTitle
                        )
                      ),
                      boundSwitch({
                        bind: 'privacyAnalytics',
                        compact: true,
                        onChange: {
                          id: 'overview:updatePrivacyConsent',
                          args: ['analytics'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    paragraph(
                      translate(
                        ctx,
                        'analyticsConsentDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.analyticsConsentDescription
                      ),
                      'consent-inline-copy'
                    )
                  ]),
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong(
                        translate(
                          ctx,
                          'errorReportingConsentTitle',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingConsentTitle
                        )
                      ),
                      boundSwitch({
                        bind: 'privacyErrorReporting',
                        compact: true,
                        onChange: {
                          id: 'overview:updatePrivacyConsent',
                          args: ['errorReporting'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    paragraph(
                      translate(
                        ctx,
                        'errorReportingConsentDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingConsentDescription
                      ),
                      'consent-inline-copy'
                    )
                  ])
                ]),
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: translate(
                        ctx,
                        'analyticsDebugTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.analyticsDebugTitle
                      ),
                      description: translate(
                        ctx,
                        'analyticsDebugDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.analyticsDebugDescription
                      ),
                      control: stack(
                        [
                          boundSwitch({
                            bind: 'privacyDebugMode',
                            compact: true,
                            disabled: (current) =>
                              !current.state.privacyAnalytics ||
                              !current.state.privacyErrorReporting,
                            onChange: {
                              id: 'overview:updatePrivacyConsent',
                              args: ['debugMode'],
                              valueFrom: 'target.checked'
                            }
                          }),
                          {
                            kind: 'badge',
                            label: translate(
                              ctx,
                              'schemaOverviewDebugModeDevOnlyBadge',
                              'Dev-only'
                            ),
                            variant: 'warning'
                          },
                          state((current) =>
                            current.state.privacyAnalytics && current.state.privacyErrorReporting
                              ? translate(
                                  current,
                                  'schemaOverviewDebugModeAvailableState',
                                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewDebugModeAvailableState
                                )
                              : translate(
                                  current,
                                  'schemaOverviewDebugModePrerequisiteState',
                                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewDebugModePrerequisiteState
                                )
                          )
                        ],
                        'switch-line debug-mode-inline'
                      )
                    }
                  ]
                },
                div('mini-card u-mt-block', [
                  strong(
                    translate(
                      ctx,
                      'schemaOverviewPrivacyReferenceTitle',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewPrivacyReferenceTitle
                    )
                  ),
                  div('data-means-grid u-mt-tight', [
                    div('data-means-block', [
                      strong(
                        translate(
                          ctx,
                          'errorReportingCollectedTitle',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingCollectedTitle
                        ),
                        'data-means-title'
                      ),
                      {
                        kind: 'list',
                        items: (current) => resolvePrivacyCollected(current)
                      }
                    ]),
                    div('data-means-block', [
                      strong(
                        translate(
                          ctx,
                          'errorReportingNotCollectedTitle',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedTitle
                        ),
                        'data-means-title'
                      ),
                      {
                        kind: 'list',
                        items: (current) => resolvePrivacyExcluded(current)
                      }
                    ]),
                    div('data-means-actions', [
                      {
                        kind: 'button',
                        label: translate(
                          ctx,
                          'clearAllAnalyticsData',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.clearAllAnalyticsData
                        ),
                        variant: 'danger',
                        action: { id: 'overview:clearAnalyticsData' }
                      },
                      {
                        kind: 'button',
                        label: translate(
                          ctx,
                          'privacyPolicyLink',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.privacyPolicyLink
                        ),
                        variant: 'ghost',
                        action: { id: 'resource:open', args: ['privacy-policy'] }
                      },
                      {
                        kind: 'button',
                        label: translate(
                          ctx,
                          'dataUsageLink',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.dataUsageLink
                        ),
                        variant: 'ghost',
                        action: { id: 'resource:open', args: ['data-usage'] }
                      }
                    ]),
                    (current) =>
                      current.state.privacyStatus
                        ? state((inner) => inner.state.privacyStatus ?? '')
                        : null
                  ])
                ])
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
