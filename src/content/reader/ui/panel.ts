import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';

export class ReaderPanel {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private panelContainer: HTMLDivElement;
  private counterEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private highlightList: HTMLDivElement;
  private highlights: ReaderPanelHighlight[] = [];
  private editingHighlightId: string | null = null;
  private editingDraft = '';
  private expandedHighlightId: string | null = null;
  private awaitingSecondEnter = false;
  private enterSubmissionTimeout: number | null = null;
  private documentPointerDownHandler: (event: PointerEvent) => void;
  private renderFrame: number | null = null;

  constructor(private callbacks: ReaderPanelCallbacks, private texts: ReaderPanelTexts) {
    this.root = document.createElement('div');
    this.root.id = 'aiob-reader-root';
    this.root.setAttribute('role', 'region');

    this.card = document.createElement('div');
    this.card.id = 'aiob-reader-card';

    this.highlightList = document.createElement('div');
    this.highlightList.id = 'aiob-reader-highlights';
    this.highlightList.className = 'aiob-reader-highlights';
    this.highlightList.setAttribute('role', 'list');
    this.highlightList.setAttribute('hidden', 'true');

    this.panelContainer = document.createElement('div');
    this.panelContainer.id = 'aiob-reader-panel';
    this.panelContainer.setAttribute('role', 'region');

    const header = document.createElement('header');

    const title = document.createElement('h3');
    const titleIcon = document.createElement('img');
    titleIcon.src = chrome.runtime.getURL('assets/icontrs/allinob_icon_readingt.png');
    titleIcon.alt = '';
    titleIcon.className = 'aiob-reader-icon';
    const titleLabel = document.createElement('span');
    titleLabel.textContent = texts.title;
    title.append(titleIcon, titleLabel);

    const status = document.createElement('span');
    status.className = 'aiob-reader-status';
    status.textContent = this.texts.status;

    header.append(title, status);

    this.counterEl = document.createElement('div');
    this.counterEl.className = 'aiob-reader-counter';
    this.counterEl.textContent = texts.counterZero;

    const footer = document.createElement('footer');

    const finishBtn = document.createElement('button');
    finishBtn.type = 'button';
    finishBtn.className = 'aiob-reader-finish';
    finishBtn.textContent = texts.finish;
    finishBtn.addEventListener('click', () => this.callbacks.onFinish());

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'aiob-reader-cancel';
    cancelBtn.textContent = texts.cancel;
    cancelBtn.addEventListener('click', () => this.callbacks.onCancel());

    footer.append(finishBtn, cancelBtn);

    this.hintEl = document.createElement('div');
   this.hintEl.className = 'aiob-reader-hint';
   this.hintEl.textContent = texts.hint;
    this.panelContainer.append(header, this.counterEl, footer, this.hintEl);

    this.card.append(this.highlightList, this.panelContainer);
    this.root.appendChild(this.card);
    document.body.appendChild(this.root);

    this.documentPointerDownHandler = (event: PointerEvent) => {
      this.onDocumentPointerDown(event);
    };
    document.addEventListener('pointerdown', this.documentPointerDownHandler);
  }

  get element(): HTMLDivElement {
    return this.root;
  }

  updateCount(count: number): void {
    if (count <= 0) {
      this.counterEl.textContent = this.texts.counterZero;
      return;
    }
    this.counterEl.textContent = this.texts.counter.replace('{count}', String(count));
  }

  updateHint(text: string): void {
    this.hintEl.textContent = text;
  }

  setHighlights(highlights: ReaderPanelHighlight[]): void {
    this.highlights = highlights;
    if (this.editingHighlightId && !this.highlights.some(highlight => highlight.id === this.editingHighlightId)) {
      this.editingHighlightId = null;
      this.editingDraft = '';
    }
    if (this.expandedHighlightId && !this.highlights.some(highlight => highlight.id === this.expandedHighlightId)) {
      this.expandedHighlightId = null;
    }
    this.renderHighlights();
  }

  stopEditing(): void {
    if (!this.editingHighlightId) {
      return;
    }
    this.editingHighlightId = null;
    this.editingDraft = '';
    this.expandedHighlightId = null;
    this.awaitingSecondEnter = false;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    this.renderHighlights();
  }

