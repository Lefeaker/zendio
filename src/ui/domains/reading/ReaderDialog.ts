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

// ===== ReaderDialog 设计 =====
export interface ReaderDialogHighlight {
  id: string;
  index: number;
  excerpt: string;
  fullText: string;
  commentPreview?: string;
  comment?: string;
  timestamp: number;
}

export interface ReaderDialogConfig {
  title: string;
  subtitle?: string;
  highlights: ReaderDialogHighlight[];
  emptyHint?: string;
  texts: {
    hint: string;
    finish: string;
    cancel: string;
    highlightNoComment: string;
    highlightFocusLabel: string;
    highlightEditPlaceholder: string;
    highlightSaveLabel: string;
    highlightCancelLabel: string;
  };
  onExport: () => void;
  onClose: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onDeleteHighlight: (id: string) => void;
  onFocusHighlight: (id: string) => void;
  onSubmitHighlightEdit: (id: string, comment: string) => Promise<void> | void;
}

export class ReaderDialog {
  private dialog: ContentDialogHost;
  private listHost: HTMLElement | null = null;
  private highlights: ReaderDialogHighlight[];
  private expandedId: string | null = null;
  private editingId: string | null = null;
  private editingDraft = '';
  private awaitingSecondEnter = false;
  private enterTimeout: number | null = null;
  private hintEl: HTMLParagraphElement | null = null;
  private counterBadgeEl: HTMLSpanElement | null = null;
  private counterText = '0';

  constructor(private config: ReaderDialogConfig) {
    this.highlights = [...config.highlights];
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

  updateHighlights(highlights: ReaderDialogHighlight[]): void {
    this.highlights = [...highlights];
    this.renderHighlights();
  }

  setCounterText(text: string): void {
    this.counterText = text;
    if (this.counterBadgeEl) {
      this.counterBadgeEl.textContent = text;
    }
  }

  setHintText(text: string): void {
    if (this.hintEl) {
      this.hintEl.textContent = text;
    }
  }

  isEditing(): boolean {
    return this.editingId !== null;
  }

  stopEditing(): void {
    this.cancelEditing();
  }

  updateTitle(title: string): void {
    this.dialog.updateConfig({ title });
  }

  show(): void {
    this.dialog.show();
  }

  hide(): void {
    this.dialog.hide();
  }

  destroy(): void {
    this.cancelEditing();
    this.dialog.destroy();
  }

  private buildContent(): HTMLElement {
    const container = createContentLayoutElement({
      className: 'space-y-4 reader-dialog-content'
    });
    this.hintEl = createContentHintText();
    this.hintEl.textContent = this.config.texts.hint;
    container.append(this.hintEl);

    this.listHost = createContentLayoutElement({
      className: 'reader-dialog-list min-h-[120px]'
    });
    container.append(this.listHost);
    this.renderHighlights();

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
      dataRole: 'export-btn',
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

  private renderHighlights(): void {
    if (!this.listHost) {
      return;
    }
    this.listHost.innerHTML = '';
    if (!this.highlights.length) {
      const empty = createContentEmptyState(
        this.config.emptyHint ?? '暂无高亮，选中文本即可开始记录。'
      );
      this.listHost.append(empty);
      return;
    }
    const list = createContentLayoutElement({
      className: 'reader-dialog-highlight-list divide-y divide-base-300'
    });
    for (const highlight of this.highlights) {
      list.append(this.buildHighlightItem(highlight));
    }
    this.listHost.append(list);
  }

  private buildHighlightItem(highlight: ReaderDialogHighlight): HTMLElement {
    const item = document.createElement('article');
    item.dataset.role = 'highlight-item';
    item.dataset.highlightId = highlight.id;
    item.className = 'py-3 flex flex-col gap-3';

    const header = document.createElement('div');
    header.className = 'flex items-start gap-4';

    const indexBtn = createContentButtonElement({
      label: String(highlight.index),
      variant: 'ghost',
      size: 'xs',
      ariaLabel: this.config.texts.highlightFocusLabel.replace('{index}', String(highlight.index)),
      className: 'btn-circle',
      onClick: () => this.config.onFocusHighlight(highlight.id)
    });
    header.append(indexBtn);

    const excerpt = document.createElement('p');
    excerpt.className = 'text-sm text-base-content flex-1 cursor-pointer line-clamp-3';
    const isExpanded = this.expandedId === highlight.id;
    excerpt.textContent = isExpanded ? highlight.fullText : highlight.excerpt;
    if (isExpanded) {
      excerpt.classList.remove('line-clamp-3');
    }
    excerpt.addEventListener('click', () => {
      this.expandedId = isExpanded ? null : highlight.id;
      this.renderHighlights();
    });
    header.append(excerpt);

    const removeBtn = createContentButtonElement({
      label: '✕',
      variant: 'ghost',
      size: 'xs',
      ariaLabel: this.config.texts.highlightCancelLabel,
      onClick: () => this.config.onDeleteHighlight(highlight.id)
    });
    header.append(removeBtn);
    item.append(header);

    const body = createContentLayoutElement({ className: 'mt-2' });
    if (this.editingId === highlight.id) {
      body.append(this.renderEditor(highlight));
    } else {
      const commentRow = createContentSurfacePanel({
        className: 'cursor-pointer rounded-lg bg-base-200/50 p-3 text-xs text-base-content/70'
      });
      const text = highlight.commentPreview || this.config.texts.highlightNoComment;
      commentRow.textContent = text;
      commentRow.tabIndex = 0;
      const handleActivate = (): void => {
        this.enterEditMode(highlight);
      };
      commentRow.addEventListener('click', handleActivate);
      commentRow.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleActivate();
        }
      });
      body.append(commentRow);
    }
    item.append(body);

