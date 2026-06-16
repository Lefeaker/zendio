import type { SchemaContext, SettingsSchema } from '../../types';
import { getDefaultProductionEnglishMessage, type SchemaMessageKey } from '../i18n';
import { codeOutputBox, infoBox } from '../builders/chrome';

function translate(key: SchemaMessageKey, translateFn?: SchemaContext['t']): string {
  const fallback = getDefaultProductionEnglishMessage(key);
  return translateFn?.(key, fallback) ?? fallback;
}

function resolveMaintenanceLogTitle(current: SchemaContext): string {
  const log = current.appData.maintenanceLog.trim();
  const copySuccess = translate('copyConfigSuccess', current.t);
  const importSuccess = translate('importSuccess', current.t);
  const repairSuccess = translate('configFixed', current.t);

  if (
    log === copySuccess ||
    log === importSuccess ||
    log.startsWith('Copy failed:') ||
    log.startsWith('Import failed:')
  ) {
    return translate('schemaMaintenanceTransferLastActionNoticeTitle', current.t);
  }

  if (log.startsWith(repairSuccess)) {
    return translate('schemaMaintenanceRepairLogTitle', current.t);
  }

  return translate('diagnosisTitle', current.t);
}

const schema: SettingsSchema = {
  createView(ctx) {
    const t = ctx.t;

    return {
      id: 'maintenance',
      kind: 'page',
      hero: {
        title: translate('schemaMaintenanceTitle', t),
        description: translate('schemaMaintenanceHeroDescription', t),
        pills: [
          translate('schemaMaintenanceTransferGroupTitle', t),
          translate('schemaMaintenanceDiagnosisGroupTitle', t),
          translate('schemaMaintenanceRepairPillLabel', t)
        ]
      },
      children: [
        {
          kind: 'group',
          title: translate('schemaMaintenanceTransferGroupTitle', t),
          children: [
            {
              kind: 'card',
              title: translate('schemaMaintenanceConfigurationTransferTitle', t),
              description: translate('schemaMaintenanceConfigurationTransferDescription', t),
              actions: [
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceTransferCopyButton', t),
                  variant: 'primary',
                  action: { id: 'maintenance:copyConfig' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceTransferImportButton', t),
                  variant: 'secondary',
                  action: { id: 'maintenance:importConfig' }
                }
              ],
              body: [
                infoBox(
                  translate('schemaMaintenanceTransferHelperTitle', t),
                  translate('schemaMaintenanceTransferHelperDescription', t)
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate('schemaMaintenanceDiagnosisGroupTitle', t),
          children: [
            {
              kind: 'card',
              title: translate('diagnosisTitle', t),
              description: translate('schemaMaintenanceConfigurationDiagnosisDescription', t),
              actions: [
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceDiagnosisButton', t),
                  variant: 'primary',
                  action: { id: 'maintenance:diagnose' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceFixButton', t),
                  variant: 'warning',
                  action: { id: 'maintenance:repair' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceReloadButton', t),
                  variant: 'ghost',
                  action: { id: 'maintenance:reload' }
                }
              ],
              body: [
                infoBox(
                  translate('schemaMaintenanceDiagnosisScopeTitle', t),
                  translate('schemaMaintenanceDiagnosisScopeDescription', t)
                ),
                infoBox(
                  (current) => resolveMaintenanceLogTitle(current),
                  codeOutputBox((current) => current.appData.maintenanceLog)
                )
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
