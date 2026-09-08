import type { SchemaContext, SettingsSchema } from '../../types';
import { getDefaultProductionEnglishMessage, type SchemaMessageKey } from '../i18n';
import { codeOutputBox, infoBox } from '../builders/chrome';
import {
  resolveProductionMaintenanceSnapshot,
  type ProductionMaintenanceActionNotice,
  type ProductionMaintenanceSnapshot
} from '@options/app/productionStitchMaintenanceState';

function translate(key: SchemaMessageKey, translateFn?: SchemaContext['t']): string {
  const fallback = getDefaultProductionEnglishMessage(key);
  return translateFn?.(key, fallback) ?? fallback;
}

function resolveSnapshot(current: SchemaContext): ProductionMaintenanceSnapshot {
  return (
    resolveProductionMaintenanceSnapshot(current.appData) ?? {
      diagnosis: { status: 'success', report: current.appData.maintenanceLog },
      lastActionNotice: null
    }
  );
}

function resolveDiagnosisTitle(current: SchemaContext): string {
  const status = resolveSnapshot(current).diagnosis.status;
  const key = {
    idle: 'diagnosisTitle',
    running: 'diagnosticsRunning',
    success: 'diagnosisResultTitle',
    failure: 'schemaMaintenanceDiagnosisFailureTitle'
  }[status] as SchemaMessageKey;
  return translate(key, current.t);
}

function resolveDiagnosisLog(current: SchemaContext): string {
  const diagnosis = resolveSnapshot(current).diagnosis;
  if (diagnosis.status === 'success') return diagnosis.report;
  const key =
    diagnosis.status === 'running'
      ? 'schemaMaintenanceDiagnosisRunningBody'
      : diagnosis.status === 'failure'
        ? 'schemaMaintenanceActionFailureBody'
        : 'schemaMaintenanceDiagnosisIdleBody';
  return translate(key, current.t);
}

function resolveActionTitle(
  notice: ProductionMaintenanceActionNotice,
  current: SchemaContext
): string {
  const key =
    notice.source === 'copy' || notice.source === 'import'
      ? 'schemaMaintenanceTransferLastActionNoticeTitle'
      : notice.source === 'repair'
        ? 'schemaMaintenanceRepairLogTitle'
        : 'reloadButton';
  return translate(key, current.t);
}

function resolveActionMessage(
  notice: ProductionMaintenanceActionNotice,
  current: SchemaContext
): string {
  if (notice.message) return notice.message;
  if (notice.outcome === 'failure') {
    return translate('schemaMaintenanceActionFailureBody', current.t);
  }
  const key =
    notice.source === 'copy'
      ? 'copyConfigSuccess'
      : notice.source === 'import'
        ? 'importSuccess'
        : notice.source === 'reload'
          ? 'schemaMaintenanceReloadSuccessBody'
          : 'configFixed';
  return translate(key, current.t);
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
          translate('diagnosisTitle', t),
          translate('schemaMaintenanceFixButton', t)
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
          title: translate('diagnosisTitle', t),
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
                  action: { id: 'maintenance:diagnose' },
                  disabled: (current) => resolveSnapshot(current).diagnosis.status === 'running'
                },
                {
                  kind: 'button',
                  label: translate('schemaMaintenanceFixButton', t),
                  variant: 'warning',
                  action: { id: 'maintenance:repair' }
                },
                {
                  kind: 'button',
                  label: translate('reloadButton', t),
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
                  (current) => resolveDiagnosisTitle(current),
                  codeOutputBox((current) => resolveDiagnosisLog(current))
                ),
                (current) => {
                  const notice = resolveSnapshot(current).lastActionNotice;
                  return notice
                    ? infoBox(
                        resolveActionTitle(notice, current),
                        codeOutputBox(resolveActionMessage(notice, current))
                      )
                    : null;
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
