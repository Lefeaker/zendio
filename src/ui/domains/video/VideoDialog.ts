import { ContentDialogHost } from '../../hosts/content/ContentDialogHost';
import { UiButton, createContentButtonElement } from '../../primitives/button';
import { createBadgeElement } from '../../primitives/badge';
import {
  createContentActionRow,
  createContentEmptyState,
  createContentHintText,
  createContentLayoutElement,
  createContentSurfacePanel
} from '../../primitives/layout';
export interface VideoDialogCapture {
  id: string;
  index: number;
  kind: 'timestamp' | 'fragment';
  timeLabel?: string;
  timeSeconds?: number;
  fragmentLabel?: string;
  fragmentUrl?: string;
  shareUrl?: string;
  comment: string;
  commentPreview: string;
  selectionPreview?: string;
}

export interface VideoDialogConfig {
  title: string;
  status: string;
  captures: VideoDialogCapture[];
  texts: {
    hint: string;
    add: string;
    finish: string;
    cancel: string;
    captureNoComment: string;
    captureFocusLabel: string;
    captureEditPlaceholder: string;
    captureSaveLabel: string;
    captureCancelLabel: string;
    captureDeleteLabel: string;
  };
  onClose: () => void;
  onAddCapture: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onDeleteCapture: (id: string) => void;
  onFocusCapture: (id: string) => void;
  onSubmitCaptureEdit: (id: string, comment: string) => Promise<void> | void;
}

export class VideoDialog {
  private dialog: ContentDialogHost;
  private listHost: HTMLElement | null = null;
  private captures: VideoDialogCapture[];
  private expandedId: string | null = null;
  private editingId: string | null = null;
  private editingDraft = '';
  private awaitingSecondEnter = false;
  private enterTimeout: number | null = null;
  private hintEl: HTMLParagraphElement | null = null;
  private statusEl: HTMLParagraphElement | null = null;
  private counterBadgeEl: HTMLSpanElement | null = null;
  private counterText = '0';

  constructor(private config: VideoDialogConfig) {
    this.captures = [...config.captures];
    this.dialog = new ContentDialogHost({
      title: config.title,
      size: 'lg',
      closeOnBackdrop: false,
      closeOnEscape: true,
      onClose: config.onClose
    });
  }

  render(): HTMLElement {
    const content = this.buildContent();
    const footer = this.buildFooter();
    this.dialog.setContent(content);
    this.dialog.setFooter(footer);
    return this.dialog.render();
  }

  updateCaptures(captures: VideoDialogCapture[]): void {
    this.captures = [...captures];
    if (this.editingId && !this.captures.some((capture) => capture.id === this.editingId)) {
      this.cancelEditing();
    }
    if (this.expandedId && !this.captures.some((capture) => capture.id === this.expandedId)) {
      this.expandedId = null;
    }
    this.renderCaptures();
  }

  updateTitle(title: string): void {
    this.dialog.updateConfig({ title });
  }

