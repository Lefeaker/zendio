/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asOptionsController,
  createController,
  findButton,
  flushPromises,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

describe('mountProductionStitchShell maintenance i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders maintenance schema copy from catalog-backed messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: {
        ...DEFAULT_RUNTIME_MESSAGES,
        schemaMaintenanceTransferGroupTitle: 'Transfer Group Sentinel',
        schemaMaintenanceTransferCopyButton: 'Copy Configuration Sentinel',
        schemaMaintenanceTransferImportButton: 'Import Configuration Sentinel',
        schemaMaintenanceDiagnosisGroupTitle: 'Diagnosis Group Sentinel',
        schemaMaintenanceDiagnosisButton: 'Diagnose Configuration Sentinel',
        schemaMaintenanceFixButton: 'Fix Configuration Sentinel',
        schemaMaintenanceReloadButton: 'Reload Sentinel',
        schemaMaintenanceTransferLastActionNoticeTitle: 'Last Transfer Action Sentinel'
      },
      language: 'en'
    });

    expect(document.body.textContent).toContain('Transfer Group Sentinel');
    expect(findButton('Copy Configuration Sentinel')).toBeTruthy();
    expect(findButton('Import Configuration Sentinel')).toBeTruthy();

    expect(document.body.textContent).toContain('Diagnosis Group Sentinel');
    expect(findButton('Diagnose Configuration Sentinel')).toBeTruthy();
    expect(findButton('Fix Configuration Sentinel')).toBeTruthy();
    expect(findButton('Reload Sentinel')).toBeTruthy();

    findButton('Copy Configuration Sentinel').click();
    await flushPromises();

    const noticeTitles = Array.from(document.querySelectorAll<HTMLElement>('.notice strong')).map(
      (element) => element.textContent?.trim() ?? ''
    );
    expect(noticeTitles).toContain('Last Transfer Action Sentinel');
  });
});
