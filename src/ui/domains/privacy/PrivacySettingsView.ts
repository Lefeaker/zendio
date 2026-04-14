import { getMessages, type Messages } from '@i18n';
import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';
import { buildPrivacySettingsLayout } from './privacySettingsLayout';
import {
  applyPrivacyConsentSnapshot,
  applyPrivacyI18nText,
  buildPrivacyConsentSnapshot,
  showPrivacyStatusMessage,
  updatePrivacyStatus
} from './privacySettingsState';
import {
  clearPrivacyData,
  getPrivacySettings,
  hydratePrivacySettings,
  persistPrivacyConsent,
  shouldShowPrivacyReminder as shouldShowPrivacyReminderFromStorage,
  togglePrivacyDebugMode
} from './privacySettingsAsyncActions';

declare const __DEV__: boolean;

const SHOW_DEBUG_TOGGLE = typeof __DEV__ === 'boolean' ? __DEV__ : true;

export interface PrivacyConsentSnapshot {
  analytics: boolean;
  errorReporting: boolean;
  debugMode: boolean;
}

interface PrivacySettingsOptions {
  initialConsent?: PrivacyConsentSnapshot | null;
  onConsentChange?: (snapshot: PrivacyConsentSnapshot) => void;
}

export class PrivacySettings extends BaseComponent<void> {
  private analyticsCheckbox: HTMLInputElement | null = null;
  private errorReportingCheckbox: HTMLInputElement | null = null;
  private debugModeToggle: HTMLInputElement | null = null;
  private debugModeHint: HTMLElement | null = null;
  private statusMessage: HTMLElement | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;
  private readonly initialConsent: PrivacyConsentSnapshot | null;
  private readonly onConsentChange: ((snapshot: PrivacyConsentSnapshot) => void) | undefined;

  constructor(container: HTMLElement, options: PrivacySettingsOptions = {}) {
    super(container);
    this.initialConsent = options.initialConsent ?? null;
    this.onConsentChange = options.onConsentChange;
  }

  render(): HTMLElement | void {
    this.assertActive();
    this.clearBindings();

    const layout = this.buildLayout();
    this.container.replaceChildren(...layout);

    this.applyInitialConsent();
    this.attachEventListeners();
    void this.hydrateFromStorage();
    this.updateStatus();

    return this.container;
  }

  override destroy(): void {
    this.clearBindings();
    super.destroy();
  }

  applyConsentSnapshot(snapshot: PrivacyConsentSnapshot): void {
    applyPrivacyConsentSnapshot(
      {
        analyticsCheckbox: this.analyticsCheckbox,
        errorReportingCheckbox: this.errorReportingCheckbox,
        debugModeToggle: this.debugModeToggle,
        debugModeHint: this.debugModeHint,
        statusMessage: this.statusMessage
      },
      snapshot,
      SHOW_DEBUG_TOGGLE
    );
    this.updateStatus();
  }

  private buildLayout(): HTMLElement[] {
    const { nodes, bindings } = buildPrivacySettingsLayout({
      showDebugToggle: SHOW_DEBUG_TOGGLE,
      createElement: (tagName: string) =>
        this.createElement(tagName as keyof HTMLElementTagNameMap),
      applyI18nText: (element, key) => this.applyI18nText(element, key)
    });
    this.analyticsCheckbox = bindings.analyticsCheckbox ?? null;
    this.errorReportingCheckbox = bindings.errorReportingCheckbox ?? null;
    this.debugModeToggle = bindings.debugModeToggle ?? null;
    this.debugModeHint = bindings.debugModeHint ?? null;
    this.statusMessage = bindings.statusMessage ?? null;
    return nodes;
  }

  private async hydrateFromStorage(): Promise<void> {
    this.hydrating = true;
    try {
      await hydratePrivacySettings({
        bindings: {
          analyticsCheckbox: this.analyticsCheckbox,
          errorReportingCheckbox: this.errorReportingCheckbox,
          debugModeToggle: this.debugModeToggle,
          debugModeHint: this.debugModeHint
        },
        showDebugToggle: SHOW_DEBUG_TOGGLE,
        updateStatus: () => this.updateStatus(),
        showErrorStatus: (message) => this.showStatusMessage(message, 'error')
      });
    } finally {
      this.hydrating = false;
    }
  }