  setStatusText(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  setHintText(text: string): void {
    if (this.hintEl) {
      this.hintEl.textContent = text;
    }
  }

  setCounterText(text: string): void {
    this.counterText = text;
    if (this.counterBadgeEl) {
      this.counterBadgeEl.textContent = text;
    }
  }

  beginEditingCapture(id: string, draft: string): void {
    const capture = this.captures.find((item) => item.id === id);
    if (!capture) {
      return;
    }
    this.editingId = id;
    this.editingDraft = draft;
    this.expandedId = id;
    this.awaitingSecondEnter = false;
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    this.renderCaptures();
  }

  stopEditing(): void {
    this.cancelEditing();
  }

  clearExpanded(): void {
    if (this.expandedId !== null) {
      this.expandedId = null;
      this.renderCaptures();
    }
  }

  maybeCommitEditing(nextCaptureId: string | null): void {
    if (this.editingId && this.editingId !== nextCaptureId) {
      void this.submitDraft(this.editingId);
    }
    if (this.expandedId && this.expandedId !== nextCaptureId) {
      this.expandedId = null;
      this.renderCaptures();
    }
  }

  show(): void {
    this.dialog.show();
  }

  destroy(): void {
    this.cancelEditing();
    this.dialog.destroy();
  }

  private buildContent(): HTMLElement {
    const container = createContentLayoutElement({
      className: 'space-y-4 video-dialog-content'
    });

    this.statusEl = createContentHintText({
      className: 'text-xs text-base-content/50'
    });
    this.statusEl.textContent = this.config.status;
    container.append(this.statusEl);

    const summary = createContentActionRow({
      className: 'flex flex-wrap items-center justify-between gap-3'
    });
    const actions = createContentActionRow();
    new UiButton(actions).render({
      label: this.config.texts.add,
      variant: 'secondary',
      size: 'sm',
      dataRole: 'add-btn',
      onClick: this.config.onAddCapture
    });
    summary.append(actions);
    container.append(summary);

    this.hintEl = createContentHintText();
    this.hintEl.textContent = this.config.texts.hint;
    container.append(this.hintEl);

    this.listHost = createContentLayoutElement({
      className: 'video-dialog-list min-h-[120px]'
    });
    container.append(this.listHost);
    this.renderCaptures();

    return container;
  }

  private buildFooter(): HTMLElement {
    const footer = createContentActionRow({
      className: 'flex items-center justify-between gap-4'
    });
    const badgeHost = createContentLayoutElement();
    const badge = createBadgeElement({
      label: this.counterText,
      variant: 'info',
      dataRole: 'badge'
    });
    badgeHost.append(badge);

    const actions = createContentActionRow();
    new UiButton(actions).render({
      label: this.config.texts.finish,
      variant: 'primary',
      dataRole: 'finish-btn',
      onClick: this.config.onFinish
    });
    new UiButton(actions).render({
      label: this.config.texts.cancel,
      variant: 'ghost',
      dataRole: 'close-btn',
      onClick: this.config.onCancel
    });

    footer.append(badgeHost, actions);
    this.counterBadgeEl = badge;
    return footer;
  }

  private renderCaptures(): void {
    if (!this.listHost) {
      return;
    }
    this.listHost.innerHTML = '';
    if (!this.captures.length) {
      const empty = createContentEmptyState('暂无记录，点击添加后即可保存时间点或片段。');
      this.listHost.append(empty);
      return;
    }

    const list = createContentLayoutElement({
      className: 'video-dialog-capture-list divide-y divide-base-300'
    });
    for (const capture of this.captures) {
      list.append(this.buildCaptureItem(capture));
    }
    this.listHost.append(list);
    this.focusEditingTextarea();
  }

  private buildCaptureItem(capture: VideoDialogCapture): HTMLElement {
    const item = document.createElement('article');
    item.dataset.role = 'capture-item';
    item.dataset.captureId = capture.id;
    item.className = 'py-3 flex flex-col gap-3';

    const header = document.createElement('div');
    header.className = 'flex items-start gap-4';

    const indexBtn = createContentButtonElement({
      label: String(capture.index),
      variant: 'ghost',
      size: 'xs',
      ariaLabel: this.config.texts.captureFocusLabel.replace('{index}', String(capture.index)),
      className: 'btn-circle',
      onClick: () => this.config.onFocusCapture(capture.id)
    });
    header.append(indexBtn);

    const summary = document.createElement(capture.kind === 'fragment' ? 'p' : 'span');
    summary.className = 'text-sm text-base-content flex-1 cursor-pointer line-clamp-3';
    const isExpanded = this.expandedId === capture.id;
    if (capture.kind === 'fragment') {
      const fullText = capture.selectionPreview ?? capture.fragmentLabel ?? '';
      const previewText = capture.fragmentLabel ?? fullText;
      summary.textContent = isExpanded ? fullText : previewText;
    } else {
      summary.textContent = capture.timeLabel ?? '';
    }
    if (isExpanded) {
      summary.classList.remove('line-clamp-3');
    }
    summary.dataset.role = 'capture-summary';
    summary.setAttribute('role', 'button');
    summary.tabIndex = 0;
    const toggleExpand = (): void => {
      this.expandedId = isExpanded ? null : capture.id;
      this.renderCaptures();
      if (!isExpanded) {
        this.config.onFocusCapture(capture.id);
      }
    };
    summary.addEventListener('click', toggleExpand);
    summary.addEventListener('keydown', (event: Event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleExpand();
      }
    });
    header.append(summary);

    const removeBtn = createContentButtonElement({
      label: '✕',
      variant: 'ghost',
      size: 'xs',
      ariaLabel: this.config.texts.captureDeleteLabel,
      dataRole: 'capture-remove-btn',
      onClick: () => this.config.onDeleteCapture(capture.id)
    });
    header.append(removeBtn);
    item.append(header);

    const body = createContentLayoutElement({ className: 'mt-2' });
    if (this.editingId === capture.id) {
      body.append(this.renderEditor(capture));
    } else {
      const commentRow = createContentSurfacePanel({
        className: 'cursor-pointer rounded-lg bg-base-200/50 p-3 text-xs text-base-content/70'
      });
      commentRow.dataset.role = 'capture-comment';
      commentRow.textContent = capture.commentPreview || this.config.texts.captureNoComment;
      commentRow.tabIndex = 0;
      const activate = (): void => {
        this.config.onFocusCapture(capture.id);
        this.beginEditingCapture(capture.id, capture.comment);
      };
      commentRow.addEventListener('click', activate);
      commentRow.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
      body.append(commentRow);
    }
    item.append(body);

    const meta = document.createElement('div');
    meta.className = 'flex items-center justify-between text-xs text-base-content/50';
    meta.textContent =
      capture.kind === 'timestamp' ? (capture.shareUrl ?? '') : (capture.fragmentUrl ?? '');
    item.append(meta);
    return item;
  }