  isEditing(): boolean {
    return this.editingHighlightId !== null;
  }

  private renderHighlights(): void {
    this.highlightList.innerHTML = '';
    if (!this.highlights.length) {
      this.highlightList.setAttribute('hidden', 'true');
      this.highlightList.classList.add('aiob-reader-highlights--empty');
      return;
    }

    this.highlightList.removeAttribute('hidden');
    this.highlightList.classList.remove('aiob-reader-highlights--empty');

    for (const highlight of this.highlights) {
      const item = document.createElement('article');
      item.className = 'aiob-reader-highlight-item';
      item.dataset.highlightId = highlight.id;
      item.setAttribute('role', 'listitem');
      const isExpanded = highlight.id === this.expandedHighlightId;
      if (isExpanded) {
        item.classList.add('aiob-reader-highlight-item--expanded');
      }

      const header = document.createElement('div');
      header.className = 'aiob-reader-highlight-item__header';

      const indexBadge = document.createElement('button');
      indexBadge.type = 'button';
      indexBadge.className = 'aiob-reader-highlight-item__index';
      indexBadge.textContent = String(highlight.index);
      const focusLabel = this.texts.highlightFocusLabel.replace('{index}', String(highlight.index));
      indexBadge.setAttribute('aria-label', focusLabel);
      indexBadge.title = focusLabel;
      indexBadge.addEventListener('click', () => this.callbacks.onFocusHighlight(highlight.id));

      const excerpt = document.createElement('p');
      excerpt.className = 'aiob-reader-highlight-item__excerpt';
      excerpt.textContent = isExpanded ? highlight.fullText : highlight.excerpt;
      excerpt.addEventListener('click', () => {
        this.expandHighlight(highlight.id);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'aiob-reader-highlight-item__remove';
      removeBtn.setAttribute('aria-label', this.texts.highlightDeleteLabel);
      removeBtn.title = this.texts.highlightDeleteLabel;
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => this.callbacks.onDeleteHighlight(highlight.id));

      header.append(indexBadge, excerpt, removeBtn);

      const commentRow = document.createElement('div');
      commentRow.className = 'aiob-reader-highlight-item__comment';
      if (highlight.id === this.editingHighlightId) {
        this.renderEditingControls(commentRow, highlight);
      } else {
        if (highlight.commentPreview) {
          const commentLabel = document.createElement('span');
          commentLabel.className = 'aiob-reader-highlight-item__comment-text';
          commentLabel.textContent = highlight.commentPreview;
          commentRow.append(commentLabel);
        } else {
          const placeholder = document.createElement('span');
          placeholder.className = 'aiob-reader-highlight-item__comment-placeholder';
          placeholder.textContent = this.texts.highlightNoComment;
          commentRow.append(placeholder);
        }
        commentRow.classList.add('aiob-reader-highlight-item__comment--interactive');
        commentRow.setAttribute('role', 'button');
        commentRow.tabIndex = 0;
        const handleCommentKeydown = (event: KeyboardEvent): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleCommentInteraction(highlight.id);
          }
        };
        commentRow.addEventListener('click', () => {
          this.handleCommentInteraction(highlight.id);
        });
        commentRow.addEventListener('keydown', handleCommentKeydown);
      }

      item.append(header, commentRow);
      this.highlightList.append(item);
    }

