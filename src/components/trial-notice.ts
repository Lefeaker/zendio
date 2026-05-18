/**
 * 试用版本提醒组件
 * 在用户界面中显示试用状态和过期提醒
 */

import { checkTrialStatus, formatRemainingTime, type TrialStatus } from '../utils/trial-manager.js';

export class TrialNotice {
  private container: HTMLElement | null = null;
  private status: TrialStatus | null = null;
  private checkInterval: number | null = null;

  /**
   * 初始化试用提醒组件
   */
  async initialize(): Promise<void> {
    this.status = await checkTrialStatus();

    if (this.status.isTrial) {
      this.createNoticeElement();
      this.startPeriodicCheck();
    }
  }

  /**
   * 创建提醒元素
   */
  private createNoticeElement(): void {
    if (!this.status || !this.status.isTrial) {
      return;
    }

    // 创建容器
    this.container = document.createElement('div');
    this.container.className = 'trial-notice';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${this.status.isExpired ? '#ff4757' : this.status.isExpiringSoon ? '#ffa502' : '#3742fa'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      max-width: 300px;
      cursor: pointer;
      transition: all 0.3s ease;
    `;

    // 添加悬停效果
    this.container.addEventListener('mouseenter', () => {
      if (this.container) {
        this.container.style.transform = 'translateY(-2px)';
        this.container.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (this.container) {
        this.container.style.transform = 'translateY(0)';
        this.container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
      }
    });

    // 设置内容
    this.updateNoticeContent();

    // 添加点击事件
    this.container.addEventListener('click', () => {
      this.showDetailedInfo();
    });

    // 添加到页面
    document.body.appendChild(this.container);

    // 如果已过期，添加闪烁效果
    if (this.status.isExpired) {
      this.addBlinkEffect();
    }
  }

  /**
   * 更新提醒内容
   */
  private updateNoticeContent(): void {
    if (!this.container || !this.status) {
      return;
    }

    const timeStr = formatRemainingTime(this.status);

    if (this.status.isExpired) {
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>⚠️</span>
          <div>
            <div style="font-weight: bold;">试用版已过期</div>
            <div style="font-size: 12px; opacity: 0.9;">点击查看详情</div>
          </div>
        </div>
      `;
    } else if (this.status.isExpiringSoon) {
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>⏰</span>
          <div>
            <div style="font-weight: bold;">试用版即将过期</div>
            <div style="font-size: 12px; opacity: 0.9;">${timeStr}</div>
          </div>
        </div>
      `;
    } else {
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>🔄</span>
          <div>
            <div style="font-weight: bold;">试用版</div>
            <div style="font-size: 12px; opacity: 0.9;">${timeStr}</div>
          </div>
        </div>
      `;
    }
  }

  /**
   * 添加闪烁效果
   */
  private addBlinkEffect(): void {
    if (!this.container) {
      return;
    }

    const keyframes = `
      @keyframes trial-blink {
        0%, 50% { opacity: 1; }
        25%, 75% { opacity: 0.7; }
      }
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = keyframes;
    document.head.appendChild(style);

    this.container.style.animation = 'trial-blink 2s infinite';
  }

  /**
   * 显示详细信息弹窗
   */
  private showDetailedInfo(): void {
    if (!this.status) {
      return;
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;

    const timeStr = formatRemainingTime(this.status);
    const expirationStr = this.status.expirationDate
      ? this.status.expirationDate.toLocaleString('zh-CN')
      : '未知';

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; color: #333;">
          ${this.status.isExpired ? '⚠️ 试用版已过期' : '🔄 试用版信息'}
        </h3>
        <div style="color: #666; line-height: 1.6;">
          <p><strong>状态:</strong> ${timeStr}</p>
          <p><strong>过期时间:</strong> ${expirationStr}</p>
          ${
            this.status.isExpired
              ? '<p style="color: #ff4757;"><strong>功能已被限制，请联系开发者获取正式版本。</strong></p>'
              : '<p style="color: #2ed573;">扩展功能正常可用。</p>'
          }
        </div>
      </div>
      <div style="text-align: center;">
        <button id="trial-close-btn" style="
          background: #3742fa;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">确定</button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // 关闭按钮事件
    const closeBtn = content.querySelector('#trial-close-btn');
    const closeModal = () => {
      document.body.removeChild(modal);
    };

    closeBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  /**
   * 开始定期检查
   */
  private startPeriodicCheck(): void {
    const runCheck = (): void => {
      void this.refreshTrialStatus();
    };
    this.checkInterval = window.setInterval(runCheck, 60000); // 60秒
  }

  private async refreshTrialStatus(): Promise<void> {
    const newStatus = await checkTrialStatus();
    const previousStatus = this.status;

    if (
      previousStatus &&
      (newStatus.isExpired !== previousStatus.isExpired ||
        newStatus.remainingHours !== previousStatus.remainingHours)
    ) {
      this.status = newStatus;
      this.updateNoticeContent();

      // 如果刚刚过期，添加闪烁效果
      if (!previousStatus.isExpired && newStatus.isExpired) {
        this.addBlinkEffect();
      }
    }
  }

  /**
   * 销毁组件
   */
  destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * 手动更新状态
   */
  async refresh(): Promise<void> {
    this.status = await checkTrialStatus();
    this.updateNoticeContent();
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
