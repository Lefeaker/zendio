import type { SettingsSchema } from '../../types';
import { element, htmlParagraph } from '../builders/primitives';
import { routingRuleRow, vaultRow } from '../builders/storage';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

function linkLocalRestApiRecommendation(value: string): string {
  return value.replace(
    'Local REST API with MCP',
    '<a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noopener noreferrer">Local REST API with MCP</a>'
  );
}

const schema: SettingsSchema = {
  createView(ctx) {
    const t = ctx.t ?? ((_key, fallback: string) => fallback);

    return {
      id: 'storage',
      kind: 'page',
      hero: {
        ...ctx.appData.storage.hero,
        title: t('schemaStorageTitle', ctx.appData.storage.hero.title),
        description: t('schemaStorageHeroDescription', ctx.appData.storage.hero.description)
      },
      children: [
        {
          kind: 'group',
          title: t('schemaStorageVaultsGroupTitle', 'Vaults'),
          children: [
            {
              kind: 'card',
              title: t('schemaStorageVaultListTitle', 'Vault List'),
              description: t(
                'schemaStorageVaultListDescription',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageVaultListDescription
              ),
              actions: [
                {
                  kind: 'button',
                  label: t(
                    'schemaStorageTestConnectionButton',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageTestConnectionButton
                  ),
                  variant: 'primary',
                  action: { id: 'storage:testConnection' }
                },
                {
                  kind: 'button',
                  label: t(
                    'schemaStorageAddVaultButton',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageAddVaultButton
                  ),
                  variant: 'secondary',
                  action: { id: 'storage:addVault' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  columns: [
                    t('schemaStorageVaultEnabledColumnLabel', 'Enabled'),
                    t('schemaStorageVaultNameColumnLabel', 'Vault'),
                    t('schemaStorageVaultLocalFolderColumnLabel', 'Local Folder'),
                    t('schemaStorageVaultHttpsUrlColumnLabel', 'HTTPS URL'),
                    t('schemaStorageVaultHttpUrlColumnLabel', 'HTTP URL'),
                    t('schemaStorageVaultApiKeyColumnLabel', 'API Key'),
                    t('schemaStorageVaultActionsColumnLabel', 'Actions')
                  ],
                  rows: (current) =>
                    current.appData.storage.vaults.map((vault, index) =>
                      vaultRow(vault, index, current)
                    )
                },
                /*
                 * Zendio 0.2.0: hide Advanced Connection Schema from Options.
                 * rootDir is persisted but is not wired into the actual export/write
                 * path, so exposing it would present a misleading release control.
                 */
                {
                  kind: 'notice',
                  title: (current) =>
                    current.appData.storage.connectionNotice?.title ||
                    (current.t?.(
                      'schemaStorageConnectionNoticeTitle',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageConnectionNoticeTitle
                    ) ??
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageConnectionNoticeTitle),
                  body: (current) => {
                    const notice = current.appData.storage.connectionNotice;
                    if (notice?.html) {
                      return element('div', {
                        className: 'vault-connection-notice-body',
                        html: notice.html
                      });
                    }
                    if (notice?.body) {
                      return notice.body;
                    }
                    if (notice?.variant === 'success') {
                      return (
                        current.t?.(
                          'connectionSuccessShort',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.connectionSuccessShort
                        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.connectionSuccessShort
                      );
                    }
                    if (notice?.variant && notice.variant !== 'info') {
                      return (
                        current.t?.(
                          'connectionFailed',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.connectionFailed
                        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.connectionFailed
                      );
                    }
                    return (
                      current.t?.(
                        'schemaStorageConnectionNotRun',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageConnectionNotRun
                      ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageConnectionNotRun
                    );
                  },
                  variant: (current) => current.appData.storage.connectionNotice?.variant ?? 'info'
                },
                htmlParagraph(
                  linkLocalRestApiRecommendation(
                    t(
                      'schemaStorageLocalFolderRecommendation',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageLocalFolderRecommendation
                    )
                  ),
                  'option-support-note'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: t('schemaStorageRoutingGroupTitle', 'Routing Engine'),
          children: [
            {
              kind: 'card',
              title: t('routingRulesTitle', 'Routing Rules'),
              description: t(
                'routingRulesHint',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.routingRulesHint
              ),
              actions: [
                {
                  kind: 'button',
                  label: t(
                    'schemaStorageAddRuleButton',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageAddRuleButton
                  ),
                  variant: 'primary',
                  action: { id: 'routing:add' }
                }
              ],
              body: [
                {
                  kind: 'notice',
                  title: t(
                    'schemaStorageRoutingTipTitle',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageRoutingTipTitle
                  ),
                  body: t(
                    'schemaStorageRoutingTipBody',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaStorageRoutingTipBody
                  ),
                  variant: 'warning'
                },
                {
                  kind: 'table',
                  columns: [
                    t('schemaStorageRoutingEnabledColumnLabel', 'Enabled'),
                    t('schemaStorageRoutingTypeColumnLabel', 'Type'),
                    t('schemaStorageRoutingPatternColumnLabel', 'Pattern'),
                    t('schemaStorageRoutingTargetVaultColumnLabel', 'Target Vault'),
                    t('schemaStorageRoutingPriorityColumnLabel', 'Priority'),
                    t('schemaStorageRoutingActionsColumnLabel', 'Actions')
                  ],
                  rows: (current) =>
                    current.state.routingRules.map((rule, index) =>
                      routingRuleRow(rule, index, current)
                    )
                }
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