    this.focusEditingTextarea();
  }

  private enterEditMode(id: string): void {
    if (this.editingHighlightId === id) {
      this.expandedHighlightId = id;
      return;
    }
    const target = this.highlights.find(highlight => highlight.id === id);
    if (!target) {
      return;
    }
    this.editingHighlightId = id;
    this.editingDraft = target.comment ?? '';
    this.expandedHighlightId = id;
    this.awaitingSecondEnter = false;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    this.renderHighlights();
  }

  private renderEditingControls(container: HTMLDivElement, highlight: ReaderPanelHighlight): void {
    const editor = document.createElement('div');
    editor.className = 'aiob-reader-highlight-item__editor';

    const textarea = document.createElement('textarea');
    textarea.value = this.editingDraft;
    textarea.placeholder = this.texts.highlightEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      this.handleTextareaKeydown(event, highlight);
    });

    editor.append(textarea);
    container.append(editor);
  }

  private focusEditingTextarea(): void {
    if (!this.editingHighlightId) {
      return;
    }
    requestAnimationFrame(() => {
      const textarea = this.highlightList.querySelector<HTMLTextAreaElement>(
        `[data-highlight-id="${this.editingHighlightId}"] textarea`
      );
      if (textarea) {
        const length = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(length, length);
      }
    });
  }

  private requestHighlightsRender(): void {
    if (this.renderFrame !== null) {
      return;
    }
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderHighlights();
    });
  }

  private expandHighlight(id: string): void {
    if (this.expandedHighlightId === id) {
      return;
    }
    this.expandedHighlightId = id;
    this.renderHighlights();
  }

  private handleCommentInteraction(id: string): void {
    if (this.editingHighlightId && this.editingHighlightId !== id) {
      const submission = this.submitEditingDraft();
      if (submission && typeof (submission as Promise<unknown>).then === 'function') {
        void (submission as Promise<unknown>).then(() => {
          if (this.editingHighlightId !== null) {
            return;
          }
          this.expandedHighlightId = id;
          this.enterEditMode(id);
        });
        return;
      }
    }
    this.expandedHighlightId = id;
    this.enterEditMode(id);
  }

  private handleTextareaKeydown(event: KeyboardEvent, highlight: ReaderPanelHighlight): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.awaitingSecondEnter = false;
      if (this.enterSubmissionTimeout !== null) {
        window.clearTimeout(this.enterSubmissionTimeout);
        this.enterSubmissionTimeout = null;
      }
      this.stopEditing();
      return;
    }

    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      this.awaitingSecondEnter = false;
      if (this.enterSubmissionTimeout !== null) {
        window.clearTimeout(this.enterSubmissionTimeout);
        this.enterSubmissionTimeout = null;
      }
      return;
    }

    if (!this.awaitingSecondEnter) {
      this.awaitingSecondEnter = true;
      if (this.enterSubmissionTimeout !== null) {
        window.clearTimeout(this.enterSubmissionTimeout);
      }
      this.enterSubmissionTimeout = window.setTimeout(() => {
        this.awaitingSecondEnter = false;
        this.enterSubmissionTimeout = null;
      }, 600);
      return;
    }

    event.preventDefault();
    this.awaitingSecondEnter = false;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    this.submitEditingDraft(highlight);
  }

  private submitEditingDraft(targetHighlight?: ReaderPanelHighlight): Promise<void> | void {
    if (!this.editingHighlightId) {
      return;
    }
    const highlight =
      targetHighlight ?? this.highlights.find(item => item.id === this.editingHighlightId);
    if (!highlight) {
      this.stopEditing();
      return;
    }
    const trimmedDraft = this.editingDraft.trim();
    const trimmedOriginal = (highlight.comment ?? '').trim();
    if (trimmedDraft === trimmedOriginal) {
      this.stopEditing();
      return;
    }
    const result = this.callbacks.onSubmitHighlightEdit(highlight.id, this.editingDraft);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).catch(() => {
        // keep editor open on failure without resetting state
      }) as Promise<void>;
    }
    return;
  }

  private onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>('.aiob-reader-highlight-item');
    const highlightId = item?.dataset.highlightId ?? null;

    if (this.editingHighlightId && highlightId !== this.editingHighlightId) {
      this.submitEditingDraft();
    }

    if (!item) {
      if (this.expandedHighlightId !== null) {
        this.expandedHighlightId = null;
        this.requestHighlightsRender();
      }
      return;
    }

    if (this.expandedHighlightId && highlightId !== this.expandedHighlightId) {
      this.expandedHighlightId = null;
      this.requestHighlightsRender();
    }
  }

  destroy(): void {
    this.editingHighlightId = null;
    this.editingDraft = '';
    this.expandedHighlightId = null;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    document.removeEventListener('pointerdown', this.documentPointerDownHandler);
    this.root.remove();
  }
}
