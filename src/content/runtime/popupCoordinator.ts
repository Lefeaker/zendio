export type ContentPopupHandle = {
  close?: () => void;
  hide?: () => void;
  remove?: () => void;
  destroy?: () => void;
  popupLifecycle?: {
    preserveOnTransientClose?: boolean;
    kind?: 'session-panel' | 'transient-popup';
  };
} & object;

export interface PopupCoordinator {
  register(popup: ContentPopupHandle): () => void;
  getActive(): unknown;
  closeAll(): void;
  closeTransient(): void;
  dispose(): void;
}

function closePopup(popup: ContentPopupHandle): void {
  if (typeof popup.close === 'function') {
    popup.close();
    return;
  }
  if (typeof popup.hide === 'function') {
    popup.hide();
    return;
  }
  if (typeof popup.remove === 'function') {
    popup.remove();
    return;
  }
  if (typeof popup.destroy === 'function') {
    popup.destroy();
  }
}

function shouldPreserveOnTransientClose(popup: ContentPopupHandle): boolean {
  return (
    popup.popupLifecycle?.preserveOnTransientClose === true &&
    popup.popupLifecycle.kind === 'session-panel'
  );
}

export class DefaultPopupCoordinator implements PopupCoordinator {
  private readonly activePopups: ContentPopupHandle[] = [];

  register(popup: ContentPopupHandle): () => void {
    if (!this.activePopups.includes(popup)) {
      this.activePopups.push(popup);
    }

    return () => {
      const index = this.activePopups.indexOf(popup);
      if (index >= 0) {
        this.activePopups.splice(index, 1);
      }
    };
  }

  getActive(): unknown {
    return this.activePopups.at(-1) ?? null;
  }

  closeAll(): void {
    const pending = [...this.activePopups];
    this.activePopups.length = 0;
    for (const popup of pending.reverse()) {
      try {
        closePopup(popup);
      } catch (error) {
        console.warn('[PopupCoordinator] Error closing popup:', error);
      }
    }
  }

  closeTransient(): void {
    const pending = [...this.activePopups].reverse();
    for (const popup of pending) {
      if (shouldPreserveOnTransientClose(popup)) {
        continue;
      }

      const index = this.activePopups.lastIndexOf(popup);
      if (index >= 0) {
        this.activePopups.splice(index, 1);
      }

      try {
        closePopup(popup);
      } catch (error) {
        console.warn('[PopupCoordinator] Error closing popup:', error);
      }
    }
  }

  dispose(): void {
    this.closeAll();
  }
}

export function createPopupCoordinator(): PopupCoordinator {
  return new DefaultPopupCoordinator();
}
