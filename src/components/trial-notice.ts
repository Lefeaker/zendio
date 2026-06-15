/**
 * Trial notice component.
 * Displays trial status and expiration reminders in the UI.
 */

import {
  DEFAULT_LANGUAGE,
  DEFAULT_RUNTIME_MESSAGES,
  formatMessage,
  getCurrentLanguage,
  getMessages,
  type Messages
} from '@i18n';
import {
  checkTrialStatus,
  formatRemainingTime,
  formatTrialDate,
  formatTrialSummaryMessage,
  type TrialStatus
} from '../utils/trial-manager.js';

type TrialNoticeMessageKey =
  | 'trialNoticeCloseButton'
  | 'trialNoticeTitleActive'
  | 'trialNoticeTitleExpired'
  | 'trialNoticeTitleExpiringSoon'
  | 'trialNotificationExpiredMessage'
  | 'trialNotificationExpiredTitle'
  | 'trialNotificationExpiringSoonMessage'
  | 'trialNotificationExpiringSoonTitle'
  | 'trialSummaryExpired'
  | 'trialSummaryRemaining';

type TrialNoticeMessages = Pick<Messages, TrialNoticeMessageKey>;

const DEFAULT_NOTICE_MESSAGES: TrialNoticeMessages = {
  trialNoticeCloseButton: DEFAULT_RUNTIME_MESSAGES.trialNoticeCloseButton,
  trialNoticeTitleActive: DEFAULT_RUNTIME_MESSAGES.trialNoticeTitleActive,
  trialNoticeTitleExpired: DEFAULT_RUNTIME_MESSAGES.trialNoticeTitleExpired,
  trialNoticeTitleExpiringSoon: DEFAULT_RUNTIME_MESSAGES.trialNoticeTitleExpiringSoon,
  trialNotificationExpiredMessage: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiredMessage,
  trialNotificationExpiredTitle: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiredTitle,
  trialNotificationExpiringSoonMessage:
    DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiringSoonMessage,
  trialNotificationExpiringSoonTitle: DEFAULT_RUNTIME_MESSAGES.trialNotificationExpiringSoonTitle,
  trialSummaryExpired: DEFAULT_RUNTIME_MESSAGES.trialSummaryExpired,
  trialSummaryRemaining: DEFAULT_RUNTIME_MESSAGES.trialSummaryRemaining
};

const STYLE_ID = 'trial-notice-style';
const STYLE_SELECTOR = 'style[data-trial-notice-style]';
const NOTICE_STATE_CLASSES = [
  'trial-notice--active',
  'trial-notice--expiring',
  'trial-notice--expired'
];

