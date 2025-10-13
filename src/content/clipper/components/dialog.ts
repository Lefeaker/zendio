import { getMessages } from '../../../i18n';
import { createCommentForm } from './commentForm';
import { DragController } from '../shared/dragController';
import { InlineStyleManager } from '../shared/styleManager';
import { CLIPPER_DIALOG_STYLES } from '../shared/styles';
import { FocusTrap } from '../shared/focusTrap';

function resolveAssetUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      // fall through to raw path when runtime context is unavailable
    }
  }
  return path;
}

export type ClipperDialogAction = 'clip' | 'cancel' | 'reader';

export interface ClipperDialogResult {
  action: ClipperDialogAction;
  comment: string;
}

type ReaderModeBehavior = 'start' | 'append';

interface ClipperDialogOptions {
  allowReaderMode?: boolean;
  readerModeBehavior?: ReaderModeBehavior;
  initialComment?: string;
}

export class ClipperDialog {
  private static activeDialog: ClipperDialog | null = null;
  private dialog: HTMLDivElement | null = null;
  private resolve: ((result: ClipperDialogResult) => void) | null = null;
  private dragController: DragController | null = null;
  private styleManager: InlineStyleManager | null = null;
  private focusTrap: FocusTrap | null = null;
  private previousActiveElement: HTMLElement | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private content: HTMLDivElement | null = null;
  private currentX = 0;
  private currentY = 0;
  private allowReaderMode = true;
  private readerModeBehavior: ReaderModeBehavior = 'start';
  private initialComment = '';

  async show(selectedText: string, options?: ClipperDialogOptions): Promise<ClipperDialogResult> {
    return new Promise((resolve) => {
      ClipperDialog.activeDialog?.remove();
      ClipperDialog.activeDialog = this;
      this.resolve = resolve;
      this.allowReaderMode = options?.allowReaderMode ?? true;
      this.readerModeBehavior = options?.readerModeBehavior ?? 'start';
      this.initialComment = options?.initialComment ?? '';
      void this.createDialog(selectedText);
    });
  }

  remove(): void {
    if (ClipperDialog.activeDialog === this) {
      ClipperDialog.activeDialog = null;
    }
    this.detachDragHandlers();
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.focusTrap?.deactivate();
    this.focusTrap = null;
    if (this.styleManager) {
      this.styleManager.unmount();
      this.styleManager = null;
    }
    if (this.dialog) {
      this.dialog.remove();
      this.dialog = null;
    }
    this.content = null;
    this.allowReaderMode = true;
    this.readerModeBehavior = 'start';
    this.initialComment = '';
    delete document.documentElement.dataset.aiobClipperDialog;
    if (this.previousActiveElement) {
      const target = this.previousActiveElement;
      this.previousActiveElement = null;
      queueMicrotask(() => target.focus());
    }
  }

  private finalize(result: ClipperDialogResult): void {
    const resolver = this.resolve;
    this.resolve = null;
    resolver?.(result);
    this.remove();
  }

  private async createDialog(selectedText: string): Promise<void> {
    const msgs = await getMessages();
    const existing = document.getElementById('obsidian-clipper-dialog');
    existing?.remove();

    this.dialog = document.createElement('div');
    this.dialog.id = 'obsidian-clipper-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');

    const commentIconUrl = resolveAssetUrl('assets/icontrs/allinob_icon_commentt.png');
    const clipIconUrl = resolveAssetUrl('assets/icontrs/allinob_icon_clipt.png');
    const readingIconUrl = resolveAssetUrl('assets/icontrs/allinob_icon_readingt.png');
    const resolvedStyles = CLIPPER_DIALOG_STYLES
      .replace(/__COMMENT_ICON_URL__/g, commentIconUrl)
      .replace(/__CLIP_ICON_URL__/g, clipIconUrl)
      .replace(/__READING_ICON_URL__/g, readingIconUrl);

    this.styleManager = new InlineStyleManager(document);
    this.styleManager.mount(resolvedStyles);

    this.previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dialogWidth = Math.min(600, viewportWidth * 0.9);
    const dialogHeight = Math.min(viewportHeight * 0.8, 600);
    const initialX = (viewportWidth - dialogWidth) / 2;
    const initialY = (viewportHeight - dialogHeight) / 2;

    const content = document.createElement('div');
    this.currentX = 0;
    this.currentY = 0;
    this.content = content;
    content.className = 'obsidian-clipper-content';
    content.style.left = `${initialX}px`;
    content.style.top = `${initialY}px`;
    content.style.transform = 'translate(0px, 0px)';

    const header = document.createElement('div');
    this.dragController = new DragController({
      handle: header,
      initialPosition: { x: this.currentX, y: this.currentY },
      onMove: ({ x, y }) => {
        this.currentX = x;
        this.currentY = y;
        this.updatePosition();
      }
    });
    this.dragController.attach();
    header.className = 'clipper-dialog-header';

