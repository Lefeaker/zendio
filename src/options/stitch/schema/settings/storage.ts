import type { SettingsSchema } from '../../types';
import { emptyState, grid } from '../builders/primitives';
import { routingRuleRow, vaultRow } from '../builders/storage';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'storage',
      kind: 'page',
      hero: ctx.appData.storage.hero,
      children: [
        {
          kind: 'group',
          title: 'Vaults',
          children: [
            {
              kind: 'card',
              title: 'Vault List',
              description: '第一行是默认仓库，其余行为附加仓库。',
              actions: [
                {
                  kind: 'button',
                  label: '测试连接',
                  variant: 'primary',
                  action: { id: 'storage:testConnection' }
                },
                {
                  kind: 'button',
                  label: '添加仓库',
                  variant: 'secondary',
                  action: { id: 'storage:addVault' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  columns: ['Enabled', 'Vault', 'HTTPS URL', 'HTTP URL', 'API Key', 'Actions'],
                  rows: (current) =>
                    current.appData.storage.vaults.map((vault, index) => vaultRow(vault, index))
                },
                {
                  kind: 'details',
                  summary: 'Advanced Connection Schema',
                  open: true,
                  bodyClassName: 'stack',
                  children: [
                    grid(
                      2,
                      [
                        {
                          kind: 'field',
                          label: 'rootDir',
                          control: {
                            kind: 'input',
                            value: (current) => current.appData.storage.rootDir ?? '',
                            mono: true,
                            onInput: { id: 'storage:updateRootDir', valueFrom: 'target.value' }
                          }
                        },
                        {
                          kind: 'field',
                          label: 'Status',
                          control: emptyState('可选。用于指定默认根目录。')
                        }
                      ],
                      'field-grid-2'
                    )
                  ]
                },
                {
                  kind: 'notice',
                  title: (current) =>
                    current.appData.storage.connectionNotice?.title ?? '连接测试结果',
                  body: (current) =>
                    current.appData.storage.connectionNotice?.body ?? '尚未运行连接测试。',
                  variant: (current) => current.appData.storage.connectionNotice?.variant ?? 'info'
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Routing Engine',
          children: [
            {
              kind: 'card',
              title: 'Routing Rules',
              description:
                '根据域名、关键词或 URL pattern 自动选择目标仓库。表格中的每一项都可以直接编辑。',
              actions: [
                {
                  kind: 'button',
                  label: '添加规则',
                  variant: 'primary',
                  action: { id: 'routing:add' }
                }
              ],
              body: [
                {
                  kind: 'notice',
                  title: '路由提示',
                  body: '优先级越高越先匹配；每条规则都支持行内修改，不需要先删除再重建。',
                  variant: 'warning'
                },
                {
                  kind: 'table',
                  columns: ['Enabled', 'Type', 'Pattern', 'Target Vault', 'Priority', 'Actions'],
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
