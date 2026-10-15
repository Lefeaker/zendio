/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as taskOwnerModule from '@options/app/productionStitchActionTaskOwner';
import * as sectionInvalidationModule from '@ui/stitch-runtime/render/sectionInvalidation';
import * as diagnosticsMessagesModule from '@options/components/diagnostics/diagnosticsMessages';
import {
  createDiagnosticsPrivacyOptions,
  DIAGNOSTICS_PRIVATE_VALUES
} from '../../utils/diagnosticsPrivacyFixture';
import {
  asOptionsController,
  createController,
  createEnglishPageMessages,
  findButton,
  queryRequired,
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

function observeRunningDiagnosis(buttonLabel: string, title: string, body: string): Promise<void> {
  return new Promise((resolve) => {
    const inspect = (): void => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === buttonLabel
      );
      const text = document.body.textContent ?? '';
      if (!(button instanceof HTMLButtonElement) || !button.isConnected || !button.disabled) return;
      if (!text.includes(title) || !text.includes(body)) return;
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    inspect();
  });
}

describe('mountProductionStitchShell maintenance i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders a private diagnosis from the mounted draft and preserves full configuration copy', async () => {
    const initialOptions = createDiagnosticsPrivacyOptions();
    const before = structuredClone(initialOptions);
    const controller = createController();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions,
      messages: await createEnglishPageMessages(),
      language: 'en'
    });
    queryRequired<HTMLButtonElement>('[data-action-id="maintenance:diagnose"]').click();
    await vi.waitFor(() =>
      expect(document.querySelector('.settings-diagnostics-card')?.textContent).toContain(
        'Diagnostics complete'
      )
    );
    const report = document.querySelector('.settings-diagnostics-card')?.textContent ?? '';
    for (const value of DIAGNOSTICS_PRIVATE_VALUES) expect(report).not.toContain(value);
    expect(report).toContain('Configured vaults: 2');
    expect(report).toContain('Context length: 120');
    expect(report).toContain('This report omits credentials');
    expect(initialOptions).toEqual(before);
    expect(controller.saveSnapshot).not.toHaveBeenCalled();
    expect(controller.scheduleAutoSave).not.toHaveBeenCalled();
    queryRequired<HTMLButtonElement>('[data-action-id="maintenance:copyConfig"]').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const backup = writeText.mock.calls[0];
    for (const value of DIAGNOSTICS_PRIVATE_VALUES) expect(JSON.stringify(backup)).toContain(value);
  });

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
        diagnosisTitle: 'Diagnosis Group Sentinel',
        diagnosticsRunning: 'Running Diagnostics Sentinel',
        diagnosisResultTitle: 'Diagnosis Result Sentinel',
        schemaMaintenanceDiagnosisButton: 'Diagnose Configuration Sentinel',
        schemaMaintenanceDiagnosisIdleBody: 'Diagnosis Idle Sentinel',
        schemaMaintenanceDiagnosisRunningBody: 'Checking Configuration Sentinel',
        schemaMaintenanceDiagnosisFailureTitle: 'Diagnosis Failure Sentinel',
        schemaMaintenanceActionFailureBody: 'Maintenance Failure Sentinel',
        schemaMaintenanceFixButton: 'Fix Configuration Sentinel',
        reloadButton: 'Reload Sentinel',
        schemaMaintenanceReloadSuccessBody: 'Reload Success Sentinel',
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
    expect(document.body.textContent).toContain('Diagnosis Idle Sentinel');
    expect(document.body.textContent).not.toContain('Diagnosis Log Sentinel');

    const running = observeRunningDiagnosis(
      'Diagnose Configuration Sentinel',
      'Running Diagnostics Sentinel',
      'Checking Configuration Sentinel'
    );
    findButton('Diagnose Configuration Sentinel').click();
    await running;
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Diagnosis Result Sentinel')
    );

    const reportSpy = vi
      .spyOn(diagnosticsMessagesModule, 'renderDiagnosticReport')
      .mockImplementationOnce(() => {
        reportSpy.mockRestore();
        throw new Error('controlled localized diagnosis failure');
      });
    const failing = observeRunningDiagnosis(
      'Diagnose Configuration Sentinel',
      'Running Diagnostics Sentinel',
      'Checking Configuration Sentinel'
    );
    findButton('Diagnose Configuration Sentinel').click();
    await failing;
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Diagnosis Failure Sentinel')
    );
    expect(document.body.textContent).toContain('Maintenance Failure Sentinel');
    expect(document.body.textContent).not.toContain('Diagnosis Result Sentinel');

    findButton('Reload Sentinel').click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Reload Success Sentinel'));

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
