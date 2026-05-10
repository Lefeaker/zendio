import type { Messages } from '@i18n';

export interface PrivacyConsentSnapshot {
  analytics: boolean;
  errorReporting: boolean;
  debugMode: boolean;
}

export interface PrivacyLayoutBindings {
  analyticsCheckbox?: HTMLInputElement | null;
  errorReportingCheckbox?: HTMLInputElement | null;
  debugModeToggle?: HTMLInputElement | null;
  debugModeHint?: HTMLElement | null;
  statusMessage?: HTMLElement | null;
}

export interface PrivacyLayoutOptions {
  showDebugToggle: boolean;
  createElement: typeof document.createElement;
  applyI18nText: (element: HTMLElement, key: keyof Messages) => void;
}
