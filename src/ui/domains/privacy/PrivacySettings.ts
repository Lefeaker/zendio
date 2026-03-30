/**
 * 隐私设置组件
 *
 * 管理用户的隐私偏好，包括错误报告和分析数据收集的同意状态
 */

import { getMessages, type Messages } from '@i18n';
import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '@shared/errors/analytics/analyticsConfig';
import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';
import { UiButton } from '../../primitives/button';
import { UiCheckbox } from '../../primitives/checkbox';
import {
  createOptionsActionRow,
  createOptionsHintText,
  createOptionsMessageList,
  createOptionsPanel,
  createOptionsSettingRow
} from '../../primitives/layout';

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
    if (this.analyticsCheckbox) {
      this.analyticsCheckbox.checked = snapshot.analytics;
    }
    if (this.errorReportingCheckbox) {
      this.errorReportingCheckbox.checked = snapshot.errorReporting;
    }
    if (SHOW_DEBUG_TOGGLE && this.debugModeToggle) {
      this.debugModeToggle.checked = snapshot.debugMode;
    }
    this.updateStatus();
  }

  private buildLayout(): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    nodes.push(this.buildConsentGrid(), this.buildConsentHints());

    if (SHOW_DEBUG_TOGGLE) {
      const debugSection = this.buildDebugSection();
      if (debugSection) {
        nodes.push(debugSection);
      }
    }

    nodes.push(this.buildDataControls(), this.buildFooterLinks(), this.buildStatusMessage());
    return nodes;
  }

  private buildConsentGrid(): HTMLElement {
    const grid = this.createElement('div', 'grid gap-4 sm:grid-cols-2');
    grid.append(
      this.buildConsentCard({
        id: 'analyticsConsent',
        checkboxRef: (input) => {
          this.analyticsCheckbox = input;
        },
        titleKey: 'analyticsConsentTitle',
        descriptionKey: 'analyticsConsentDescription'
      }),
      this.buildConsentCard({
        id: 'errorReportingConsent',
        checkboxRef: (input) => {
          this.errorReportingCheckbox = input;
        },
        titleKey: 'errorReportingConsentTitle',
        descriptionKey: 'errorReportingConsentDescription'
      })
    );
    return grid;
  }

  private buildConsentCard(config: {
    id: string;
    checkboxRef: (input: HTMLInputElement) => void;
    titleKey: keyof Messages;
    descriptionKey: keyof Messages;
  }): HTMLElement {
    const card = createOptionsPanel({
      className: 'rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm'
    });
    const content = this.createElement('div', 'grid gap-2');
    const label = this.createElement('div');
    const checkbox = new UiCheckbox(label);
    const input = checkbox.render({
      id: config.id,
      label: ' '
    });

    const span = label.querySelector('span');
    if (span instanceof HTMLElement) {
      this.applyI18nText(span, config.titleKey);
    }

    const description = this.createElement('p', 'text-sm text-base-content/60');
    this.applyI18nText(description, config.descriptionKey);

    content.append(label, description);
    card.append(content);
    config.checkboxRef(input);
    return card;
  }

  private buildConsentHints(): HTMLElement {
    const wrapper = this.createElement('div', 'grid gap-4 sm:grid-cols-2');
    wrapper.append(
      this.buildHintCard(
        'errorReportingCollectedTitle',
        [
          'errorReportingCollectedError',
          'errorReportingCollectedBrowser',
          'errorReportingCollectedExtension',
          'errorReportingCollectedTimestamp'
        ],
        'collected'
      ),
      this.buildHintCard(
        'errorReportingNotCollectedTitle',
        [
          'errorReportingNotCollectedPersonal',
          'errorReportingNotCollectedUrls',
          'errorReportingNotCollectedContent',
          'errorReportingNotCollectedPasswords'
        ],
        'excluded'
      )
    );
    return wrapper;
  }

  private buildHintCard(
    titleKey: keyof Messages,
    itemKeys: Array<keyof Messages>,
    variant: 'collected' | 'excluded'
  ): HTMLElement {
    const card = createOptionsPanel({
      tag: 'section',
      className: [
        'rounded-lg',
        'border',
        'border-base-300',
        'bg-base-200',
        'p-4',
        variant === 'collected' ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-border'
      ].join(' ')
    });
    const title = this.createElement('h3', 'text-sm font-semibold mb-2');
    this.applyI18nText(title, titleKey);
    const list = this.buildList(itemKeys);
    card.append(title, list);
    return card;
  }

  private buildList(keys: Array<keyof Messages>): HTMLElement {
    const list = createOptionsMessageList([], {
      className: 'list-disc pl-4 space-y-1 text-sm text-base-content/60'
    });
    for (const key of keys) {
      const item = document.createElement('li');
      this.applyI18nText(item, key);
      list.append(item);
    }
    return list;
  }

  private buildDebugSection(): HTMLElement | null {
    const section = createOptionsSettingRow();

    const label = this.createElement('div', 'text-sm font-medium text-base-content/60');
    this.applyI18nText(label, 'analyticsDebugTitle');

    const content = document.createElement('div');
    const checkboxHost = this.createElement('div');
    const input = new UiCheckbox(checkboxHost).render({
      id: 'analyticsDebugMode',
      label: ' '
    });

    const checkboxLabel = checkboxHost.querySelector('label') ?? checkboxHost;
    const span = checkboxHost.querySelector('span');
    if (span instanceof HTMLElement) {
      this.applyI18nText(span, 'analyticsDebugTitle');
    } else {
      const fallback = this.createElement('span');
      this.applyI18nText(fallback, 'analyticsDebugTitle');
      checkboxLabel.append(fallback);
    }

    const description = createOptionsHintText({ className: 'text-sm text-base-content/60 mt-1' });
    this.applyI18nText(description, 'analyticsDebugDescription');

    const hint = createOptionsHintText({
      className: 'mt-2 rounded border border-warning/20 bg-warning/10 p-2 text-sm text-warning'
    });
    this.applyI18nText(hint, 'analyticsDebugDisabledHint');
    hint.hidden = true;

    content.append(checkboxLabel, description, hint);
    section.append(label, content);

    this.debugModeToggle = input;
    this.debugModeHint = hint;

    return section;
  }

  private buildDataControls(): HTMLElement {
    const section = createOptionsSettingRow();
    const control = createOptionsActionRow({ className: 'flex flex-wrap justify-start gap-2' });
    const buttonHost = this.createElement('div');
    const button = new UiButton(buttonHost).render({
      label: '',
      variant: 'primary'
    });
    button.id = 'clearAllData';
    this.applyI18nText(button, 'clearAllAnalyticsData');
    control.append(buttonHost);

    const note = createOptionsHintText();
    this.applyI18nText(note, 'privacySettingsNote');

    section.append(control, note);
    return section;
  }

  private buildFooterLinks(): HTMLElement {
    const section = createOptionsSettingRow();

    const label = this.createElement('div', 'text-sm font-medium text-base-content/60');
    this.applyI18nText(label, 'privacySettingsDescription');

    const content = document.createElement('div');
    const linkStack = this.createElement('div', 'flex gap-4 mb-2');

    const policy = this.createElement('a', 'text-sm text-accent hover:underline', {
      href: '#',
      id: 'privacyPolicyLink'
    });
    this.applyI18nText(policy, 'privacyPolicyLink');

    const dataUsage = this.createElement('a', 'text-sm text-accent hover:underline', {
      href: '#',
      id: 'dataUsageLink'
    });
    this.applyI18nText(dataUsage, 'dataUsageLink');

    linkStack.append(policy, dataUsage);

    const footer = this.createElement('p', 'text-sm text-base-content/60');
    this.applyI18nText(footer, 'privacyFooterText');

    content.append(linkStack, footer);
    section.append(label, content);

    return section;
  }

  private buildStatusMessage(): HTMLElement {
    const status = createOptionsPanel({
      className: [
        'fixed',
        'bottom-4',
        'right-4',
        'z-50',
        'rounded-lg',
        'border',
        'border-base-300',
        'bg-base-100',
        'p-4',
        'shadow-lg'
      ].join(' '),
      attributes: {
        id: 'privacyStatusMessage',
        'aria-live': 'polite'
      }
    });
    status.hidden = true;
    this.statusMessage = status;
    return status;
  }

  private async hydrateFromStorage(): Promise<void> {
    this.hydrating = true;
    try {
      const configManager = getAnalyticsConfigManager();
      await configManager.refreshFromStorage();

      const currentConsent = await configManager.getUserConsent();
      this.analyticsCheckbox &&
        (this.analyticsCheckbox.checked = Boolean(currentConsent?.analytics));
      this.errorReportingCheckbox &&
        (this.errorReportingCheckbox.checked = Boolean(currentConsent?.errorReporting));

      if (SHOW_DEBUG_TOGGLE && this.debugModeToggle) {
        const consentGranted =
          Boolean(currentConsent?.analytics) && Boolean(currentConsent?.errorReporting);
        const currentConfig = configManager.getConfig();
        this.debugModeToggle.checked = Boolean(currentConfig.debugMode);
        this.debugModeToggle.disabled = !consentGranted;
        if (this.debugModeHint) {
          this.debugModeHint.hidden = consentGranted;
        }
      }

      this.updateStatus();
    } catch (error) {
      console.error('[Privacy Settings] Failed to hydrate state:', error);
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
      this.showPrivacyPolicy();
    });

    const dataUsageLink = this.container.querySelector<HTMLAnchorElement>('#dataUsageLink');
    dataUsageLink?.addEventListener('click', (event) => {
      event.preventDefault();
      this.showDataUsageInfo();
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
      void this.saveSettings({ showInlineStatus: false }).catch((error) => {
        console.error('[Privacy Settings] Auto-save failed:', error);
      });
    }, 300);
  }

  async saveSettings(options: { showInlineStatus?: boolean } = {}): Promise<void> {
    const { showInlineStatus = true } = options;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    const messages = await getMessages();

    try {
      const analyticsConsent = this.analyticsCheckbox?.checked || false;
      const errorReportingConsent = this.errorReportingCheckbox?.checked || false;

      await setAnalyticsConsent(analyticsConsent, errorReportingConsent);

      if (showInlineStatus) {
        this.showStatusMessage(messages.privacySettingsSaved, 'success');
      }

      this.updateStatus();

      // 如果用户关闭了所有数据收集，提示数据将被清理
      if (!analyticsConsent && !errorReportingConsent) {
        setTimeout(() => {
          this.showStatusMessage(messages.privacyDataWillBeCleared, 'info');
        }, 2000);
      }
      this.onConsentChange?.(this.getConsentSnapshot());
    } catch (error) {
      console.error('[Privacy Settings] Failed to save settings:', error);
      if (showInlineStatus) {
        this.showStatusMessage(messages.privacySettingsError, 'error');
      }

      throw error;
    }
  }

  private async clearAllData(): Promise<void> {
    const messages = await getMessages();

    if (!confirm(messages.confirmClearAllData)) {
      return;
    }

    try {
      const configManager = getAnalyticsConfigManager();
      await configManager.clearAllData();

      this.showStatusMessage(messages.allDataCleared, 'success');

      // 重置复选框状态
      if (this.analyticsCheckbox) this.analyticsCheckbox.checked = false;
      if (this.errorReportingCheckbox) this.errorReportingCheckbox.checked = false;
      if (this.debugModeToggle) this.debugModeToggle.checked = false;
      this.updateStatus();
      this.onConsentChange?.(this.getConsentSnapshot());
    } catch (error) {
      console.error('[Privacy Settings] Failed to clear data:', error);
      this.showStatusMessage(messages.clearDataError, 'error');
    }
  }

  private updateStatus(): void {
    const analyticsEnabled = this.analyticsCheckbox?.checked || false;
    const errorReportingEnabled = this.errorReportingCheckbox?.checked || false;

    if (SHOW_DEBUG_TOGGLE) {
      const canUseDebug = analyticsEnabled && errorReportingEnabled;
      if (this.debugModeToggle) {
        this.debugModeToggle.disabled = !canUseDebug;
      }
      if (this.debugModeHint) {
        this.debugModeHint.hidden = canUseDebug;
      }
    }
  }

  private async toggleDebugMode(): Promise<void> {
    if (!SHOW_DEBUG_TOGGLE || !this.debugModeToggle) {
      return;
    }

    const enabled = this.debugModeToggle.checked;
    const configManager = getAnalyticsConfigManager();
    try {
      await configManager.updateConfig({ debugMode: enabled });
      const messages = await getMessages();
      this.showStatusMessage(
        enabled ? messages.analyticsDebugEnabled : messages.analyticsDebugDisabled,
        'info'
      );
      this.onConsentChange?.(this.getConsentSnapshot());
    } catch (error) {
      console.error('[Privacy Settings] Failed to update debug mode:', error);
      this.debugModeToggle.checked = !enabled;
      const messages = await getMessages();
      this.showStatusMessage(messages.privacySettingsError, 'error');
    }
  }

  private clearBindings(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private applyI18nText(element: HTMLElement, key: keyof Messages): void {
    if (this.messages) {
      element.textContent = this.messages[key] ?? '';
    }
  }

  private showStatusMessage(message: string, status: 'success' | 'error' | 'info'): void {
    if (!this.statusMessage) return;

    this.statusMessage.textContent = message;
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

    this.statusMessage.className = [...baseClasses, ...statusClasses].join(' ');
    this.statusMessage.hidden = false;

    // 3秒后自动隐藏
    setTimeout(() => {
      if (this.statusMessage) {
        this.statusMessage.hidden = true;
      }
    }, 3000);
  }

  private getConsentSnapshot(): PrivacyConsentSnapshot {
    return {
      analytics: this.analyticsCheckbox?.checked ?? false,
      errorReporting: this.errorReportingCheckbox?.checked ?? false,
      debugMode: this.debugModeToggle?.checked ?? false
    };
  }

  private applyInitialConsent(): void {
    if (this.initialConsent) {
      this.applyConsentSnapshot(this.initialConsent);
    }
  }

  private showPrivacyPolicy(): void {
    console.info('[Privacy Settings] Privacy policy link clicked (placeholder).');
  }

  private showDataUsageInfo(): void {
    console.info('[Privacy Settings] Data usage link clicked (placeholder).');
  }

  /**
   * 获取当前设置状态
   */
  async getSettings(): Promise<{ analytics: boolean; errorReporting: boolean }> {
    const configManager = getAnalyticsConfigManager();
    const consent = await configManager.getUserConsent();

    return {
      analytics: consent?.analytics || false,
      errorReporting: consent?.errorReporting || false
    };
  }

  /**
   * 检查是否需要显示隐私设置提醒
   */
  async shouldShowPrivacyReminder(): Promise<boolean> {
    const configManager = getAnalyticsConfigManager();
    const consent = await configManager.getUserConsent();

    // 如果用户从未设置过隐私偏好，显示提醒
    return !consent;
  }
}
