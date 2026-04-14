import type { Messages } from '@i18n';
import type { PrivacyConsentSnapshot } from './PrivacySettingsView';

interface PrivacyBindingState {
  analyticsCheckbox: HTMLInputElement | null;
  errorReportingCheckbox: HTMLInputElement | null;
  debugModeToggle: HTMLInputElement | null;
  debugModeHint: HTMLElement | null;
  statusMessage: HTMLElement | null;
}

export function applyPrivacyConsentSnapshot(
  bindings: Pick<PrivacyBindingState, 'analyticsCheckbox' | 'errorReportingCheckbox' | 'debugModeToggle' | 'statusMessage' | 'debugModeHint'>,
  snapshot: PrivacyConsentSnapshot,
  showDebugToggle: boolean
): void {
  if (bindings.analyticsCheckbox) {
    bindings.analyticsCheckbox.checked = snapshot.analytics;
  }
  if (bindings.errorReportingCheckbox) {
    bindings.errorReportingCheckbox.checked = snapshot.errorReporting;
  }
  if (showDebugToggle && bindings.debugModeToggle) {
    bindings.debugModeToggle.checked = snapshot.debugMode;
  }
}

export function updatePrivacyStatus(bindings: PrivacyBindingState, showDebugToggle: boolean): void {
  const analyticsEnabled = bindings.analyticsCheckbox?.checked || false;
  const errorReportingEnabled = bindings.errorReportingCheckbox?.checked || false;

  if (showDebugToggle) {
    const canUseDebug = analyticsEnabled && errorReportingEnabled;
    if (bindings.debugModeToggle) {
      bindings.debugModeToggle.disabled = !canUseDebug;
    }
    if (bindings.debugModeHint) {
      bindings.debugModeHint.hidden = canUseDebug;
    }
  }
}

export function showPrivacyStatusMessage(
  bindings: Pick<PrivacyBindingState, 'statusMessage'>,
  message: string,
  status: 'success' | 'error' | 'info'
): void {
  if (!bindings.statusMessage) {
    return;
  }

  bindings.statusMessage.textContent = message;
  const baseClasses = [
    'fixed',
    'bottom-4',
    'right-4',
    'z-50',
    'p-4',
    'rounded-lg',
    'border',
    'shadow-lg'
  ];
  const statusClasses =
    status === 'success'
      ? ['bg-success/10', 'border-success/20', 'text-success']
      : status === 'error'
        ? ['bg-destructive/10', 'border-destructive/20', 'text-destructive']
        : ['bg-base-100', 'border-base-300', 'text-base-content'];

  bindings.statusMessage.className = [...baseClasses, ...statusClasses].join(' ');
  bindings.statusMessage.hidden = false;

  setTimeout(() => {
    if (bindings.statusMessage) {
      bindings.statusMessage.hidden = true;
    }
  }, 3000);
}

export function buildPrivacyConsentSnapshot(bindings: PrivacyBindingState): PrivacyConsentSnapshot {
  return {
    analytics: bindings.analyticsCheckbox?.checked ?? false,
    errorReporting: bindings.errorReportingCheckbox?.checked ?? false,
    debugMode: bindings.debugModeToggle?.checked ?? false
  };
}

export function applyPrivacyI18nText(
  element: HTMLElement,
  key: keyof Messages,
  messages: Messages | null
): void {
  if (messages) {
    element.textContent = messages[key] ?? '';
  }
}
