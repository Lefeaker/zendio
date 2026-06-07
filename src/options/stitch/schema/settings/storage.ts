import type { SettingsSchema } from '../../types';
import { element, htmlParagraph } from '../builders/primitives';
import { routingRuleRow, vaultRow } from '../builders/storage';

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
                '第一行是默认仓库，其余行为附加仓库。'
              ),
              actions: [
                {
                  kind: 'button',
                  label: t('schemaStorageTestConnectionButton', '测试连接'),
                  variant: 'primary',
                  action: { id: 'storage:testConnection' }
                },
                {
                  kind: 'button',
                  label: t('schemaStorageAddVaultButton', '添加仓库'),
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
                    (current.t?.('schemaStorageConnectionNoticeTitle', '连接测试结果') ??
                      '连接测试结果'),
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
                      return current.t?.('connectionSuccessShort', '连接成功') ?? '连接成功';
                    }
                    if (notice?.variant && notice.variant !== 'info') {
                      return current.t?.('connectionFailed', '连接失败') ?? '连接失败';
                    }
                    return (
                      current.t?.('schemaStorageConnectionNotRun', '尚未运行连接测试。') ??
                      '尚未运行连接测试。'
                    );
                  },
                  variant: (current) => current.appData.storage.connectionNotice?.variant ?? 'info'
                },
                htmlParagraph(
                  linkLocalRestApiRecommendation(
                    t(
                      'schemaStorageLocalFolderRecommendation',
                      '推荐优先使用 Local Folder 通道；REST API 功能由 Obsidian 插件 Local REST API with MCP 支持。'
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
                '根据域名、关键词或 URL pattern 自动选择目标仓库。表格中的每一项都可以直接编辑。'
              ),
              actions: [
                {
                  kind: 'button',
                  label: t('schemaStorageAddRuleButton', '添加规则'),
                  variant: 'primary',
                  action: { id: 'routing:add' }
                }
              ],
              body: [
                {
                  kind: 'notice',
                  title: t('schemaStorageRoutingTipTitle', '路由提示'),
                  body: t(
                    'schemaStorageRoutingTipBody',
                    '优先级越高越先匹配；每条规则都支持行内修改，不需要先删除再重建。'
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
