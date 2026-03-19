/**
 * 对话框注册表
 * 管理内容脚本中的活动对话框实例
 */

// 对话框实例的基础类型
// 使用泛型来保持类型灵活性，同时避免 any
type DialogInstance = {
  remove?: () => void;
} & object;

export interface DialogRegistry {
  /**
   * 注册活动对话框
   * @param dialog 对话框实例
   * @returns 取消注册的函数
   */
  register(dialog: DialogInstance): () => void;

  /**
   * 获取当前活动的对话框
   * 返回类型为 unknown 以支持不同类型的对话框
   */
  getActive(): unknown;

  /**
   * 关闭所有活动对话框
   */
  closeAll(): void;

  /**
   * 清理注册表
   */
  dispose(): void;
}

export class DefaultDialogRegistry implements DialogRegistry {
  private activeDialog: DialogInstance | null = null;

  register(dialog: DialogInstance): () => void {
    // 关闭之前的对话框
    if (this.activeDialog && this.activeDialog !== dialog) {
      try {
        this.activeDialog.remove?.();
      } catch (error) {
        console.warn('[DialogRegistry] Error removing previous dialog:', error);
      }
    }

    this.activeDialog = dialog;

    return () => {
      if (this.activeDialog === dialog) {
        this.activeDialog = null;
      }
    };
  }

  getActive(): unknown {
    return this.activeDialog;
  }

  closeAll(): void {
    if (this.activeDialog) {
      try {
        this.activeDialog.remove?.();
      } catch (error) {
        console.warn('[DialogRegistry] Error closing dialog:', error);
      }
      this.activeDialog = null;
    }
  }

  dispose(): void {
    this.closeAll();
  }
}

/**
 * 创建对话框注册表实例
 */
export function createDialogRegistry(): DialogRegistry {
  return new DefaultDialogRegistry();
}
