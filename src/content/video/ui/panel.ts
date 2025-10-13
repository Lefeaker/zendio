import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';

export class VideoPanel {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private panelContainer: HTMLDivElement;
  private counterEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private captureList: HTMLDivElement;
  private captures: VideoPanelCapture[] = [];
  private editingCaptureId: string | null = null;
  private editingDraft = '';
  private expandedCaptureId: string | null = null;
  private awaitingSecondEnter = false;
  private enterSubmissionTimeout: number | null = null;
  private documentPointerDownHandler: (event: PointerEvent) => void;
  private renderFrame: number | null = null;

  constructor(private callbacks: VideoPanelCallbacks, private texts: VideoPanelTexts) {
    this.root = document.createElement('div');
    this.root.id = 'aiob-video-root';
    this.root.setAttribute('role', 'region');

    this.card = document.createElement('div');
    this.card.id = 'aiob-video-card';

    this.captureList = document.createElement('div');
    this.captureList.id = 'aiob-video-captures';
    this.captureList.className = 'aiob-video-captures';
    this.captureList.setAttribute('role', 'list');
    this.captureList.setAttribute('hidden', 'true');

    this.panelContainer = document.createElement('div');
    this.panelContainer.id = 'aiob-video-panel';
    this.panelContainer.setAttribute('role', 'region');

    const header = document.createElement('header');

    const title = document.createElement('h3');
    const titleIcon = document.createElement('img');
    titleIcon.src = chrome.runtime.getURL('assets/icontrs/allinob_icon_clipt.png');
    titleIcon.alt = '';
    titleIcon.className = 'aiob-video-icon';
    const titleLabel = document.createElement('span');
    titleLabel.textContent = texts.title;
    title.append(titleIcon, titleLabel);

    const status = document.createElement('span');
    status.className = 'aiob-video-status';
    status.textContent = texts.status;

    header.append(title, status);

    this.counterEl = document.createElement('div');
    this.counterEl.className = 'aiob-video-counter';
    this.counterEl.textContent = texts.counterZero;

    const summaryRow = document.createElement('div');
    summaryRow.className = 'aiob-video-summary';

    const actions = document.createElement('div');
    actions.className = 'aiob-video-summary__actions';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'aiob-video-add';
    addButton.setAttribute('aria-label', texts.add);
    addButton.title = texts.add;
    addButton.textContent = texts.add;
    addButton.addEventListener('click', () => this.callbacks.onAddCapture());

    actions.append(addButton);
    summaryRow.append(this.counterEl, actions);

    const footer = document.createElement('footer');

    const finishBtn = document.createElement('button');
    finishBtn.type = 'button';
    finishBtn.className = 'aiob-video-finish';
    finishBtn.textContent = texts.finish;
    finishBtn.addEventListener('click', () => this.callbacks.onFinish());

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'aiob-video-cancel';
    cancelBtn.textContent = texts.cancel;
    cancelBtn.addEventListener('click', () => this.callbacks.onCancel());

    footer.append(finishBtn, cancelBtn);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'aiob-video-hint';
    this.hintEl.textContent = texts.hint;

    this.panelContainer.append(header, summaryRow, footer, this.hintEl);
    this.card.append(this.captureList, this.panelContainer);
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

  setCaptures(captures: VideoPanelCapture[]): void {
    this.captures = captures;
    if (this.editingCaptureId && !this.captures.some(capture => capture.id === this.editingCaptureId)) {
      this.editingCaptureId = null;
      this.editingDraft = '';
    }
    if (this.expandedCaptureId && !this.captures.some(capture => capture.id === this.expandedCaptureId)) {
      this.expandedCaptureId = null;
    }
    this.renderCaptures();
  }

  beginEditingCapture(id: string, draft: string): void {
    this.enterEditMode(id, draft);
  }

  stopEditing(): void {
    if (!this.editingCaptureId) {
      return;
    }
    this.editingCaptureId = null;
    this.editingDraft = '';
    this.expandedCaptureId = null;
    this.awaitingSecondEnter = false;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    this.renderCaptures();
  }

  destroy(): void {
    this.editingCaptureId = null;
    this.editingDraft = '';
    this.expandedCaptureId = null;
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

  private enterEditMode(id: string, overrideDraft?: string): void {
    if (this.editingCaptureId === id) {
      this.expandedCaptureId = id;
      return;
    }
    const target = this.captures.find(capture => capture.id === id);
    if (!target) {
      return;
    }
    this.editingCaptureId = id;
    this.editingDraft = overrideDraft ?? target.comment;
    this.expandedCaptureId = id;
    this.awaitingSecondEnter = false;
    if (this.enterSubmissionTimeout !== null) {
      window.clearTimeout(this.enterSubmissionTimeout);
      this.enterSubmissionTimeout = null;
    }
    this.renderCaptures();
  }

  private renderCaptures(): void {
    this.captureList.innerHTML = '';
    if (!this.captures.length) {
      this.captureList.setAttribute('hidden', 'true');
      return;
    }

    this.captureList.removeAttribute('hidden');
    let lastKind: VideoPanelCapture['kind'] | null = null;

    for (const capture of this.captures) {
      const item = document.createElement('article');
      item.className = 'aiob-video-capture-item';
      item.dataset.captureId = capture.id;
      item.dataset.captureKind = capture.kind;
      if (capture.kind === 'fragment' && lastKind !== 'fragment' && lastKind !== null) {
        item.classList.add('aiob-video-capture-item--first-fragment');
      }
      item.setAttribute('role', 'listitem');
      const isExpanded = capture.id === this.expandedCaptureId;
      if (isExpanded) {
        item.classList.add('aiob-video-capture-item--expanded');
      }

      const header = document.createElement('div');
      header.className = 'aiob-video-capture-item__header';

      const indexBadge = document.createElement('button');
      indexBadge.type = 'button';
      indexBadge.className = 'aiob-video-capture-item__index';
      indexBadge.textContent = String(capture.index);
      const focusLabel = this.texts.captureFocusLabel.replace('{index}', String(capture.index));
      indexBadge.setAttribute('aria-label', focusLabel);
      indexBadge.title = focusLabel;
      indexBadge.addEventListener('click', () => this.callbacks.onFocusCapture(capture.id));

      header.append(indexBadge);

      if (capture.kind === 'fragment') {
        const excerpt = document.createElement('p');
        excerpt.className = 'aiob-video-capture-item__excerpt';
        const fullText = capture.selectionPreview ?? capture.fragmentLabel ?? '';
        const previewText = capture.fragmentLabel ?? fullText;
        excerpt.textContent = isExpanded ? fullText : previewText;
        excerpt.setAttribute('role', 'button');
        excerpt.tabIndex = 0;
        this.attachInteractiveHandlers(excerpt, () => this.expandCapture(capture.id));
        header.append(excerpt);
      } else {
        const timeLabel = document.createElement('span');
        timeLabel.className = 'aiob-video-capture-item__time aiob-video-capture-item__time--interactive';
        timeLabel.setAttribute('role', 'button');
        timeLabel.tabIndex = 0;
        this.attachInteractiveHandlers(timeLabel, () => this.expandCapture(capture.id));
        const badge = document.createElement('span');
        badge.className = 'aiob-video-capture-item__time-badge';
        badge.textContent = capture.timeLabel ?? '';
        timeLabel.append(badge);
        header.append(timeLabel);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'aiob-video-capture-item__remove';
      removeBtn.setAttribute('aria-label', this.texts.captureDeleteLabel);
      removeBtn.title = this.texts.captureDeleteLabel;
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => this.callbacks.onDeleteCapture(capture.id));

      header.append(removeBtn);

      const commentRow = document.createElement('div');
      commentRow.className = 'aiob-video-capture-item__comment';
      if (capture.id === this.editingCaptureId) {
        this.renderEditor(commentRow, capture);
      } else {
        if (capture.commentPreview) {
          const commentLabel = document.createElement('span');
          commentLabel.className = 'aiob-video-capture-item__comment-text';
          commentLabel.textContent = capture.commentPreview;
          commentRow.append(commentLabel);
        } else {
          const placeholder = document.createElement('span');
          placeholder.className = 'aiob-video-capture-item__comment-placeholder';
          placeholder.textContent = this.texts.captureNoComment;
          commentRow.append(placeholder);
        }
        commentRow.classList.add('aiob-video-capture-item__comment--interactive');
        commentRow.setAttribute('role', 'button');
        commentRow.tabIndex = 0;
        this.attachInteractiveHandlers(commentRow, () => this.handleCommentInteraction(capture.id));
      }

      item.append(header, commentRow);
      this.captureList.append(item);
      lastKind = capture.kind;
    }

    this.focusEditingTextarea();
  }

  private renderEditor(container: HTMLDivElement, capture: VideoPanelCapture): void {
    const editor = document.createElement('div');
    editor.className = 'aiob-video-capture-editor';

    const textarea = document.createElement('textarea');
    textarea.value = this.editingDraft;
    textarea.placeholder = this.texts.captureEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      this.handleTextareaKeydown(event, capture);
    });

    editor.append(textarea);
    container.append(editor);
  }

