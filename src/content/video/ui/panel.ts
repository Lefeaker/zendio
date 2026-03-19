import type {
  VideoPanelCallbacks,
  VideoPanelCapture,
  VideoPanelTexts
} from '../application/videoPanelModel';
import { panelStyleSheetManager } from '../../shared/panels/styleSheetManager';
import { createIcon, Icons } from '@shared/utils/iconHelpers';

export interface VideoPanelOptions {
  callbacks: VideoPanelCallbacks;
  texts: VideoPanelTexts;
  getIconUrl?: (iconName: string) => string;
}

export class VideoPanel {
  private host: HTMLDivElement;
  private shadow: ShadowRoot | null;
  private renderRoot: ShadowRoot | HTMLElement;
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
  private titleLabel: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private addButton: HTMLButtonElement;
  private finishBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private getIconUrl: (iconName: string) => string;
  private callbacks: VideoPanelCallbacks;
  private texts: VideoPanelTexts;

  constructor(options: VideoPanelOptions);
  constructor(callbacks: VideoPanelCallbacks, texts: VideoPanelTexts);
  constructor(
    callbacksOrOptions: VideoPanelCallbacks | VideoPanelOptions,
    texts?: VideoPanelTexts
  ) {
    let callbacks: VideoPanelCallbacks;
    let textsResolved: VideoPanelTexts;
    let getIconUrl: ((iconName: string) => string) | undefined;

    if ('callbacks' in callbacksOrOptions) {
      callbacks = callbacksOrOptions.callbacks;
      textsResolved = callbacksOrOptions.texts;
      getIconUrl = callbacksOrOptions.getIconUrl;
    } else {
      callbacks = callbacksOrOptions;
      textsResolved = texts!;
    }

    this.getIconUrl = getIconUrl ?? ((iconName: string) => `icons/${iconName}`);
    const callbacks_ = callbacks;
    const texts_ = textsResolved;
    this.callbacks = callbacks_;
    this.texts = texts_;
    this.host = document.createElement('div');
    this.host.id = 'aiob-video-panel';
    if (typeof this.host.attachShadow !== 'function') {
      throw new Error('[VideoPanel] Shadow DOM is required for video panel styling.');
    }
    void panelStyleSheetManager.initialize();
    this.shadow = this.host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyVideoStyles(this.shadow);
    this.renderRoot = this.shadow;

    this.root = document.createElement('div');
    this.root.id = 'aiob-video-root';
    // Tailwind classes replacing #aiob-video-root styles
    this.root.className = 'fixed bottom-6 right-6 z-[2147483646] font-sans text-[#F5F6FF]';
    this.root.setAttribute('role', 'region');

    this.card = document.createElement('div');
    this.card.id = 'aiob-video-card';
    // Tailwind classes replacing #aiob-video-card styles
    this.card.className = 'min-w-[280px] max-w-[360px] bg-[#121528]/92 border border-[#748de7]/35 rounded-2xl p-[18px_20px_20px] shadow-[0_18px_45px_rgba(17,22,45,0.45)] backdrop-blur-[18px] flex flex-col gap-[18px]';

    this.captureList = document.createElement('div');
    this.captureList.id = 'aiob-video-captures';
    // Tailwind classes replacing #aiob-video-captures styles
    this.captureList.className = 'aiob-video-captures max-h-[320px] overflow-y-auto overflow-x-hidden flex flex-col gap-3 w-full hidden';
    this.captureList.setAttribute('role', 'list');
    this.captureList.setAttribute('hidden', 'true');

    this.panelContainer = document.createElement('div');
    this.panelContainer.setAttribute('role', 'region');

    const header = document.createElement('header');
    // Tailwind classes replacing #aiob-video-panel header styles
    header.className = 'flex justify-between items-baseline mb-3 gap-[10px]';

    const title = document.createElement('h3');
    // Tailwind classes replacing #aiob-video-panel h3 styles
    title.className = 'm-0 text-base font-semibold flex items-center gap-2 text-[#F5F6FF]';
    const titleIcon = document.createElement('img');
    titleIcon.src = this.getIconUrl('allinob_icon_clipt.png');
    titleIcon.alt = '';
    titleIcon.className = 'aiob-video-icon w-6 h-6 inline-block';
    this.titleLabel = document.createElement('span');
    this.titleLabel.textContent = texts_.title;
    title.append(titleIcon, this.titleLabel);

    this.statusEl = document.createElement('span');
    this.statusEl.className = 'aiob-video-status ml-auto text-xs text-[#F5F6FF]/65';
    this.statusEl.textContent = texts_.status;

    header.append(title, this.statusEl);

    this.counterEl = document.createElement('div');
    this.counterEl.className = 'aiob-video-counter text-[13px] text-[#F5F6FF]/65 flex-auto';
    this.counterEl.textContent = texts_.counterZero;

    const summaryRow = document.createElement('div');
    // Tailwind classes replacing #aiob-video-panel .aiob-video-summary styles
    summaryRow.className = 'aiob-video-summary flex items-center justify-between gap-3 mb-4 flex-wrap';

    const actions = document.createElement('div');
    // Tailwind classes replacing #aiob-video-panel .aiob-video-summary__actions styles
    actions.className = 'aiob-video-summary__actions flex gap-2 shrink-0';

    this.addButton = document.createElement('button');
    this.addButton.type = 'button';
    // Tailwind classes replacing #aiob-video-panel .aiob-video-add styles
    this.addButton.className = 'aiob-video-add bg-white/8 text-[#F5F6FF] border-none rounded-[10px] p-[7px_12px] text-xs font-medium cursor-pointer transition-all duration-150 ease-out hover:bg-white/16 hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57CDFF]/55';
    this.addButton.setAttribute('aria-label', texts_.add);
    this.addButton.title = texts_.add;
    this.addButton.textContent = texts_.add;
    this.addButton.addEventListener('click', () => this.callbacks.onAddCapture());

    actions.append(this.addButton);
    summaryRow.append(this.counterEl, actions);

    const footer = document.createElement('footer');
    // Tailwind classes replacing #aiob-video-panel footer styles
    footer.className = 'flex gap-[10px]';

    this.finishBtn = document.createElement('button');
    this.finishBtn.type = 'button';
    // Tailwind classes replacing #aiob-video-panel .aiob-video-finish styles
    this.finishBtn.className = 'aiob-video-finish flex-1 rounded-[10px] p-[10px_14px] text-[13px] font-medium cursor-pointer border-none transition-all duration-150 ease-out text-[#F5F6FF] bg-gradient-to-br from-[#57CDFF] to-[#7C5CFF] hover:-translate-y-[1px] hover:bg-gradient-to-br hover:from-[#63D5FF] hover:to-[#8D6EFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57CDFF]/55';
    this.finishBtn.textContent = texts_.finish;
    this.finishBtn.addEventListener('click', () => this.callbacks.onFinish());

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    // Tailwind classes replacing #aiob-video-panel .aiob-video-cancel styles
    this.cancelBtn.className = 'aiob-video-cancel flex-1 rounded-[10px] p-[10px_14px] text-[13px] font-medium cursor-pointer border-none transition-all duration-150 ease-out text-[#F5F6FF] bg-white/12 hover:bg-white/18 hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57CDFF]/55';
    this.cancelBtn.textContent = texts_.cancel;
    this.cancelBtn.addEventListener('click', () => this.callbacks.onCancel());

    footer.append(this.finishBtn, this.cancelBtn);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'aiob-video-hint text-xs text-[#F5F6FF]/65';
    this.hintEl.textContent = texts_.hint;

    this.panelContainer.append(header, summaryRow, footer, this.hintEl);
    this.card.append(this.captureList, this.panelContainer);
    this.root.appendChild(this.card);
    this.renderRoot.appendChild(this.root);
    document.body.appendChild(this.host);

    this.documentPointerDownHandler = (event: PointerEvent) => {
      this.onDocumentPointerDown(event);
    };
    document.addEventListener('pointerdown', this.documentPointerDownHandler);
  }