  private attachEventListeners(): void {
    const clearButton = this.container.querySelector<HTMLButtonElement>('#clearAllData');
    clearButton?.addEventListener('click', () => {
      void this.clearAllData();
    });

    const privacyPolicyLink = this.container.querySelector<HTMLAnchorElement>('#privacyPolicyLink');
    privacyPolicyLink?.addEventListener('click', (event) => {
      event.preventDefault();
    });

    const dataUsageLink = this.container.querySelector<HTMLAnchorElement>('#dataUsageLink');
    dataUsageLink?.addEventListener('click', (event) => {
      event.preventDefault();
    });

    this.analyticsCheckbox?.addEventListener('change', () => this.handleConsentChange());
    this.errorReportingCheckbox?.addEventListener('change', () => this.handleConsentChange());

    if (SHOW_DEBUG_TOGGLE) {
      this.debugModeToggle?.addEventListener('change', () => {
        void this.toggleDebugMode();
      });
    }
  }

  private handleConsentChange(): void {
    if (this.hydrating) {
      return;
    }
    this.updateStatus();
    this.scheduleConsentAutoSave();
  }

  private scheduleConsentAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.saveSettings({ showInlineStatus: false }).catch((_error) => {
        void getMessages().then((messages) => {
          this.showStatusMessage(messages.privacySettingsError, 'error');
        });
      });
    }, 300);
  }

  async saveSettings(options: { showInlineStatus?: boolean } = {}): Promise<void> {
    const { showInlineStatus = true } = options;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    await persistPrivacyConsent({
      analyticsConsent: this.analyticsCheckbox?.checked || false,
      errorReportingConsent: this.errorReportingCheckbox?.checked || false,
      showInlineStatus,
      updateStatus: () => this.updateStatus(),
      showStatusMessage: (message, status) => this.showStatusMessage(message, status),
      ...(this.onConsentChange ? { onConsentChange: this.onConsentChange } : {}),
      getConsentSnapshot: () => this.getConsentSnapshot()
    });
  }

  private async clearAllData(): Promise<void> {
    await clearPrivacyData({
      analyticsCheckbox: this.analyticsCheckbox,
      errorReportingCheckbox: this.errorReportingCheckbox,
      debugModeToggle: this.debugModeToggle,
      updateStatus: () => this.updateStatus(),
      showStatusMessage: (message, status) => this.showStatusMessage(message, status),
      ...(this.onConsentChange ? { onConsentChange: this.onConsentChange } : {}),
      getConsentSnapshot: () => this.getConsentSnapshot()
    });
  }

  private updateStatus(): void {
    updatePrivacyStatus(
      {
        analyticsCheckbox: this.analyticsCheckbox,
        errorReportingCheckbox: this.errorReportingCheckbox,
        debugModeToggle: this.debugModeToggle,
        debugModeHint: this.debugModeHint,
        statusMessage: this.statusMessage
      },
      SHOW_DEBUG_TOGGLE
    );
  }

  private async toggleDebugMode(): Promise<void> {
    await togglePrivacyDebugMode({
      debugModeToggle: this.debugModeToggle,
      showDebugToggle: SHOW_DEBUG_TOGGLE,
      showStatusMessage: (message, status) => this.showStatusMessage(message, status),
      ...(this.onConsentChange ? { onConsentChange: this.onConsentChange } : {}),
      getConsentSnapshot: () => this.getConsentSnapshot()
    });
  }

  private clearBindings(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private applyI18nText(element: HTMLElement, key: keyof Messages): void {
    applyPrivacyI18nText(element, key, this.messages);
  }

  private showStatusMessage(message: string, status: 'success' | 'error' | 'info'): void {
    showPrivacyStatusMessage({ statusMessage: this.statusMessage }, message, status);
  }

  private getConsentSnapshot(): PrivacyConsentSnapshot {
    return buildPrivacyConsentSnapshot({
      analyticsCheckbox: this.analyticsCheckbox,
      errorReportingCheckbox: this.errorReportingCheckbox,
      debugModeToggle: this.debugModeToggle,
      debugModeHint: this.debugModeHint,
      statusMessage: this.statusMessage
    });
  }

  private applyInitialConsent(): void {
    if (this.initialConsent) {
      this.applyConsentSnapshot(this.initialConsent);
    }
  }

  async getSettings(): Promise<{ analytics: boolean; errorReporting: boolean }> {
    return getPrivacySettings();
  }

  async shouldShowPrivacyReminder(): Promise<boolean> {
    return shouldShowPrivacyReminderFromStorage();
  }
}