  private focusEditingTextarea(): void {
    if (!this.editingCaptureId) {
      return;
    }
    requestAnimationFrame(() => {
      const textarea = this.captureList.querySelector<HTMLTextAreaElement>(
        `[data-capture-id="${this.editingCaptureId}"] textarea`
      );
      if (textarea) {
        const length = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(length, length);
      }
    });
  }

  private requestCapturesRender(): void {
    if (this.renderFrame !== null) {
      return;
    }
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderCaptures();
    });
  }

  private expandCapture(id: string): void {
    if (this.expandedCaptureId === id) {
      this.expandedCaptureId = null;
      this.renderCaptures();
      return;
    }
    this.expandedCaptureId = id;
    this.renderCaptures();
    this.callbacks.onFocusCapture(id);
  }

  private handleCommentInteraction(id: string): void {
    if (this.editingCaptureId && this.editingCaptureId !== id) {
      const submission = this.submitEditingDraft();
      if (submission && typeof (submission as Promise<unknown>).then === 'function') {
        void (submission as Promise<unknown>).then(() => {
          if (this.editingCaptureId !== null) {
            return;
          }
          this.enterEditMode(id);
        });
        return;
      }
    }
    this.callbacks.onFocusCapture(id);
    this.enterEditMode(id);
  }

  private handleTextareaKeydown(event: KeyboardEvent, capture: VideoPanelCapture): void {
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
    this.submitEditingDraft(capture);
  }

  private submitEditingDraft(targetCapture?: VideoPanelCapture): Promise<void> | void {
    if (!this.editingCaptureId) {
      return;
    }
    const capture =
      targetCapture ?? this.captures.find(item => item.id === this.editingCaptureId);
    if (!capture) {
      this.stopEditing();
      return;
    }
    const trimmedDraft = this.editingDraft.trim();
    const trimmedOriginal = capture.comment.trim();
    if (trimmedDraft === trimmedOriginal) {
      this.stopEditing();
      return;
    }
    const result = this.callbacks.onSubmitCaptureEdit(capture.id, this.editingDraft);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).catch(() => {
        // keep editor open on failure without resetting state
      }) as Promise<void>;
    }
    return;
  }

  private attachInteractiveHandlers(element: HTMLElement, onActivate: () => void): void {
    element.addEventListener('click', onActivate);
    element.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    });
  }

  private onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>('.aiob-video-capture-item');
    const captureId = item?.dataset.captureId ?? null;

    if (this.editingCaptureId && captureId !== this.editingCaptureId) {
      this.submitEditingDraft();
    }

    if (!item) {
      if (this.expandedCaptureId !== null) {
        this.expandedCaptureId = null;
        this.requestCapturesRender();
      }
      return;
    }

    if (this.expandedCaptureId && captureId !== this.expandedCaptureId) {
      this.expandedCaptureId = null;
      this.requestCapturesRender();
    }
  }
}