function selectTrialNoticeMessages(messages: Messages): TrialNoticeMessages {
  return {
    trialNoticeCloseButton:
      messages.trialNoticeCloseButton ?? DEFAULT_NOTICE_MESSAGES.trialNoticeCloseButton,
    trialNoticeTitleActive:
      messages.trialNoticeTitleActive ?? DEFAULT_NOTICE_MESSAGES.trialNoticeTitleActive,
    trialNoticeTitleExpired:
      messages.trialNoticeTitleExpired ?? DEFAULT_NOTICE_MESSAGES.trialNoticeTitleExpired,
    trialNoticeTitleExpiringSoon:
      messages.trialNoticeTitleExpiringSoon ?? DEFAULT_NOTICE_MESSAGES.trialNoticeTitleExpiringSoon,
    trialNotificationExpiredMessage:
      messages.trialNotificationExpiredMessage ??
      DEFAULT_NOTICE_MESSAGES.trialNotificationExpiredMessage,
    trialNotificationExpiredTitle:
      messages.trialNotificationExpiredTitle ??
      DEFAULT_NOTICE_MESSAGES.trialNotificationExpiredTitle,
    trialNotificationExpiringSoonMessage:
      messages.trialNotificationExpiringSoonMessage ??
      DEFAULT_NOTICE_MESSAGES.trialNotificationExpiringSoonMessage,
    trialNotificationExpiringSoonTitle:
      messages.trialNotificationExpiringSoonTitle ??
      DEFAULT_NOTICE_MESSAGES.trialNotificationExpiringSoonTitle,
    trialSummaryExpired:
      messages.trialSummaryExpired ?? DEFAULT_NOTICE_MESSAGES.trialSummaryExpired,
    trialSummaryRemaining:
      messages.trialSummaryRemaining ?? DEFAULT_NOTICE_MESSAGES.trialSummaryRemaining
  };
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.trialNoticeStyle = 'base';
  style.textContent =
    '.trial-notice{position:fixed;top:10px;right:10px;color:white;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:10000;max-width:300px;cursor:pointer;transition:all .3s ease}.trial-notice:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.2)}.trial-notice--active{background:#3742fa}.trial-notice--expiring{background:#ffa502}.trial-notice--expired{background:#ff4757;animation:trial-blink 2s infinite}.trial-notice__row{display:flex;align-items:center;gap:8px}.trial-notice__title{font-weight:bold}.trial-notice__detail{font-size:12px;opacity:.9}.trial-notice-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001}.trial-notice-modal__content{background:white;padding:24px;border-radius:12px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}.trial-notice-modal__summary{text-align:center;margin-bottom:20px}.trial-notice-modal__title{margin:0 0 16px 0;color:#333}.trial-notice-modal__body{color:#666;line-height:1.6}.trial-notice-modal__message{margin-top:12px}.trial-notice-modal__actions{text-align:center}.trial-notice-modal__close{background:#3742fa;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px}@keyframes trial-blink{0%,50%{opacity:1}25%,75%{opacity:.7}}';
  document.head.appendChild(style);
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string,
  className?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

export class TrialNotice {
  private container: HTMLElement | null = null;
  private status: TrialStatus | null = null;
  private checkInterval: number | null = null;
  private language = DEFAULT_LANGUAGE;
  private messages: TrialNoticeMessages = DEFAULT_NOTICE_MESSAGES;

  /**
   * Initialize the trial notice component.
   */
  async initialize(): Promise<void> {
    await this.refreshLocalization();
    this.applyStatus(await checkTrialStatus());
  }

  private async refreshLocalization(): Promise<void> {
    try {
      const [language, messages] = await Promise.all([getCurrentLanguage(), getMessages()]);
      this.language = language;
      this.messages = selectTrialNoticeMessages(messages);
    } catch {
      this.language = DEFAULT_LANGUAGE;
      this.messages = DEFAULT_NOTICE_MESSAGES;
    }
  }

  /**
   * Create the notice container.
   */
  private createNoticeElement(): void {
    if (!this.status || !this.status.isTrial) {
      return;
    }

    ensureStyles();
    this.container = document.createElement('div');
    this.container.className = 'trial-notice';

    this.container.addEventListener('click', () => {
      this.showDetailedInfo();
    });

    document.body.appendChild(this.container);
  }

  /**
   * Update the visible notice copy.
   */
  private updateNoticeContent(): void {
    if (!this.container || !this.status) {
      return;
    }

    this.container.classList.remove(...NOTICE_STATE_CLASSES);

    if (this.status.isExpired) {
      const detail = this.status.expirationDate
        ? formatTrialDate(this.status.expirationDate, this.language)
        : '';
      this.container.classList.add('trial-notice--expired');
      this.container.replaceChildren(
        this.createNoticeContent('⚠️', this.messages.trialNoticeTitleExpired, detail)
      );
      return;
    }

    const remaining = formatRemainingTime(this.status, this.language);
    if (this.status.isExpiringSoon) {
      this.container.classList.add('trial-notice--expiring');
      this.container.replaceChildren(
        this.createNoticeContent('⏰', this.messages.trialNoticeTitleExpiringSoon, remaining)
      );
      return;
    }

    this.container.classList.add('trial-notice--active');
    this.container.replaceChildren(
      this.createNoticeContent('🔄', this.messages.trialNoticeTitleActive, remaining)
    );
  }

  private createNoticeContent(icon: string, titleText: string, detailText: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'trial-notice__row';

    const iconElement = createTextElement('span', icon);
    const text = document.createElement('div');
    text.append(
      createTextElement('div', titleText, 'trial-notice__title'),
      createTextElement('div', detailText, 'trial-notice__detail')
    );
    row.append(iconElement, text);
    return row;
  }

  private removeOwnedStyles(): void {
    document.querySelectorAll(STYLE_SELECTOR).forEach((style) => style.remove());
  }

  /**
   * Show the detail modal.
   */
  private showDetailedInfo(): void {
    if (!this.status) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'trial-notice-modal';

    const content = document.createElement('div');
    content.className = 'trial-notice-modal__content';

    const title = this.status.isExpired
      ? this.messages.trialNoticeTitleExpired
      : this.status.isExpiringSoon
        ? this.messages.trialNoticeTitleExpiringSoon
        : this.messages.trialNoticeTitleActive;
    const remaining = formatRemainingTime(this.status, this.language);
    const summaryText = formatTrialSummaryMessage(this.status, this.messages, this.language);

    const summary = document.createElement('div');
    summary.className = 'trial-notice-modal__summary';
    summary.append(
      createTextElement('h3', title, 'trial-notice-modal__title'),
      this.createModalBody(summaryText, remaining)
    );

    const actions = document.createElement('div');
    actions.className = 'trial-notice-modal__actions';
    const closeButton = createTextElement(
      'button',
      this.messages.trialNoticeCloseButton,
      'trial-notice-modal__close'
    );
    closeButton.id = 'trial-close-btn';
    closeButton.type = 'button';
    actions.append(closeButton);
    content.append(summary, actions);

    modal.appendChild(content);
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
    };

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  private createModalBody(summaryText: string, remaining: string): HTMLElement {
    const body = document.createElement('div');
    body.className = 'trial-notice-modal__body';
    body.append(createTextElement('p', summaryText));

    if (this.status?.isExpired) {
      body.append(
        createTextElement(
          'p',
          this.messages.trialNotificationExpiredMessage,
          'trial-notice-modal__message'
        )
      );
      return body;
    }

    if (this.status?.isExpiringSoon) {
      body.append(
        createTextElement(
          'p',
          formatMessage(
            this.messages.trialNotificationExpiringSoonMessage,
            { remaining },
            this.language
          ),
          'trial-notice-modal__message'
        )
      );
    }

    return body;
  }

  /**
   * Start periodic status checks.
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval !== null) {
      return;
    }

    const runCheck = (): void => {
      void this.refreshTrialStatus();
    };
    this.checkInterval = window.setInterval(runCheck, 60000);
  }

  private async refreshTrialStatus(): Promise<void> {
    await this.refreshLocalization();
    this.applyStatus(await checkTrialStatus());
  }

  private applyStatus(status: TrialStatus): void {
    this.status = status;

    if (!status.isTrial) {
      this.removeNoticeElement();
      this.removeOwnedStyles();
      this.stopPeriodicCheck();
      return;
    }

    if (!this.container) {
      this.createNoticeElement();
    }
    this.updateNoticeContent();
    this.startPeriodicCheck();
  }

  private removeNoticeElement(): void {
    this.container?.remove();
    this.container = null;
  }

  private stopPeriodicCheck(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Destroy the component.
   */
  destroy(): void {
    this.removeNoticeElement();
    this.stopPeriodicCheck();
    this.removeOwnedStyles();
  }

  /**
   * Manually refresh the status.
   */
  async refresh(): Promise<void> {
    await this.refreshLocalization();
    this.applyStatus(await checkTrialStatus());
  }
}

let globalTrialNotice: TrialNotice | null = null;

export async function initializeTrialNotice(): Promise<void> {
  if (globalTrialNotice) {
    globalTrialNotice.destroy();
  }

  globalTrialNotice = new TrialNotice();
  await globalTrialNotice.initialize();
}

export function getTrialNotice(): TrialNotice | null {
  return globalTrialNotice;
}
