import type { SchemaContext, SettingsSchema } from '../../types';
import type { SchemaMessageKey } from '../i18n';
import { codeOutputBox, infoBox } from '../builders/chrome';

function translate(
  key: SchemaMessageKey,
  fallback: string,
  translateFn?: SchemaContext['t']
): string {
  return translateFn?.(key, fallback) ?? fallback;
}

function resolveMaintenanceLogTitle(current: SchemaContext): string {
  const log = current.appData.maintenanceLog.trim();
  const copySuccess = translate(
    'copyConfigSuccess',
    '✅ Configuration copied to clipboard',
    current.t
  );
  const importSuccess = translate(
    'importSuccess',
    '✅ Configuration imported and saved',
    current.t
  );
  const repairSuccess = translate('configFixed', '✅ Configuration fixed and saved', current.t);

  if (
    log === copySuccess ||
    log === importSuccess ||
    log.startsWith('Copy failed:') ||
    log.startsWith('Import failed:')
  ) {
    return translate(
      'schemaMaintenanceTransferLastActionNoticeTitle',
      'Last transfer action',
      current.t
    );
  }

  if (log.startsWith(repairSuccess)) {
    return translate('schemaMaintenanceRepairLogTitle', 'Repair Configuration', current.t);
  }

  return translate('diagnosisResultTitle', 'Diagnosis Results', current.t);
}

const schema: SettingsSchema = {
  createView(ctx) {
    const t = ctx.t;

    return {
      id: 'maintenance',
      kind: 'page',
      hero: {
        title: translate('schemaMaintenanceTitle', 'Maintenance', t),
        description: translate(
          'schemaMaintenanceHeroDescription',
          'Transfer configuration and run diagnostics.',
          t
        ),
        pills: ['Transfer', 'Diagnosis', 'Repair']
      },
      children: [
        {
          kind: 'group',
          title: translate('schemaMaintenanceTransferGroupTitle', 'Transfer', t),
          children: [
            {
              kind: 'card',
              title: translate(
                'schemaMaintenanceConfigurationTransferTitle',
                'Configuration Transfer',
                t
              ),
              description: translate(
                'schemaMaintenanceConfigurationTransferDescription',
                'Copy and import configuration between browsers.',
                t
              ),
              actions: [
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceTransferCopyButton', 'Copy Configuration', t),
                  variant: 'primary',
                  action: { id: 'maintenance:copyConfig' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceTransferImportButton', 'Import and Save', t),
                  variant: 'secondary',
                  action: { id: 'maintenance:importConfig' }
                }
              ],
              body: [
                infoBox(
                  translate('schemaMaintenanceTransferHelperTitle', 'Transfer Method', t),
                  translate(
                    'schemaMaintenanceTransferHelperDescription',
                    'Copy exports the current configuration. Import reads configuration JSON from the clipboard, validates it, and saves it.',
                    t
                  )
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate('schemaMaintenanceDiagnosisGroupTitle', 'Diagnosis', t),
          children: [
            {
              kind: 'card',
              title: translate('diagnosisTitle', 'Configuration Diagnosis', t),
              description: translate(
                'schemaMaintenanceConfigurationDiagnosisDescription',
                'Check connections, templates, routing, and capture settings.',
                t
              ),
              actions: [
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceDiagnosisButton', 'Diagnose Configuration', t),
                  variant: 'primary',
                  action: { id: 'maintenance:diagnose' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceFixButton', 'Fix Configuration', t),
                  variant: 'warning',
                  action: { id: 'maintenance:repair' }
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceReloadButton', 'Reload', t),
                  variant: 'ghost',
                  action: { id: 'maintenance:reload' }
                }
              ],
              body: [
                infoBox(
                  translate('schemaMaintenanceDiagnosisScopeTitle', 'Diagnosis Scope', t),
                  translate(
                    'schemaMaintenanceDiagnosisScopeDescription',
                    'REST API, path templates, domain mappings, multi-vault routing, fragment context settings, and video prompts should all appear in the report.',
                    t
                  )
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