  get element(): HTMLElement {
    return this.host;
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

  updateTexts(texts: VideoPanelTexts): void {
    const previousTexts = this.texts;
    this.texts = texts;
    this.titleLabel.textContent = texts.title;
    this.statusEl.textContent = texts.status;
    this.addButton.setAttribute('aria-label', texts.add);
    this.addButton.title = texts.add;
    this.addButton.textContent = texts.add;
    this.finishBtn.textContent = texts.finish;
    this.cancelBtn.textContent = texts.cancel;
    if (this.hintEl.textContent === previousTexts.hint) {
      this.hintEl.textContent = texts.hint;
    }
    this.updateCount(this.captures.length);
    this.renderCaptures();
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
    this.host.remove();
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
      this.captureList.classList.add('hidden');
      return;
    }

    this.captureList.removeAttribute('hidden');
    this.captureList.classList.remove('hidden');
    let lastKind: VideoPanelCapture['kind'] | null = null;

    for (const capture of this.captures) {
      const item = document.createElement('article');
      // Tailwind classes replacing .aiob-video-capture-item styles
      item.className = 'aiob-video-capture-item flex flex-col gap-2 pb-3 border-b border-white/12 last:border-b-0 last:pb-0';
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
      // Tailwind classes replacing .aiob-video-capture-item__header styles
      header.className = 'aiob-video-capture-item__header flex items-start gap-[10px]';

      const indexBadge = document.createElement('button');
      indexBadge.type = 'button';
      // Tailwind classes replacing .aiob-video-capture-item__index styles
      indexBadge.className = 'aiob-video-capture-item__index shrink-0 w-[22px] h-[22px] rounded-md bg-[#7C5CFF]/22 text-[#F5F6FF] text-xs font-semibold inline-flex items-center justify-center border-none cursor-pointer transition-all duration-150 ease-out hover:bg-[#7C5CFF]/35 hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/60';
      indexBadge.textContent = String(capture.index);
      const focusLabel = this.texts.captureFocusLabel.replace('{index}', String(capture.index));
      indexBadge.setAttribute('aria-label', focusLabel);
      indexBadge.title = focusLabel;
      indexBadge.addEventListener('click', () => this.callbacks.onFocusCapture(capture.id));

      header.append(indexBadge);

      if (capture.kind === 'fragment') {
        const excerpt = document.createElement('p');
        // Tailwind classes replacing .aiob-video-capture-item__excerpt styles
        excerpt.className = 'aiob-video-capture-item__excerpt flex-1 m-0 text-xs leading-[1.5] text-[#F5F6FF] line-clamp-3 overflow-hidden cursor-pointer break-words max-h-[4.5em]';
        const fullText = capture.selectionPreview ?? capture.fragmentLabel ?? '';
        const previewText = capture.fragmentLabel ?? fullText;
        excerpt.textContent = isExpanded ? fullText : previewText;
        if (isExpanded) {
          excerpt.classList.remove('line-clamp-3', 'max-h-[4.5em]', 'overflow-hidden');
          excerpt.classList.add('block', 'max-h-none', 'overflow-visible');
        }
        excerpt.setAttribute('role', 'button');
        excerpt.tabIndex = 0;
        this.attachInteractiveHandlers(excerpt, () => this.expandCapture(capture.id));
        header.append(excerpt);
      } else {
        const timeLabel = document.createElement('span');
        // Tailwind classes replacing .aiob-video-capture-item__time styles
        timeLabel.className = 'aiob-video-capture-item__time aiob-video-capture-item__time--interactive flex-1 flex items-center gap-2 text-xs text-[#F5F6FF] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57CDFF]/60';
        timeLabel.setAttribute('role', 'button');
        timeLabel.tabIndex = 0;
        this.attachInteractiveHandlers(timeLabel, () => this.expandCapture(capture.id));
        const badge = document.createElement('span');
        // Tailwind classes replacing .aiob-video-capture-item__time-badge styles
        badge.className = 'aiob-video-capture-item__time-badge bg-transparent p-0 rounded-none text-xs text-[#F5F6FF] transition-none';
        badge.textContent = capture.timeLabel ?? '';
        timeLabel.append(badge);
        header.append(timeLabel);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      // Tailwind classes replacing .aiob-video-capture-item__remove styles
      removeBtn.className = 'aiob-video-capture-item__remove ml-auto bg-transparent border-none text-[#F5F6FF]/65 text-lg leading-none cursor-pointer p-0 transition-all duration-150 ease-out inline-flex items-center justify-center min-w-[22px] min-h-[22px] rounded-md hover:text-[#EF5350] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/60';
      removeBtn.setAttribute('aria-label', this.texts.captureDeleteLabel);
      removeBtn.title = this.texts.captureDeleteLabel;
      const removeIcon = createIcon(Icons.X, {
        size: 14,
        className: 'text-[#F5F6FF]/65'
      });
      removeIcon.setAttribute('aria-hidden', 'true');
      removeBtn.append(removeIcon);
      removeBtn.addEventListener('click', () => this.callbacks.onDeleteCapture(capture.id));

      header.append(removeBtn);

      const commentRow = document.createElement('div');
      // Tailwind classes replacing .aiob-video-capture-item__comment styles
      commentRow.className = 'aiob-video-capture-item__comment flex items-start justify-between gap-3';
      if (capture.id === this.editingCaptureId) {
        this.renderEditor(commentRow, capture);
      } else {
        if (capture.commentPreview) {
          const commentLabel = document.createElement('span');
          // Tailwind classes replacing .aiob-video-capture-item__comment-text styles
          commentLabel.className = 'aiob-video-capture-item__comment-text text-xs leading-[1.6] text-[#F5F6FF]/65 whitespace-pre-wrap';
          commentLabel.textContent = capture.commentPreview;
          commentRow.append(commentLabel);
        } else {
          const placeholder = document.createElement('span');
          // Tailwind classes replacing .aiob-video-capture-item__comment-placeholder styles
          placeholder.className = 'aiob-video-capture-item__comment-placeholder text-xs leading-[1.6] text-white/40';
          placeholder.textContent = this.texts.captureNoComment;
          commentRow.append(placeholder);
        }
        commentRow.classList.add('aiob-video-capture-item__comment--interactive', 'cursor-pointer', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-[#57CDFF]/60');
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
    // Tailwind classes replacing .aiob-video-capture-editor styles
    editor.className = 'aiob-video-capture-editor flex flex-col gap-[10px] w-full';

    const textarea = document.createElement('textarea');
    // Tailwind classes replacing .aiob-video-capture-editor textarea styles
    textarea.className = 'w-full resize-y min-h-[90px] rounded-[10px] border border-white/15 p-[10px_12px] bg-[#080a12]/60 text-[#F5F6FF] text-[13px] leading-[1.6] transition-all duration-150 ease-out focus:border-[#57CDFF]/60 focus:outline-none focus:ring-[2px] focus:ring-[#57CDFF]/25 placeholder:text-white/45';
    textarea.value = this.editingDraft;
    textarea.placeholder = this.texts.captureEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      this.handleTextareaKeydown(event, capture);
    });

    editor.append(textarea);

    const actions = document.createElement('div');
    // Tailwind classes replacing .aiob-video-capture__editor-actions styles
    actions.className = 'aiob-video-capture__editor-actions flex justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    // Tailwind classes replacing .aiob-video-capture__editor-cancel styles
    cancelBtn.className = 'aiob-video-capture__editor-cancel border-none rounded-lg p-[6px_12px] text-xs cursor-pointer transition-all duration-150 ease-out bg-white/8 text-[#F5F6FF] hover:bg-white/16 hover:-translate-y-[1px]';
    cancelBtn.textContent = this.texts.captureCancelLabel;
    cancelBtn.addEventListener('click', () => this.stopEditing());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    // Tailwind classes replacing .aiob-video-capture__editor-save styles
    saveBtn.className = 'aiob-video-capture__editor-save border-none rounded-lg p-[6px_12px] text-xs cursor-pointer transition-all duration-150 ease-out bg-gradient-to-br from-[#57CDFF] to-[#7C5CFF] text-[#F5F6FF] shadow-[0_6px_16px_rgba(87,205,255,0.25)] hover:-translate-y-[1px] hover:bg-gradient-to-br hover:from-[#63D5FF] hover:to-[#8D6EFF] disabled:opacity-55 disabled:cursor-default disabled:transform-none disabled:shadow-none';
    saveBtn.textContent = this.texts.captureSaveLabel;
    saveBtn.addEventListener('click', () => void this.submitEditingDraft(capture));

    actions.append(cancelBtn, saveBtn);
    editor.append(actions);
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
    void this.submitEditingDraft(capture);
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
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>('.aiob-video-capture-item');
    const captureId = item?.dataset.captureId ?? null;

    if (this.editingCaptureId && captureId !== this.editingCaptureId) {
      void this.submitEditingDraft();
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
