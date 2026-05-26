/**
 * 试用版本提醒组件
 * 在用户界面中显示试用状态和过期提醒
 */

import { checkTrialStatus, formatRemainingTime, type TrialStatus } from '../utils/trial-manager.js';

const STYLE_ID = 'trial-notice-style';
const STYLE_SELECTOR = 'style[data-trial-notice-style]';
const NOTICE_STATE_CLASSES = [
  'trial-notice--active',
  'trial-notice--expiring',
  'trial-notice--expired'
];

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.trialNoticeStyle = 'base';
  style.textContent =
    '.trial-notice{position:fixed;top:10px;right:10px;color:white;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:10000;max-width:300px;cursor:pointer;transition:all .3s ease}.trial-notice:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.2)}.trial-notice--active{background:#3742fa}.trial-notice--expiring{background:#ffa502}.trial-notice--expired{background:#ff4757;animation:trial-blink 2s infinite}.trial-notice__row{display:flex;align-items:center;gap:8px}.trial-notice__title{font-weight:bold}.trial-notice__detail{font-size:12px;opacity:.9}.trial-notice-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001}.trial-notice-modal__content{background:white;padding:24px;border-radius:12px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}.trial-notice-modal__summary{text-align:center;margin-bottom:20px}.trial-notice-modal__title{margin:0 0 16px 0;color:#333}.trial-notice-modal__body{color:#666;line-height:1.6}.trial-notice-modal__restricted{color:#ff4757}.trial-notice-modal__available{color:#2ed573}.trial-notice-modal__actions{text-align:center}.trial-notice-modal__close{background:#3742fa;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px}@keyframes trial-blink{0%,50%{opacity:1}25%,75%{opacity:.7}}';
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

  /**
   * 初始化试用提醒组件
   */
  async initialize(): Promise<void> {
    this.applyStatus(await checkTrialStatus());
  }

  /**
   * 创建提醒元素
   */
  private createNoticeElement(): void {
    if (!this.status || !this.status.isTrial) {
      return;
    }

    // 创建容器
    ensureStyles();
    this.container = document.createElement('div');
    this.container.className = 'trial-notice';

    // 添加点击事件
    this.container.addEventListener('click', () => {
      this.showDetailedInfo();
    });

    // 添加到页面
    document.body.appendChild(this.container);
  }

  /**
   * 更新提醒内容
   */
  private updateNoticeContent(): void {
    if (!this.container || !this.status) {
      return;
    }

    const timeStr = formatRemainingTime(this.status);
    this.container.classList.remove(...NOTICE_STATE_CLASSES);

    if (this.status.isExpired) {
      this.container.classList.add('trial-notice--expired');
      this.container.replaceChildren(
        this.createNoticeContent('⚠️', '试用版已过期', '点击查看详情')
      );
    } else if (this.status.isExpiringSoon) {
      this.container.classList.add('trial-notice--expiring');
      this.container.replaceChildren(this.createNoticeContent('⏰', '试用版即将过期', timeStr));
    } else {
      this.container.classList.add('trial-notice--active');
      this.container.replaceChildren(this.createNoticeContent('🔄', '试用版', timeStr));
    }
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
   * 显示详细信息弹窗
   */
  private showDetailedInfo(): void {
    if (!this.status) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'trial-notice-modal';

    const content = document.createElement('div');
    content.className = 'trial-notice-modal__content';

    const timeStr = formatRemainingTime(this.status);
    const expirationStr = this.status.expirationDate
      ? this.status.expirationDate.toLocaleString('zh-CN')
      : '未知';
    const summary = document.createElement('div');
    summary.className = 'trial-notice-modal__summary';

    summary.append(
      createTextElement(
        'h3',
        this.status.isExpired ? '⚠️ 试用版已过期' : '🔄 试用版信息',
        'trial-notice-modal__title'
      ),
      this.createModalBody(timeStr, expirationStr)
    );

    const actions = document.createElement('div');
    actions.className = 'trial-notice-modal__actions';
    const closeButton = createTextElement('button', '确定', 'trial-notice-modal__close');
    closeButton.id = 'trial-close-btn';
    closeButton.type = 'button';
    actions.append(closeButton);
    content.append(summary, actions);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // 关闭按钮事件
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

  private createModalBody(timeStr: string, expirationStr: string): HTMLElement {
    const body = document.createElement('div');
    body.className = 'trial-notice-modal__body';
    body.append(
      this.createLabelParagraph('状态', timeStr),
      this.createLabelParagraph('过期时间', expirationStr)
    );

    if (this.status?.isExpired) {
      const restricted = document.createElement('p');
      restricted.className = 'trial-notice-modal__restricted';
      restricted.append(createTextElement('strong', '功能已被限制，请联系开发者获取正式版本。'));
      body.append(restricted);
    } else {
      body.append(createTextElement('p', '扩展功能正常可用。', 'trial-notice-modal__available'));
    }

    return body;
  }

  private createLabelParagraph(label: string, value: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.append(
      createTextElement('strong', `${label}:`),
      document.createTextNode(` ${value}`)
    );
    return paragraph;
  }

  /**
   * 开始定期检查
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval !== null) {
      return;
    }

    const runCheck = (): void => {
      void this.refreshTrialStatus();
    };
    this.checkInterval = window.setInterval(runCheck, 60000); // 60秒
  }

  private async refreshTrialStatus(): Promise<void> {
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
   * 销毁组件
   */
  destroy(): void {
    this.removeNoticeElement();
    this.stopPeriodicCheck();
    this.removeOwnedStyles();
  }

  /**
   * 手动更新状态
   */
  async refresh(): Promise<void> {
    this.applyStatus(await checkTrialStatus());
  }
}

// 全局实例
let globalTrialNotice: TrialNotice | null = null;

/**
 * 初始化全局试用提醒
 */
export async function initializeTrialNotice(): Promise<void> {
  if (globalTrialNotice) {
    globalTrialNotice.destroy();
  }

  globalTrialNotice = new TrialNotice();
  await globalTrialNotice.initialize();
}

/**
 * 获取全局试用提醒实例
 */
export function getTrialNotice(): TrialNotice | null {
  return globalTrialNotice;
}
