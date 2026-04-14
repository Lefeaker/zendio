import { getMessages } from '@i18n';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import type { PrivacyConsentSnapshot } from './PrivacySettingsView';

interface PrivacyBindings {
  analyticsCheckbox: HTMLInputElement | null;
  errorReportingCheckbox: HTMLInputElement | null;
  debugModeToggle: HTMLInputElement | null;
  debugModeHint: HTMLElement | null;
}

function acknowledgePrivacyFailure(_message: string, _error: unknown): void {
  void _message;
  void _error;
}

export async function hydratePrivacySettings(args: {
  bindings: PrivacyBindings;
  showDebugToggle: boolean;
  updateStatus: () => void;
  showErrorStatus: (message: string) => void;
}): Promise<void> {
  const { bindings, showDebugToggle, updateStatus, showErrorStatus } = args;
  try {
    const configManager = getAnalyticsConfigManager();
    await configManager.refreshFromStorage();

    const currentConsent = await configManager.getUserConsent();
    if (bindings.analyticsCheckbox) {
      bindings.analyticsCheckbox.checked = Boolean(currentConsent?.analytics);
    }
    if (bindings.errorReportingCheckbox) {
      bindings.errorReportingCheckbox.checked = Boolean(currentConsent?.errorReporting);
    }

    if (showDebugToggle && bindings.debugModeToggle) {
      const consentGranted =
        Boolean(currentConsent?.analytics) && Boolean(currentConsent?.errorReporting);
      const currentConfig = configManager.getConfig();
      bindings.debugModeToggle.checked = Boolean(currentConfig.debugMode);
      bindings.debugModeToggle.disabled = !consentGranted;
      if (bindings.debugModeHint) {
        bindings.debugModeHint.hidden = consentGranted;
      }
    }

    updateStatus();
  } catch (error) {
    acknowledgePrivacyFailure('[Privacy Settings] Failed to hydrate state:', error);
    const messages = await getMessages();
    showErrorStatus(messages.privacySettingsError);
  }
}

export async function persistPrivacyConsent(args: {
  analyticsConsent: boolean;
  errorReportingConsent: boolean;
  showInlineStatus: boolean;
  updateStatus: () => void;
  showStatusMessage: (message: string, status: 'success' | 'error' | 'info') => void;
  onConsentChange?: (snapshot: PrivacyConsentSnapshot) => void;
  getConsentSnapshot: () => PrivacyConsentSnapshot;
}): Promise<void> {
  const {
    analyticsConsent,
    errorReportingConsent,
    showInlineStatus,
    updateStatus,
    showStatusMessage,
    onConsentChange,
    getConsentSnapshot
  } = args;
  const messages = await getMessages();

  try {
    await setAnalyticsConsent(analyticsConsent, errorReportingConsent);

    if (showInlineStatus) {
      showStatusMessage(messages.privacySettingsSaved, 'success');
    }

    updateStatus();

    if (!analyticsConsent && !errorReportingConsent) {
      setTimeout(() => {
        showStatusMessage(messages.privacyDataWillBeCleared, 'info');
      }, 2000);
    }
    onConsentChange?.(getConsentSnapshot());
  } catch (error) {
    acknowledgePrivacyFailure('[Privacy Settings] Failed to save settings:', error);
    showStatusMessage(messages.privacySettingsError, 'error');
    throw error;
  }
}

export async function togglePrivacyDebugMode(args: {
  debugModeToggle: HTMLInputElement | null;
  showDebugToggle: boolean;
  showStatusMessage: (message: string, status: 'success' | 'error' | 'info') => void;
  onConsentChange?: (snapshot: PrivacyConsentSnapshot) => void;
  getConsentSnapshot: () => PrivacyConsentSnapshot;
}): Promise<void> {
  const {
    debugModeToggle,
    showDebugToggle,
    showStatusMessage,
    onConsentChange,
    getConsentSnapshot
  } = args;

  if (!showDebugToggle || !debugModeToggle) {
    return;
  }

  const enabled = debugModeToggle.checked;
  const configManager = getAnalyticsConfigManager();
  try {
    await configManager.updateConfig({ debugMode: enabled });
    const messages = await getMessages();
    showStatusMessage(
      enabled ? messages.analyticsDebugEnabled : messages.analyticsDebugDisabled,
      'info'
    );
    onConsentChange?.(getConsentSnapshot());
  } catch (error) {
    acknowledgePrivacyFailure('[Privacy Settings] Failed to update debug mode:', error);
    debugModeToggle.checked = !enabled;
    const messages = await getMessages();
    showStatusMessage(messages.privacySettingsError, 'error');
  }
}

export async function clearPrivacyData(args: {
  analyticsCheckbox: HTMLInputElement | null;
  errorReportingCheckbox: HTMLInputElement | null;
  debugModeToggle: HTMLInputElement | null;
  updateStatus: () => void;
  showStatusMessage: (message: string, status: 'success' | 'error' | 'info') => void;
  onConsentChange?: (snapshot: PrivacyConsentSnapshot) => void;
  getConsentSnapshot: () => PrivacyConsentSnapshot;
}): Promise<void> {
  const {
    analyticsCheckbox,
    errorReportingCheckbox,
    debugModeToggle,
    updateStatus,
    showStatusMessage,
    onConsentChange,
    getConsentSnapshot
  } = args;
  const messages = await getMessages();

  if (!confirm(messages.confirmClearAllData)) {
    return;
  }

  try {
    await getAnalyticsConfigManager().clearAllData();
    showStatusMessage(messages.allDataCleared, 'success');
    if (analyticsCheckbox) analyticsCheckbox.checked = false;
    if (errorReportingCheckbox) errorReportingCheckbox.checked = false;
    if (debugModeToggle) debugModeToggle.checked = false;
    updateStatus();
    onConsentChange?.(getConsentSnapshot());
  } catch (error) {
    acknowledgePrivacyFailure('[Privacy Settings] Failed to clear data:', error);
    showStatusMessage(messages.clearDataError, 'error');
  }
}

export async function getPrivacySettings(): Promise<{
  analytics: boolean;
  errorReporting: boolean;
}> {
  const consent = await getAnalyticsConfigManager().getUserConsent();
  return {
    analytics: consent?.analytics || false,
    errorReporting: consent?.errorReporting || false
  };
}

export async function shouldShowPrivacyReminder(): Promise<boolean> {
  return !(await getAnalyticsConfigManager().getUserConsent());
}
