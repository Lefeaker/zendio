import type { SchemaContext, SettingsSchema } from '../../types';
import { div, paragraph, stack, state, strong } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { themeSegmentedSwitch } from '../builders/settings';
import { boundSwitch } from '../builders/controls';
import type { SchemaMessageKey } from '../i18n';

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
    translate(current, 'errorReportingCollectedError', '错误类型与调用位置'),
    translate(current, 'errorReportingCollectedBrowser', '浏览器主版本'),
    translate(current, 'errorReportingCollectedExtension', '扩展版本号'),
    translate(current, 'errorReportingCollectedTimestamp', '异常发生时间'),
    translate(current, 'schemaResourceDataUsageAnonymousUsageTitle', '匿名功能使用次数')
  ];
}

function resolvePrivacyExcluded(current: SchemaContext): string[] {
  if (!current.messages) {
    return current.appData.privacyExcluded;
  }

  return [
    translate(current, 'errorReportingNotCollectedPersonal', '个人身份信息'),
    translate(current, 'errorReportingNotCollectedContent', '页面正文与剪藏内容'),
    translate(current, 'errorReportingNotCollectedUrls', '私密 URL 清单'),
    translate(current, 'errorReportingNotCollectedPasswords', '密码、API 密钥明文')
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
          title: translate(ctx, 'schemaOverviewUsageGroupTitle', '使用概览'),
          children: [
            {
              kind: 'card',
              title: translate(ctx, 'usageDashboardTitle', 'Usage Dashboard'),
              description: translate(
                ctx,
                'usageDashboardSubtitle',
                '查看保存总量、内容分布和最近使用趋势。'
              ),
              actions: [
                {
                  kind: 'button',
                  label: translate(ctx, 'schemaOverviewOpenDiagnosisButton', '打开 Diagnosis'),
                  variant: 'secondary',
                  action: { id: 'navigation:scrollToPanel', args: ['maintenance'] }
                },
                {
                  kind: 'button',
                  label: translate(ctx, 'schemaOverviewClearUsageDataButton', '清除使用数据'),
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
          title: translate(ctx, 'schemaOverviewInterfaceGroupTitle', '界面'),
          children: [
            {
              kind: 'card',
              body: [
                div(classNames.settings.interfaceThemeGrid, [
                  {
                    kind: 'field',
                    label: translate(ctx, 'schemaOverviewLanguageRowTitle', '界面语言'),
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
                    label: translate(ctx, 'schemaOverviewThemeRowTitle', '界面主题'),
                    control: themeSegmentedSwitch()
                  }
                ])
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate(ctx, 'schemaOverviewPrivacyGroupTitle', '隐私与数据'),
          children: [
            {
              kind: 'card',
              title: translate(ctx, 'privacySettingsNote', 'Consent'),
              description: translate(
                ctx,
                'privacySettingsDescription',
                '管理匿名使用统计、错误报告和相关数据说明。'
              ),
              body: [
                div('consent-inline-grid', [
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong(translate(ctx, 'analyticsConsentTitle', '匿名使用统计')),
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
                        '记录功能使用次数，用于 Usage Dashboard 和行为统计。'
                      ),
                      'consent-inline-copy'
                    )
                  ]),
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong(translate(ctx, 'errorReportingConsentTitle', '错误报告')),
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
                      translate(ctx, 'errorReportingConsentDescription', '帮助定位崩溃与异常。'),
                      'consent-inline-copy'
                    )
                  ])
                ]),
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: translate(ctx, 'analyticsDebugTitle', '调试模式'),
                      description: translate(
                        ctx,
                        'analyticsDebugDescription',
                        '仅开发环境可见，需要 analytics 与 error reporting 都启用。'
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
                              ? translate(current, 'schemaOverviewDebugModeAvailableState', '可用')
                              : translate(
                                  current,
                                  'schemaOverviewDebugModePrerequisiteState',
                                  '前置条件未满足'
                                )
                          )
                        ],
                        'switch-line debug-mode-inline'
                      )
                    }
                  ]
                },
                div('mini-card u-mt-block', [
                  strong(translate(ctx, 'schemaOverviewPrivacyReferenceTitle', 'What Data Means')),
                  div('data-means-grid u-mt-tight', [
                    div('data-means-block', [
                      strong(
                        translate(ctx, 'errorReportingCollectedTitle', '会收集'),
                        'data-means-title'
                      ),
                      {
                        kind: 'list',
                        items: (current) => resolvePrivacyCollected(current)
                      }
                    ]),
                    div('data-means-block', [
                      strong(
                        translate(ctx, 'errorReportingNotCollectedTitle', '不会收集'),
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
                        label: translate(ctx, 'clearAllAnalyticsData', '清空全部分析数据'),
                        variant: 'danger',
                        action: { id: 'overview:clearAnalyticsData' }
                      },
                      {
                        kind: 'button',
                        label: translate(ctx, 'privacyPolicyLink', '隐私政策'),
                        variant: 'ghost',
                        action: { id: 'resource:open', args: ['privacy-policy'] }
                      },
                      {
                        kind: 'button',
                        label: translate(ctx, 'dataUsageLink', '数据用途说明'),
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
