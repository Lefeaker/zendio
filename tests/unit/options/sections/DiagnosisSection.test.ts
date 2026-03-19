/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { DiagnosisSection } from '@options/components/sections/DiagnosisSection';
import { OptionsStateManager } from '@options/state/StateManager';

const runDiagnosticsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const fixConfigurationMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const reloadDiagnosticsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('@options/app/optionsActions', () => ({
  runDiagnostics: runDiagnosticsMock,
  fixConfiguration: fixConfigurationMock,
  reloadDiagnostics: reloadDiagnosticsMock
}));

describe('DiagnosisSection', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="diagnosis"></section>';
    vi.clearAllMocks();
  });

  it('renders buttons and diagnostic output container', () => {
    const container = document.getElementById('diagnosis');
    if (!(container instanceof HTMLElement)) throw new Error('missing container');
    const section = new DiagnosisSection(container);
    section.render({ stateManager: new OptionsStateManager(), formRegistry: new FormSectionRegistry() });

    expect(container.querySelector('#diagBtn')).not.toBeNull();
    expect(container.querySelector('#fixBtn')).not.toBeNull();
    expect(container.querySelector('#reloadBtn')).not.toBeNull();
    expect(container.querySelector('#diagOutput')?.getAttribute('aria-live')).toBe('polite');
  });

  it('invokes actions and clears listeners on destroy', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.getElementById('diagnosis');
    if (!(container instanceof HTMLElement)) throw new Error('missing container');
    const section = new DiagnosisSection(container);
    section.render({ stateManager: new OptionsStateManager(), formRegistry: new FormSectionRegistry() });

    const diagnoseButton = container.querySelector('#diagBtn');
    const fixButton = container.querySelector('#fixBtn');
    const reloadButton = container.querySelector('#reloadBtn');
    if (!(diagnoseButton instanceof HTMLButtonElement) || !(fixButton instanceof HTMLButtonElement) || !(reloadButton instanceof HTMLButtonElement)) {
      throw new Error('buttons missing');
    }
    diagnoseButton.click();
    fixButton.click();
    reloadButton.click();
    await vi.waitFor(() => {
      expect(runDiagnosticsMock).toHaveBeenCalled();
      expect(fixConfigurationMock).toHaveBeenCalled();
      expect(reloadDiagnosticsMock).toHaveBeenCalled();
    });

    section.destroy();
    expect(container.childElementCount).toBe(0);
    consoleErrorSpy.mockRestore();
  });
});
