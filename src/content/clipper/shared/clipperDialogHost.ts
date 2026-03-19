/**
 * 剪藏对话框宿主
 * 管理内容脚本中的对话框实例和依赖注入
 */

import {
  createScopedRegistry,
  type ScopedServiceRegistry,
  type ServiceRegistry
} from '@shared/di/serviceRegistry';
import { TOKENS } from '@shared/di/tokens';
import { createDialogRegistry, type DialogRegistry } from './dialogRegistry';
import { ClipperDialog, type ClipperDialogOptions, type ClipperDialogResult } from '../components/dialog';
import { createClipperDialog } from '../components/dialogFactory';

export class ClipperDialogHost {
  private scopedRegistry: ScopedServiceRegistry;
  private dialogRegistry: DialogRegistry;
  private isDisposed = false;

  constructor(parentRegistry?: ServiceRegistry) {
    this.scopedRegistry = createScopedRegistry(parentRegistry);
    this.dialogRegistry = createDialogRegistry();
    
    // 注册对话框注册表到作用域
    this.scopedRegistry.register(TOKENS.dialogRegistry, () => this.dialogRegistry);
    
    // 监听页面卸载事件，自动清理
    this.setupCleanupListeners();
  }

  /**
   * 显示剪藏对话框
   */
  async showDialog(selectedText: string, options?: Omit<ClipperDialogOptions, 'dialogRegistry'>): Promise<ClipperDialogResult> {
    if (this.isDisposed) {
      throw new Error('[ClipperDialogHost] Host has been disposed');
    }

    const dialog = createClipperDialog();
    
    const dialogOptions: ClipperDialogOptions = {
      ...options,
      dialogRegistry: this.dialogRegistry
    };

    return dialog.show(selectedText, dialogOptions);
  }

  /**
   * 关闭所有活动对话框
   */
  closeAllDialogs(): void {
    if (!this.isDisposed) {
      this.dialogRegistry.closeAll();
    }
  }

  /**
   * 获取当前活动的对话框
   */
  getActiveDialog(): ClipperDialog | null {
    if (this.isDisposed) {
      return null;
    }
    // DialogRegistry.getActive() 返回 unknown 类型以保持灵活性
    // 这里我们知道实际类型是 ClipperDialog，所以可以安全地进行类型断言
    return this.dialogRegistry.getActive() as ClipperDialog | null;
  }

  /**
   * 释放宿主资源
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    // 关闭所有对话框
    this.dialogRegistry.dispose();
    
    // 清理作用域注册表
    this.scopedRegistry.disposeScope();
    
    // 移除事件监听器
    this.removeCleanupListeners();
  }

  /**
   * 检查宿主是否已释放
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  private setupCleanupListeners(): void {
    // 页面卸载时自动清理
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    
    // 页面隐藏时关闭对话框（但不释放宿主）
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private removeCleanupListeners(): void {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleBeforeUnload = (): void => {
    this.dispose();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.closeAllDialogs();
    }
  };
}

/**
 * 全局对话框宿主实例
 * 在内容脚本中使用，确保页面级别的对话框管理
 */
let globalDialogHost: ClipperDialogHost | null = null;

/**
 * 获取全局对话框宿主
 * 如果不存在则创建新实例
 */
export function getGlobalDialogHost(): ClipperDialogHost {
  if (!globalDialogHost || globalDialogHost.disposed) {
    globalDialogHost = new ClipperDialogHost();
  }
  return globalDialogHost;
}

/**
 * 重置全局对话框宿主
 * 主要用于测试或页面重新加载
 */
export function resetGlobalDialogHost(): void {
  if (globalDialogHost) {
    globalDialogHost.dispose();
    globalDialogHost = null;
  }
}

/**
 * 便捷函数：显示剪藏对话框
 */
export async function showClipperDialog(
  selectedText: string, 
  options?: Omit<ClipperDialogOptions, 'dialogRegistry'>
): Promise<ClipperDialogResult> {
  const host = getGlobalDialogHost();
  return host.showDialog(selectedText, options);
}
