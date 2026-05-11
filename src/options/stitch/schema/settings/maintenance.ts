import type { SettingsSchema } from '../../types';
import { codeOutputBox, infoBox } from '../builders/chrome';

const schema: SettingsSchema = {
  createView() {
    return {
      id: 'maintenance',
      kind: 'page',
      hero: {
        title: 'Maintenance',
        description: '管理配置迁移、诊断和修复动作。',
        pills: ['Transfer', 'Diagnosis', 'Repair']
      },
      children: [
        {
          kind: 'group',
          title: 'Transfer',
          children: [
            {
              kind: 'card',
              title: 'Configuration Transfer',
              description: '在浏览器之间复制和导入配置。',
              actions: [
                {
                  kind: 'button',
                  label: '复制配置',
                  variant: 'primary',
                  action: { id: 'maintenance:copyConfig' }
                },
                {
                  kind: 'button',
                  label: '导入并保存',
                  variant: 'secondary',
                  action: { id: 'maintenance:importConfig' }
                }
              ],
              body: [
                infoBox(
                  '迁移方式',
                  '复制会导出当前配置；导入会读取剪贴板中的配置 JSON，校验后保存。'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Diagnosis',
          children: [
            {
              kind: 'card',
              title: 'Configuration Diagnosis',
              description: '检查连接、模板、路由和采集配置。',
              actions: [
                {
                  kind: 'button',
                  label: '诊断配置',
                  variant: 'primary',
                  action: { id: 'maintenance:diagnose' }
                },
                {
                  kind: 'button',
                  label: '修复配置',
                  variant: 'warning',
                  action: { id: 'maintenance:repair' }
                },
                {
                  kind: 'button',
                  label: '重新加载',
                  variant: 'ghost',
                  action: { id: 'maintenance:reload' }
                }
              ],
              body: [
                infoBox(
                  '诊断范围',
                  'REST API、路径模板、域名映射、多仓路由、Fragment 上下文参数和 Video prompt 都应在报告里可见。'
                ),
                codeOutputBox((current) => current.appData.maintenanceLog)
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
