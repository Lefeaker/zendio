/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as taskOwnerModule from '@options/app/productionStitchActionTaskOwner';
import * as sectionInvalidationModule from '@ui/stitch-runtime/render/sectionInvalidation';
import {
  asOptionsController,
  createController,
  findButton,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

function observeMaintenanceCompletion() {
  let created: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    created = resolve;
  });
  const createOwner = sectionInvalidationModule.createSectionInvalidationOwner;
  const ownerFactory = vi.spyOn(sectionInvalidationModule, 'createSectionInvalidationOwner');
  ownerFactory.mockImplementationOnce((options) => {
    ownerFactory.mockRestore();
    const owner = createOwner(options);
    created();
    return owner;
  });
  const taskOwner = taskOwnerModule.createProductionStitchActionTaskOwner();
  const taskFactory = vi.spyOn(taskOwnerModule, 'createProductionStitchActionTaskOwner');
  taskFactory.mockImplementationOnce(() => {
    taskFactory.mockRestore();
    return taskOwner;
  });
  return { ready, waitForIdle: () => taskOwner.waitForIdle() };
}

describe('mountProductionStitchShell maintenance i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders maintenance schema copy from catalog-backed messages', async () => {
    const completion = observeMaintenanceCompletion();
    let releaseClipboard: () => void = () => undefined;
    const clipboard = new Promise<void>((resolve) => {
      releaseClipboard = resolve;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => clipboard) }
    });
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
        schemaMaintenanceTransferLastActionNoticeTitle: 'Last Transfer Action Sentinel',
        schemaMaintenanceDiagnosisResultLog:
          'Diagnosis Log Sentinel\\n========\\nLine One Sentinel\\nLine Two Sentinel'
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
    expect(document.body.textContent).toContain('Diagnosis Log Sentinel');
    expect(document.body.textContent).toContain('Line One Sentinel');

    const copyButton = findButton('Copy Configuration Sentinel');
    copyButton.click();
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    expect(document.body.textContent).not.toContain('Last Transfer Action Sentinel');
    await completion.ready;
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    expect(document.body.textContent).not.toContain('Last Transfer Action Sentinel');
    releaseClipboard();
    await completion.waitForIdle();

    const noticeTitles = Array.from(document.querySelectorAll<HTMLElement>('.notice strong')).map(
      (element) => element.textContent?.trim() ?? ''
    );
    expect(noticeTitles).toContain('Last Transfer Action Sentinel');
  });
});
