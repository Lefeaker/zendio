/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Messages } from '../../../../src/i18n/messages';
import {
  PrivacySettingsComponent,
  type PrivacyConsentSnapshot
} from '../../../../src/ui/domains/privacy';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { PrivacySection } from '@options/components/sections/PrivacySection';
import { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const testContext = vi.hoisted(() => {
  const messages = {
    analyticsConsentTitle: 'Analytics consent',
    analyticsConsentDescription: 'Allow analytics collection',
    errorReportingConsentTitle: 'Error reporting consent',
    errorReportingConsentDescription: 'Allow error reporting',
    errorReportingCollectedTitle: 'We collect',
    errorReportingCollectedError: 'Errors',
    errorReportingCollectedBrowser: 'Browser info',
    errorReportingCollectedExtension: 'Extension version',
    errorReportingCollectedTimestamp: 'Timestamp',
    errorReportingNotCollectedTitle: 'We do not collect',
    errorReportingNotCollectedPersonal: 'Personal data',
    errorReportingNotCollectedUrls: 'Visited URLs',
    errorReportingNotCollectedContent: 'Page content',
    errorReportingNotCollectedPasswords: 'Passwords',
    analyticsDebugTitle: 'Debug mode',
    analyticsDebugDescription: 'Enable debug analytics',
    analyticsDebugDisabledHint: 'Enable data collection to toggle debug mode',
    clearAllAnalyticsData: 'Clear all analytics data',
    privacySettingsNote: 'You can manage privacy preferences here.',
    privacySettingsDescription: 'Privacy documentation',
    privacyPolicyLink: 'Privacy policy',
    dataUsageLink: 'Data usage',
    privacyFooterText: 'Learn more about privacy handling.',
    privacySettingsSaved: 'Settings saved',
    privacyDataWillBeCleared: 'Analytics data will be cleared soon.',
    privacySettingsError: 'Failed to save settings',
    confirmClearAllData: 'Clear all analytics data?',
    allDataCleared: 'All analytics data cleared',
    clearDataError: 'Failed to clear analytics data',
    analyticsDebugEnabled: 'Debug mode enabled',
    analyticsDebugDisabled: 'Debug mode disabled'
  } as unknown as Messages;

  const analyticsManager = {
    refreshFromStorage: vi.fn<[], Promise<void>>(),
    getUserConsent: vi.fn<[], Promise<{ analytics: boolean; errorReporting: boolean } | null>>(),
    getConfig: vi.fn<[], { debugMode: boolean }>(),
    clearAllData: vi.fn<[], Promise<void>>(),
    updateConfig: vi.fn<[Partial<{ debugMode: boolean }>], Promise<void>>()
  };

  const binderHandle = { dispose: vi.fn() };
  const binder = {
    bindText: vi.fn(() => binderHandle),
    bindAttr: vi.fn(),
    bindHtml: vi.fn()
  };

  const getOptionsMessagesMock = vi.fn(() => Promise.resolve(messages));

  const setAnalyticsConsent = vi.fn<[boolean, boolean], Promise<void>>(() => Promise.resolve());

  return {
    messages,
    analyticsManager,
    binder,
    getOptionsMessagesMock,
    setAnalyticsConsent
  };
});

vi.mock('@shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: () => testContext.analyticsManager,
  setAnalyticsConsent: testContext.setAnalyticsConsent
}));

vi.mock('@i18n', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../src/i18n')>('../../../../src/i18n');
  return {
    ...actual,
    getMessages: () => testContext.getOptionsMessagesMock()
  };
});

const flushHydration = async (component: PrivacySettingsComponent): Promise<void> => {
  await (component as unknown as { hydrateFromStorage: () => Promise<void> }).hydrateFromStorage();
};

