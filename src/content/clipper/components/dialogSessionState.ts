import type { ReaderModeBehavior } from './dialogTypes';

export interface DialogSessionOptions {
  allowReaderMode?: boolean;
  readerModeBehavior?: ReaderModeBehavior;
  allowVideoMode?: boolean;
  initialComment?: string;
}

export class DialogSessionState {
  allowReaderMode = true;
  allowVideoMode = false;
  readerModeBehavior: ReaderModeBehavior = 'start';
  initialComment = '';
  inReaderMode = false;
  keyboardShortcutsEnabled = true;
  shortcutsTemporarilyActivated = false;
  shortcutUsageCount = 0;
  awaitingSecondEnter = false;
  doubleEnterTimer: number | null = null;

  applyOptions(options?: DialogSessionOptions): void {
    this.allowReaderMode = options?.allowReaderMode ?? true;
    this.readerModeBehavior = options?.readerModeBehavior ?? 'start';
    this.allowVideoMode = options?.allowVideoMode ?? false;
    this.initialComment = options?.initialComment ?? '';
  }

  beginPendingEnter(timeoutMs: number, onTimeout: () => void, view: Window = window): void {
    this.awaitingSecondEnter = true;
    this.doubleEnterTimer = view.setTimeout(() => {
      this.resetPendingEnter(view);
      onTimeout();
    }, timeoutMs);
  }

  resetPendingEnter(view: Window = window): void {
    this.awaitingSecondEnter = false;
    if (this.doubleEnterTimer !== null) {
      view.clearTimeout(this.doubleEnterTimer);
      this.doubleEnterTimer = null;
    }
  }
}