    const meta = document.createElement('div');
    meta.className = 'flex items-center justify-between text-xs text-base-content/50';
    const timestamp = new Date(highlight.timestamp).toLocaleString();
    meta.textContent = timestamp;
    item.append(meta);
    return item;
  }

  private renderEditor(highlight: ReaderDialogHighlight): HTMLElement {
    const editor = createContentLayoutElement({ className: 'flex flex-col gap-2' });

    const textarea = document.createElement('textarea');
    textarea.className =
      'textarea textarea-bordered textarea-sm w-full min-h-[90px] leading-relaxed';
    textarea.value = this.editingDraft;
    textarea.placeholder = this.config.texts.highlightEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event) =>
      this.handleTextareaKeydown(event, highlight.id)
    );
    editor.append(textarea);

    const actions = createContentActionRow({ className: 'flex justify-end gap-2' });
    new UiButton(actions).render({
      label: this.config.texts.highlightCancelLabel,
      variant: 'ghost',
      size: 'sm',
      onClick: () => this.cancelEditing()
    });
    new UiButton(actions).render({
      label: this.config.texts.highlightSaveLabel,
      variant: 'primary',
      size: 'sm',
      onClick: () => void this.submitDraft(highlight.id)
    });
    editor.append(actions);
    return editor;
  }

  private enterEditMode(highlight: ReaderDialogHighlight): void {
    if (this.editingId === highlight.id) {
      return;
    }
    this.editingId = highlight.id;
    this.editingDraft = highlight.comment ?? '';
    this.awaitingSecondEnter = false;
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    this.renderHighlights();
  }

  private cancelEditing(): void {
    this.editingId = null;
    this.editingDraft = '';
    this.awaitingSecondEnter = false;
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    this.renderHighlights();
  }

  private async submitDraft(id: string): Promise<void> {
    if (!this.editingId || this.editingId !== id) {
      return;
    }
    const highlight = this.highlights.find((item) => item.id === id);
    if (!highlight) {
      this.cancelEditing();
      return;
    }
    const trimmed = this.editingDraft.trim();
    if (trimmed === (highlight.comment ?? '').trim()) {
      this.cancelEditing();
      return;
    }
    await this.config.onSubmitHighlightEdit(id, this.editingDraft);
    this.cancelEditing();
  }

  private handleTextareaKeydown(event: KeyboardEvent, highlightId: string): void {
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
    void this.submitDraft(highlightId);
  }
}
