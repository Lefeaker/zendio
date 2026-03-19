/**
 * 隐私设置组件
 *
 * 管理用户的隐私偏好，包括错误报告和分析数据收集的同意状态
 */

import type { I18nBindingHandle, Messages } from '@i18n';
import { getAnalyticsConfigManager, setAnalyticsConsent } from '@shared/errors/analytics/analyticsConfig';
import { getOptionsI18nBinder, getOptionsMessages } from '../../app/i18nContext';
import { BaseComponent } from '../shared/BaseComponent';
import { createButton } from '../shared/DaisyUIHelpers';

declare const __DEV__: boolean;

const SHOW_DEBUG_TOGGLE = typeof __DEV__ === 'boolean' ? __DEV__ : true;

export interface PrivacyConsentSnapshot {
  analytics: boolean;
  errorReporting: boolean;
  debugMode: boolean;
}

interface PrivacySettingsComponentOptions {
  initialConsent?: PrivacyConsentSnapshot | null;
  onConsentChange?: (snapshot: PrivacyConsentSnapshot) => void;
}

export class PrivacySettingsComponent extends BaseComponent<void> {
  private analyticsCheckbox: HTMLInputElement | null = null;
  private errorReportingCheckbox: HTMLInputElement | null = null;
  private debugModeToggle: HTMLInputElement | null = null;
  private debugModeHint: HTMLElement | null = null;
  private statusMessage: HTMLElement | null = null;
  private bindings: I18nBindingHandle[] = [];
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;
  private readonly initialConsent: PrivacyConsentSnapshot | null;
  private readonly onConsentChange: ((snapshot: PrivacyConsentSnapshot) => void) | undefined;

  constructor(container: HTMLElement, options: PrivacySettingsComponentOptions = {}) {
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
    this.applyI18nBindings();
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
    const card = this.createElement(
      'div',
      [
        'bg-base-100',
        'border',
        'border-base-300',
        'rounded-lg',
        'p-4',
        'shadow-sm'
      ].join(' ')
    );
    const content = this.createElement('div', 'grid gap-2');
    const label = this.createElement(
      'label',
      ['flex', 'items-center', 'gap-2', 'cursor-pointer', 'font-medium', 'text-base-content'].join(' ')
    );
    // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = config.id;
    input.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    label.append(input);

    const span = document.createElement('span');
    this.applyI18nText(span, config.titleKey);
    label.append(span);

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
    const classes = [
      'bg-base-200',
      'border',
      'border-base-300',
      'rounded-lg',
      'p-4',
      variant === 'collected' ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-border'
    ];
    const card = this.createElement('section', classes.join(' '));
    const title = this.createElement('h3', 'text-sm font-semibold mb-2');
    this.applyI18nText(title, titleKey);
    const list = this.buildList(itemKeys);
    card.append(title, list);
    return card;
  }

  private buildList(keys: Array<keyof Messages>): HTMLElement {
    const list = document.createElement('ul');
    list.className = 'list-disc pl-4 space-y-1 text-sm text-base-content/60';
    for (const key of keys) {
      const item = document.createElement('li');
      this.applyI18nText(item, key);
      list.append(item);
    }
    return list;
  }

  private buildDebugSection(): HTMLElement | null {
    const section = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');

    const label = this.createElement('div', 'text-sm font-medium text-base-content/60');
    this.applyI18nText(label, 'analyticsDebugTitle');

    const content = document.createElement('div');
    const checkboxLabel = this.createElement('label', 'flex items-center gap-2 cursor-pointer');
    // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'analyticsDebugMode';
    input.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    checkboxLabel.append(input);

    const span = document.createElement('span');
    this.applyI18nText(span, 'analyticsDebugTitle');
    checkboxLabel.append(span);

    const description = this.createElement('p', 'text-sm text-base-content/60 mt-1');
    this.applyI18nText(description, 'analyticsDebugDescription');

    const hint = this.createElement('p', 'mt-2 p-2 bg-warning/10 text-warning border border-warning/20 rounded text-sm');
    this.applyI18nText(hint, 'analyticsDebugDisabledHint');
    hint.hidden = true;

    content.append(checkboxLabel, description, hint);
    section.append(label, content);

    this.debugModeToggle = input;
    this.debugModeHint = hint;

    return section;
  }

  private buildDataControls(): HTMLElement {
    const section = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    // ✅ Phase 1B: 使用 createButton 工厂函数
    const button = createButton('', {
      variant: 'primary',
      size: 'md'
    });
    button.id = 'clearAllData';
    this.applyI18nText(button, 'clearAllAnalyticsData');
    control.append(button);

    const note = this.createElement('p', 'text-sm text-base-content/60 mt-2');
    this.applyI18nText(note, 'privacySettingsNote');

    section.append(control, note);
    return section;
  }

  private buildFooterLinks(): HTMLElement {
    const section = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');

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
    const status = this.createElement(
      'div',
      [
        'fixed',
        'bottom-4',
        'right-4',
        'z-50',
        'p-4',
        'rounded-lg',
        'border',
        'shadow-lg',
        'bg-base-100',
        'border-base-300'
      ].join(' '),
      {
        id: 'privacyStatusMessage',
        'aria-live': 'polite'
      }
    );
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
      this.analyticsCheckbox && (this.analyticsCheckbox.checked = Boolean(currentConsent?.analytics));
      this.errorReportingCheckbox && (this.errorReportingCheckbox.checked = Boolean(currentConsent?.errorReporting));

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
    const messages = await getOptionsMessages();

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
    const messages = await getOptionsMessages();

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
      const messages = await getOptionsMessages();
      this.showStatusMessage(
        enabled ? messages.analyticsDebugEnabled : messages.analyticsDebugDisabled,
        'info'
      );
      this.onConsentChange?.(this.getConsentSnapshot());
    } catch (error) {
      console.error('[Privacy Settings] Failed to update debug mode:', error);
      this.debugModeToggle.checked = !enabled;
      const messages = await getOptionsMessages();
      this.showStatusMessage(messages.privacySettingsError, 'error');
    }
  }

  private applyI18nBindings(): void {
    const binder = getOptionsI18nBinder();
    if (!binder) {
      return;
    }
    this.container.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((element) => {
      const key = element.getAttribute('data-i18n-key');
      if (!key) {
        return;
      }
      this.bindings.push(binder.bindText(element, key as keyof Messages));
      element.removeAttribute('data-i18n-key');
    });
  }

  private clearBindings(): void {
    this.bindings.forEach(handle => handle.dispose());
    this.bindings = [];
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private applyI18nText(element: HTMLElement, key: keyof Messages): void {
    element.setAttribute('data-i18n-key', key);
    if (this.messages) {
      element.textContent = this.messages[key] ?? null;
    }
  }

  private showStatusMessage(message: string, status: 'success' | 'error' | 'info'): void {
    if (!this.statusMessage) return;

    this.statusMessage.textContent = message;
    this.statusMessage.textContent = message;
    const baseClasses = ['fixed', 'bottom-4', 'right-4', 'z-50', 'p-4', 'rounded-lg', 'border', 'shadow-lg'];
    const statusClasses = status === 'success'
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

export { PrivacySettingsComponent as PrivacySettings };