  private renderEditor(capture: VideoDialogCapture): HTMLElement {
    const editor = createContentLayoutElement({ className: 'flex flex-col gap-2' });

    const textarea = document.createElement('textarea');
    textarea.className =
      'textarea textarea-bordered textarea-sm w-full min-h-[90px] leading-relaxed';
    textarea.dataset.role = 'capture-editor';
    textarea.value = this.editingDraft;
    textarea.placeholder = this.config.texts.captureEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event) => this.handleTextareaKeydown(event, capture.id));
    editor.append(textarea);

    const actions = createContentActionRow({ className: 'flex justify-end gap-2' });
    new UiButton(actions).render({
      label: this.config.texts.captureCancelLabel,
      variant: 'ghost',
      size: 'sm',
      dataRole: 'capture-cancel-btn',
      onClick: () => this.cancelEditing()
    });
    new UiButton(actions).render({
      label: this.config.texts.captureSaveLabel,
      variant: 'primary',
      size: 'sm',
      dataRole: 'capture-save-btn',
      onClick: () => void this.submitDraft(capture.id)
    });
    editor.append(actions);
    return editor;
  }

  private focusEditingTextarea(): void {
    if (!this.editingId || !this.listHost) {
      return;
    }
    requestAnimationFrame(() => {
      const textarea = this.listHost?.querySelector<HTMLTextAreaElement>(
        `[data-capture-id="${this.editingId}"] textarea`
      );
      if (textarea) {
        const length = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(length, length);
      }
    });
  }

  private handleTextareaKeydown(event: KeyboardEvent, captureId: string): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditing();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      this.awaitingSecondEnter = false;
      if (this.enterTimeout !== null) {
        window.clearTimeout(this.enterTimeout);
        this.enterTimeout = null;
      }
      return;
    }

    if (!this.awaitingSecondEnter) {
      this.awaitingSecondEnter = true;
      if (this.enterTimeout !== null) {
        window.clearTimeout(this.enterTimeout);
      }
      this.enterTimeout = window.setTimeout(() => {
        this.awaitingSecondEnter = false;
        this.enterTimeout = null;
      }, 600);
      return;
    }

    event.preventDefault();
    this.awaitingSecondEnter = false;
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    void this.submitDraft(captureId);
  }

  private async submitDraft(id: string): Promise<void> {
    if (!this.editingId || this.editingId !== id) {
      return;
    }
    const capture = this.captures.find((item) => item.id === id);
    if (!capture) {
      this.cancelEditing();
      return;
    }
    const trimmed = this.editingDraft.trim();
    if (trimmed === capture.comment.trim()) {
      this.cancelEditing();
      return;
    }
    try {
      await this.config.onSubmitCaptureEdit(id, this.editingDraft);
      this.cancelEditing();
    } catch {
      // keep editor open on failure
    }
  }

  private cancelEditing(): void {
    this.editingId = null;
    this.editingDraft = '';
    this.awaitingSecondEnter = false;
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    this.renderCaptures();
  }
}