describe('PrivacySettingsComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    testContext.analyticsManager.refreshFromStorage.mockResolvedValue(undefined);
    testContext.analyticsManager.getUserConsent.mockResolvedValue({
      analytics: true,
      errorReporting: true
    });
    testContext.analyticsManager.getConfig.mockReturnValue({ debugMode: false });
    testContext.analyticsManager.updateConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  const renderComponent = async (): Promise<PrivacySettingsComponent> => {
    const container = document.createElement('div');
    document.body.append(container);
    const component = new PrivacySettingsComponent(container);
    component.setMessages(testContext.messages);
    component.render();
    await flushHydration(component);
    return component;
  };

  it('saves consent changes and shows status message', async () => {
    const component = await renderComponent();
    const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
    const errorCheckbox = document.getElementById('errorReportingConsent') as HTMLInputElement;

    analyticsCheckbox.checked = true;
    errorCheckbox.checked = false;

    await component.saveSettings();

    expect(testContext.setAnalyticsConsent).toHaveBeenCalledWith(true, false);

    const status = document.getElementById('privacyStatusMessage');
    if (!status) {
      throw new Error('privacyStatusMessage not found');
    }
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe(testContext.messages.privacySettingsSaved);

    component.destroy();
  });

  it('shows controlled error status when hydration from storage fails', async () => {
    testContext.analyticsManager.refreshFromStorage.mockRejectedValueOnce(new Error('storage failed'));

    const component = await renderComponent();

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe(testContext.messages.privacySettingsError);

    component.destroy();
  });

  it('shows error status when saving settings fails', async () => {
    testContext.setAnalyticsConsent.mockRejectedValueOnce(new Error('consent failed'));

    const component = await renderComponent();
    const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
    analyticsCheckbox.checked = false;

    await expect(component.saveSettings()).rejects.toThrow('consent failed');

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe(testContext.messages.privacySettingsError);

    component.destroy();
  });

  it('shows error status when auto-save fails', async () => {
    testContext.setAnalyticsConsent.mockRejectedValueOnce(new Error('auto-save failed'));

    const component = await renderComponent();
    const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
    analyticsCheckbox.checked = false;
    analyticsCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe(testContext.messages.privacySettingsError);

    component.destroy();
  });

  it('updates debug mode via analytics manager and displays info hint', async () => {
    const component = await renderComponent();
    const toggle = document.getElementById('analyticsDebugMode');
    if (!(toggle instanceof HTMLInputElement)) {
      throw new Error('analyticsDebugMode toggle missing');
    }
    expect(toggle.disabled).toBe(false);

    toggle.checked = true;
    await (component as unknown as { toggleDebugMode: () => Promise<void> }).toggleDebugMode();

    expect(testContext.analyticsManager.updateConfig).toHaveBeenCalledWith({ debugMode: true });

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.textContent).toBe(testContext.messages.analyticsDebugEnabled);

    component.destroy();
  });

  it('disables debug mode toggle when consent is revoked', async () => {
    const component = await renderComponent();
    const analyticsCheckbox = document.getElementById('analyticsConsent');
    const debugToggle = document.getElementById('analyticsDebugMode');
    const hint = Array.from(document.querySelectorAll('p')).find(
      (p) => p.textContent === testContext.messages.analyticsDebugDisabledHint
    );
    if (
      !(analyticsCheckbox instanceof HTMLInputElement) ||
      !(debugToggle instanceof HTMLInputElement) ||
      !(hint instanceof HTMLElement)
    ) {
      throw new Error('Privacy controls missing');
    }

    expect(debugToggle.disabled).toBe(false);
    expect(hint.hidden).toBe(true);

    analyticsCheckbox.checked = false;
    analyticsCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(debugToggle.disabled).toBe(true);
    expect(hint.hidden).toBe(false);

    component.destroy();
  });

  it('invokes onConsentChange callback when saving settings', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const callback = vi.fn();
    const component = new PrivacySettingsComponent(container, {
      onConsentChange: callback
    });
    component.setMessages(testContext.messages);
    component.render();
    await flushHydration(component);

    const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
    analyticsCheckbox.checked = false;

    await component.saveSettings();

    expect(callback).toHaveBeenCalledWith({
      analytics: false,
      errorReporting: true,
      debugMode: false
    });

    component.destroy();
  });

  it('shows an error status when hydration fails', async () => {
    const hydrationError = new Error('Hydration failed');
    testContext.analyticsManager.refreshFromStorage.mockRejectedValueOnce(hydrationError);

    const component = await renderComponent();

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.textContent).toBe(testContext.messages.privacySettingsError);

    vi.runAllTimers();
    component.destroy();
  });

  it('displays a status message when saving consent fails', async () => {
    const failure = new Error('Consent save failed');
    testContext.setAnalyticsConsent.mockRejectedValueOnce(failure);

    const component = await renderComponent();

    await expect(component.saveSettings()).rejects.toThrow('Consent save failed');

    const status = document.getElementById('privacyStatusMessage');
    expect(status?.textContent).toBe(testContext.messages.privacySettingsError);

    vi.runAllTimers();
    component.destroy();
  });
});