    const title = document.createElement('h2');
    title.className = 'clipper-dialog-title';
    const titleIcon = document.createElement('img');
    titleIcon.src = commentIconUrl;
    titleIcon.alt = '';
    titleIcon.className = 'clipper-dialog-icon';
    const titleLabel = document.createElement('span');
    titleLabel.textContent = msgs.clipDialogTitle;
    title.append(titleIcon, titleLabel);
    title.id = 'obsidian-clipper-title';
    this.dialog.setAttribute('aria-labelledby', title.id);

    const divider = document.createElement('div');
    divider.className = 'clipper-dialog-divider';

    const instructions = document.createElement('p');
    instructions.id = 'clipper-dialog-instructions';
    instructions.className = 'clipper-sr-only';
    instructions.textContent = 'Use Tab to move between controls. Press Alt plus arrow keys to reposition the dialog.';

    const { container: formContainer, textarea } = createCommentForm({
      commentLabel: msgs.commentLabel,
      commentPlaceholder: msgs.commentPlaceholder
    }, selectedText, this.initialComment);

    if (textarea) {
      textarea.setAttribute('aria-label', msgs.commentLabel);
      this.dialog.setAttribute('aria-describedby', textarea.id);
      queueMicrotask(() => textarea.focus());
    }

    if (this.dialog) {
      const describedBy = this.dialog.getAttribute('aria-describedby');
      const ids = describedBy ? describedBy.split(' ').filter(Boolean) : [];
      ids.push(instructions.id);
      this.dialog.setAttribute('aria-describedby', ids.join(' '));
    }

    const actions = document.createElement('div');
    actions.className = 'clipper-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = msgs.cancelButton;
    cancelBtn.className = 'clipper-btn clipper-btn--secondary';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'clipper-btn clipper-btn--primary';
    const confirmContent = document.createElement('span');
    confirmContent.className = 'clipper-btn-content';
    const confirmIcon = document.createElement('img');
    confirmIcon.src = clipIconUrl;
    confirmIcon.alt = '';
    confirmIcon.className = 'clipper-btn-icon';
    const confirmLabel = document.createElement('span');
    confirmLabel.textContent = msgs.clipButton;
    confirmContent.append(confirmIcon, confirmLabel);
    confirmBtn.appendChild(confirmContent);

    cancelBtn.addEventListener('click', () => {
      this.finalize({ action: 'cancel', comment: '' });
    });

    confirmBtn.addEventListener('click', () => {
      this.finalize({ action: 'clip', comment: textarea.value.trim() });
    });

    if (this.allowReaderMode) {
      const readerLabel = this.readerModeBehavior === 'append'
        ? msgs.addToReaderButton
        : msgs.openReaderButton;
      const readerBtn = document.createElement('button');
      readerBtn.className = 'clipper-btn clipper-btn--ghost';
      const readerContent = document.createElement('span');
      readerContent.className = 'clipper-btn-content';
      const readerIcon = document.createElement('img');
      readerIcon.src = readingIconUrl;
      readerIcon.alt = '';
      readerIcon.className = 'clipper-btn-icon';
      const readerLabelEl = document.createElement('span');
      readerLabelEl.textContent = readerLabel;
      readerContent.append(readerIcon, readerLabelEl);
      readerBtn.appendChild(readerContent);
      readerBtn.addEventListener('click', () => {
        this.finalize({ action: 'reader', comment: textarea.value.trim() });
      });
      actions.append(readerBtn);
    }

    actions.append(cancelBtn, confirmBtn);

    header.appendChild(title);
    content.append(header, instructions, divider, formContainer, actions);

    this.dialog.appendChild(content);
    document.body.appendChild(this.dialog);
    document.documentElement.dataset.aiobClipperDialog = 'open';

    this.focusTrap = new FocusTrap(content);
    this.focusTrap.activate();

    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finalize({ action: 'cancel', comment: '' });
        return;
      }

      if (event.altKey) {
        const handled = this.handleKeyboardDrag(event);
        if (handled) {
          event.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private detachDragHandlers(): void {
    this.dragController?.detach();
    this.dragController = null;
  }

  private handleKeyboardDrag(event: KeyboardEvent): boolean {
    if (!this.content) {
      return false;
    }

    const step = event.shiftKey ? 40 : 20;
    let moved = false;

    switch (event.key) {
      case 'ArrowUp':
        this.currentY -= step;
        moved = true;
        break;
      case 'ArrowDown':
        this.currentY += step;
        moved = true;
        break;
      case 'ArrowLeft':
        this.currentX -= step;
        moved = true;
        break;
      case 'ArrowRight':
        this.currentX += step;
        moved = true;
        break;
      default:
        break;
    }

    if (!moved) {
      return false;
    }

    this.updatePosition();
    this.dragController?.setPosition({ x: this.currentX, y: this.currentY });
    return true;
  }

  private updatePosition(): void {
    if (!this.content) {
      return;
    }
    this.content.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
  }
}
