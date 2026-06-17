import type { SettingsSchema } from '../../types';
import type { Messages } from '@i18n';
import { element, htmlParagraph } from '../builders/primitives';
import { routingRuleRow, vaultRow } from '../builders/storage';
import { translateSchemaMessage } from '../i18n';

function linkLocalRestApiRecommendation(value: string): string {
  return value.replace(
    'Local REST API with MCP',
    '<a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noopener noreferrer">Local REST API with MCP</a>'
  );
}

const schema: SettingsSchema = {
  createView(ctx) {
    const t = (key: keyof Messages) => translateSchemaMessage(ctx.t, key);

    return {
      id: 'storage',
      kind: 'page',
      hero: {
        ...ctx.appData.storage.hero,
        title: t('schemaStorageTitle'),
        description: t('schemaStorageHeroDescription')
      },
      children: [
        {
          kind: 'group',
          title: t('schemaStorageVaultsGroupTitle'),
          children: [
            {
              kind: 'card',
              title: t('schemaStorageVaultListTitle'),
              description: t('schemaStorageVaultListDescription'),
              actions: [
                {
                  kind: 'button',
                  label: t('schemaStorageTestConnectionButton'),
                  variant: 'primary',
                  action: { id: 'storage:testConnection' }
                },
                {
                  kind: 'button',
                  label: t('schemaStorageAddVaultButton'),
                  variant: 'secondary',
                  action: { id: 'storage:addVault' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  columns: [
                    t('schemaStorageVaultEnabledColumnLabel'),
                    t('schemaStorageVaultNameColumnLabel'),
                    t('schemaStorageVaultLocalFolderColumnLabel'),
                    t('schemaStorageVaultHttpsUrlColumnLabel'),
                    t('schemaStorageVaultHttpUrlColumnLabel'),
                    t('schemaStorageVaultApiKeyColumnLabel'),
                    t('schemaStorageVaultActionsColumnLabel')
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
                    translateSchemaMessage(current.t, 'schemaStorageConnectionNoticeTitle'),
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
                      return translateSchemaMessage(current.t, 'connectionSuccessShort');
                    }
                    if (notice?.variant && notice.variant !== 'info') {
                      return translateSchemaMessage(current.t, 'connectionFailed');
                    }
                    return translateSchemaMessage(current.t, 'schemaStorageConnectionNotRun');
                  },
                  variant: (current) => current.appData.storage.connectionNotice?.variant ?? 'info'
                },
                htmlParagraph(
                  linkLocalRestApiRecommendation(t('schemaStorageLocalFolderRecommendation')),
                  'option-support-note'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: t('schemaStorageRoutingGroupTitle'),
          children: [
            {
              kind: 'card',
              title: t('routingRulesTitle'),
              description: t('routingRulesHint'),
              actions: [
                {
                  kind: 'button',
                  label: t('schemaStorageAddRuleButton'),
                  variant: 'primary',
                  action: { id: 'routing:add' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  columns: [
                    t('schemaStorageRoutingEnabledColumnLabel'),
                    t('schemaStorageRoutingTypeColumnLabel'),
                    t('schemaStorageRoutingPatternColumnLabel'),
                    t('schemaStorageRoutingTargetVaultColumnLabel'),
                    t('schemaStorageRoutingPriorityColumnLabel'),
                    t('schemaStorageRoutingActionsColumnLabel')
                  ],
                  rows: (current) =>
                    current.state.routingRules.map((rule, index) =>
                      routingRuleRow(rule, index, current)
                    )
                },
                htmlParagraph(t('schemaStorageRoutingTipBody'), 'option-support-note')
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