describe('PrivacySection', () => {
  let registry: FormSectionRegistry;
  let stateManager: OptionsStateManager;

  beforeEach(() => {
    registry = new FormSectionRegistry();
    stateManager = new OptionsStateManager();
    vi.clearAllMocks();
    testContext.analyticsManager.refreshFromStorage.mockResolvedValue(undefined);
    testContext.analyticsManager.getUserConsent.mockResolvedValue({
      analytics: true,
      errorReporting: true
    });
    testContext.analyticsManager.getConfig.mockReturnValue({ debugMode: false });
  });

  const renderSection = async (repo: MockOptionsRepository): Promise<PrivacySection> => {
    const container = document.createElement('section');
    document.body.append(container);
    const section = new PrivacySection(container, repo);
    section.setMessages(testContext.messages);
    section.render({ stateManager, formRegistry: registry });
    await vi.waitFor(() => {
      expect(testContext.analyticsManager.getUserConsent).toHaveBeenCalled();
    });
    await Promise.resolve();
    return section;
  };

  it('persists consent snapshots through repository when saving', async () => {
    const repo = new MockOptionsRepository();
    const section = await renderSection(repo);
    const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
    const errorCheckbox = document.getElementById('errorReportingConsent') as HTMLInputElement;
    analyticsCheckbox.checked = false;
    errorCheckbox.checked = false;

    await section.saveSettings();

    await vi.waitFor(() => {
      const stored = repo.getMockData() as { privacyPreferences?: PrivacyConsentSnapshot };
      expect(stored.privacyPreferences).toEqual({
        analytics: false,
        errorReporting: false,
        debugMode: false
      });
    });

    section.destroy();
  });

  it('updates UI when repository consent snapshot changes', async () => {
    const repo = new MockOptionsRepository();
    const section = await renderSection(repo);

    await repo.set({
      privacyPreferences: {
        analytics: false,
        errorReporting: false,
        debugMode: true
      }
    });
    await section.refreshSettings();

    await vi.waitFor(() => {
      const analyticsCheckbox = document.getElementById('analyticsConsent') as HTMLInputElement;
      const errorCheckbox = document.getElementById('errorReportingConsent') as HTMLInputElement;
      expect(analyticsCheckbox.checked).toBe(false);
      expect(errorCheckbox.checked).toBe(false);
    });

    section.destroy();
  });

  it('uses i18n error text when privacy controls fail to render', () => {
    const repo = new MockOptionsRepository();
    const container = document.createElement('section');
    document.body.append(container);
    const renderSpy = vi
      .spyOn(PrivacySettingsComponent.prototype, 'render')
      .mockImplementationOnce(() => {
        throw new Error('boom');
      });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const section = new PrivacySection(container, repo);
    section.setMessages(testContext.messages);
    section.render({ stateManager, formRegistry: registry });

    expect(container.textContent).toContain(testContext.messages.privacySettingsError);

    renderSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    section.destroy();
  });
});
