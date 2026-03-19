import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '../application/readerPanelModel';
import { panelStyleSheetManager } from '../../shared/panels/styleSheetManager';
import { createIcon, Icons } from '@shared/utils/iconHelpers';

/**
 * @deprecated Legacy Reader panel implementation preserved for feature-flag fallback.
 * Prefer using ReaderDialogPanel + DaisyDialog for new development.
 */

export interface ReaderPanelOptions {
  callbacks: ReaderPanelCallbacks;
  texts: ReaderPanelTexts;
  getIconUrl?: (iconName: string) => string;
}

export class ReaderPanel {
  private callbacks: ReaderPanelCallbacks;
  private texts: ReaderPanelTexts;
  private getIconUrl: (iconName: string) => string;
  private host: HTMLDivElement;
  private shadow: ShadowRoot | null;
  private renderRoot: ShadowRoot | HTMLElement;
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private panelContainer: HTMLDivElement;
  private counterEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private highlightList: HTMLDivElement;
  private titleLabel: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private finishBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private highlights: ReaderPanelHighlight[] = [];
  private editingHighlightId: string | null = null;
  private editingDraft = '';
  private expandedHighlightId: string | null = null;
  private awaitingSecondEnter = false;
  private enterSubmissionTimeout: number | null = null;
  private documentPointerDownHandler: (event: PointerEvent) => void;
  private renderFrame: number | null = null;

  constructor(options: ReaderPanelOptions);
  constructor(callbacks: ReaderPanelCallbacks, texts: ReaderPanelTexts);
  constructor(
    callbacksOrOptions: ReaderPanelCallbacks | ReaderPanelOptions,
    texts?: ReaderPanelTexts
  ) {
    let resolvedCallbacks: ReaderPanelCallbacks;
    let resolvedTexts: ReaderPanelTexts;
    let getIconUrl: ((iconName: string) => string) | undefined;

    if ('callbacks' in callbacksOrOptions) {
      resolvedCallbacks = callbacksOrOptions.callbacks;
      resolvedTexts = callbacksOrOptions.texts;
      getIconUrl = callbacksOrOptions.getIconUrl;
    } else {
      resolvedCallbacks = callbacksOrOptions;
      resolvedTexts = texts!;
    }

    this.callbacks = resolvedCallbacks;
    this.texts = resolvedTexts;
    this.getIconUrl = getIconUrl ?? ((iconName: string) => `icons/${iconName}`);
    this.host = document.createElement('div');
    this.host.id = 'aiob-reader-panel';
    if (typeof this.host.attachShadow !== 'function') {
      throw new Error('[ReaderPanel] Shadow DOM is required for reader panel styling.');
    }
    void panelStyleSheetManager.initialize();
    this.shadow = this.host.attachShadow({ mode: 'open' });
    panelStyleSheetManager.applyReaderStyles(this.shadow);
    this.renderRoot = this.shadow;

    this.root = document.createElement('div');
    this.root.id = 'aiob-reader-root';
    // Tailwind classes replacing #aiob-reader-root styles
    this.root.className = 'fixed bottom-6 right-6 z-[2147483646] font-sans text-[#F5F6FF]';
    this.root.setAttribute('role', 'region');

    this.card = document.createElement('div');
    this.card.id = 'aiob-reader-card';
    // Tailwind classes replacing #aiob-reader-card styles
    this.card.className = 'min-w-[280px] max-w-[360px] bg-black/90 border border-white/20 rounded-2xl p-[18px_20px_20px] shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl flex flex-col gap-[18px]';

    this.highlightList = document.createElement('div');
    this.highlightList.id = 'aiob-reader-highlights';
    // Tailwind classes replacing #aiob-reader-highlights styles
    this.highlightList.className = 'aiob-reader-highlights max-h-[320px] overflow-y-auto overflow-x-hidden flex flex-col gap-3 w-full hidden';
    this.highlightList.setAttribute('role', 'list');
    this.highlightList.setAttribute('hidden', 'true');

    this.panelContainer = document.createElement('div');
    // Tailwind classes replacing #aiob-reader-panel styles
    this.panelContainer.className = 'pt-[18px] mt-1 w-full';
    this.panelContainer.setAttribute('role', 'region');

    const header = document.createElement('header');
    // Tailwind classes replacing #aiob-reader-panel header styles
    header.className = 'flex justify-between items-baseline mb-3 gap-[10px]';

    const title = document.createElement('h3');
    // Tailwind classes replacing #aiob-reader-panel h3 styles
    title.className = 'm-0 text-base font-semibold flex items-center gap-2';
    const titleIcon = document.createElement('img');
    titleIcon.src = this.getIconUrl('allinob_icon_readingt.png');
    titleIcon.alt = '';
    titleIcon.className = 'aiob-reader-icon w-6 h-6';
    this.titleLabel = document.createElement('span');
    this.titleLabel.textContent = this.texts.title;
    title.append(titleIcon, this.titleLabel);

    this.statusEl = document.createElement('span');
    this.statusEl.className = 'aiob-reader-status text-xs text-[#F5F6FF]/65';
    this.statusEl.textContent = this.texts.status;

    header.append(title, this.statusEl);

    this.counterEl = document.createElement('div');
    this.counterEl.className = 'aiob-reader-counter text-[13px] mb-4';
    this.counterEl.textContent = resolvedTexts.counterZero;

    const footer = document.createElement('footer');
    // Tailwind classes replacing #aiob-reader-panel footer styles
    footer.className = 'flex gap-[10px]';

    this.finishBtn = document.createElement('button');
    this.finishBtn.type = 'button';
    this.finishBtn.className = 'aiob-reader-finish flex-1 rounded-[10px] p-[10px_14px] text-[13px] cursor-pointer border-none transition-all duration-150 ease-out text-[#F5F6FF] bg-gradient-to-br from-[#7C5CFF] to-[#57CDFF] shadow-[0_10px_28px_rgba(124,92,255,0.35)] hover:-translate-y-[1px] hover:bg-gradient-to-br hover:from-[#8D6EFF] hover:to-[#63D5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/50';
    this.finishBtn.textContent = this.texts.finish;
    this.finishBtn.addEventListener('click', () => this.callbacks.onFinish());

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    this.cancelBtn.className = 'aiob-reader-cancel flex-1 rounded-[10px] p-[10px_14px] text-[13px] cursor-pointer border-none transition-all duration-150 ease-out text-[#F5F6FF] bg-white/8 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/50';
    this.cancelBtn.textContent = this.texts.cancel;
    this.cancelBtn.addEventListener('click', () => this.callbacks.onCancel());

    footer.append(this.finishBtn, this.cancelBtn);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'aiob-reader-hint mt-[14px] text-xs text-[#F5F6FF]/65 leading-[1.4]';
    this.hintEl.textContent = resolvedTexts.hint;
    this.panelContainer.append(header, this.counterEl, footer, this.hintEl);

    this.card.append(this.highlightList, this.panelContainer);
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

  updateTexts(texts: ReaderPanelTexts): void {
    this.texts = texts;
    this.titleLabel.textContent = texts.title;
    this.statusEl.textContent = texts.status;
    this.finishBtn.textContent = texts.finish;
    this.cancelBtn.textContent = texts.cancel;
    this.updateCount(this.highlights.length);
    this.renderHighlights();
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
      this.highlightList.setAttribute('hidden', 'true');
      this.highlightList.classList.add('aiob-reader-highlights--empty', 'hidden');
      return;
    }

    this.highlightList.removeAttribute('hidden');
    this.highlightList.removeAttribute('hidden');
    this.highlightList.classList.remove('aiob-reader-highlights--empty', 'hidden');

    for (const highlight of this.highlights) {
      const item = document.createElement('article');
      // Tailwind classes replacing .aiob-reader-highlight-item styles
      item.className = 'aiob-reader-highlight-item flex flex-col gap-2 pb-3 border-b border-white/12 last:border-b-0 last:pb-0';
      item.dataset.highlightId = highlight.id;
      item.setAttribute('role', 'listitem');
      const isExpanded = highlight.id === this.expandedHighlightId;
      if (isExpanded) {
        item.classList.add('aiob-reader-highlight-item--expanded');
      }

      const header = document.createElement('div');
      // Tailwind classes replacing .aiob-reader-highlight-item__header styles
      header.className = 'aiob-reader-highlight-item__header flex items-start gap-[10px]';

      const indexBadge = document.createElement('button');
      indexBadge.type = 'button';
      // Tailwind classes replacing .aiob-reader-highlight-item__index styles
      indexBadge.className = 'aiob-reader-highlight-item__index shrink-0 w-[22px] h-[22px] rounded-md bg-[#7C5CFF]/22 text-[#F5F6FF] text-xs font-semibold inline-flex items-center justify-center border-none cursor-pointer transition-all duration-150 ease-out hover:bg-[#7C5CFF]/35 hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]/60';
      indexBadge.textContent = String(highlight.index);
      const focusLabel = this.texts.highlightFocusLabel.replace('{index}', String(highlight.index));
      indexBadge.setAttribute('aria-label', focusLabel);
      indexBadge.title = focusLabel;
      indexBadge.addEventListener('click', () => this.callbacks.onFocusHighlight(highlight.id));

      const excerpt = document.createElement('p');
      // Tailwind classes replacing .aiob-reader-highlight-item__excerpt styles
      excerpt.className = 'aiob-reader-highlight-item__excerpt flex-1 m-0 text-xs leading-[1.5] text-[#F5F6FF] line-clamp-3 overflow-hidden cursor-pointer break-words max-h-[4.5em]';
      if (isExpanded) {
        excerpt.classList.remove('line-clamp-3', 'max-h-[4.5em]', 'overflow-hidden');
        excerpt.classList.add('block', 'max-h-none', 'overflow-visible');
      }
      excerpt.textContent = isExpanded ? highlight.fullText : highlight.excerpt;
      excerpt.addEventListener('click', () => {
        this.expandHighlight(highlight.id);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      // Tailwind classes replacing .aiob-reader-highlight-item__remove styles
      removeBtn.className = 'aiob-reader-highlight-item__remove ml-auto bg-transparent border-none text-[#F5F6FF]/65 text-lg leading-none cursor-pointer p-0 transition-all duration-150 ease-out inline-flex items-center justify-center min-w-[22px] min-h-[22px] rounded-md hover:text-[#EF5350]';
      removeBtn.setAttribute('aria-label', this.texts.highlightDeleteLabel);
      removeBtn.title = this.texts.highlightDeleteLabel;
      const removeIcon = createIcon(Icons.X, {
        size: 14,
        className: 'text-[#F5F6FF]/65'
      });
      removeIcon.setAttribute('aria-hidden', 'true');
      removeBtn.append(removeIcon);
      removeBtn.addEventListener('click', () => this.callbacks.onDeleteHighlight(highlight.id));

      header.append(indexBadge, excerpt, removeBtn);

      const commentRow = document.createElement('div');
      // Tailwind classes replacing .aiob-reader-highlight-item__comment styles
      commentRow.className = 'aiob-reader-highlight-item__comment flex items-start justify-between gap-3';
      if (highlight.id === this.editingHighlightId) {
        this.renderEditingControls(commentRow, highlight);
      } else {
        if (highlight.commentPreview) {
          const commentLabel = document.createElement('span');
          // Tailwind classes replacing .aiob-reader-highlight-item__comment-text styles
          commentLabel.className = 'aiob-reader-highlight-item__comment-text text-xs leading-[1.6] text-[#F5F6FF]/65 whitespace-pre-wrap';
          commentLabel.textContent = highlight.commentPreview;
          commentRow.append(commentLabel);
        } else {
          const placeholder = document.createElement('span');
          // Tailwind classes replacing .aiob-reader-highlight-item__comment-placeholder styles
          placeholder.className = 'aiob-reader-highlight-item__comment-placeholder text-xs leading-[1.6] text-white/40';
          placeholder.textContent = this.texts.highlightNoComment;
          commentRow.append(placeholder);
        }
        commentRow.classList.add('aiob-reader-highlight-item__comment--interactive', 'cursor-pointer', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-[#7C5CFF]/60');
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
    // Tailwind classes replacing .aiob-reader-highlight-item__editor styles
    editor.className = 'aiob-reader-highlight-item__editor flex flex-col gap-2 w-full';

    const textarea = document.createElement('textarea');
    // Tailwind classes replacing .aiob-reader-highlight-item__editor textarea styles
    textarea.className = 'w-full min-h-[90px] p-[10px_12px] rounded-[10px] border border-white/18 bg-[#0a0d1c]/65 text-[#F5F6FF] text-xs leading-[1.6] resize-y transition-all duration-150 ease-out focus:border-[#7C5CFF]/60 focus:ring-[3px] focus:ring-[#7C5CFF]/25 focus:outline-none placeholder:text-white/45';
    textarea.value = this.editingDraft;
    textarea.placeholder = this.texts.highlightEditPlaceholder;
    textarea.addEventListener('input', () => {
      this.editingDraft = textarea.value;
    });
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      this.handleTextareaKeydown(event, highlight);
    });

    editor.append(textarea);

    const actions = document.createElement('div');
    // Tailwind classes replacing .aiob-reader-highlight-item__editor-actions styles
    actions.className = 'aiob-reader-highlight-item__editor-actions flex justify-end gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    // Tailwind classes replacing .aiob-reader-highlight-item__editor-cancel styles
    cancelBtn.className = 'aiob-reader-highlight-item__editor-cancel border-none rounded-lg p-[6px_12px] text-xs cursor-pointer transition-all duration-150 ease-out bg-white/8 text-[#F5F6FF] hover:bg-white/16 hover:-translate-y-[1px]';
    cancelBtn.textContent = this.texts.highlightCancelLabel;
    cancelBtn.addEventListener('click', () => this.stopEditing());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    // Tailwind classes replacing .aiob-reader-highlight-item__editor-save styles
    saveBtn.className = 'aiob-reader-highlight-item__editor-save border-none rounded-lg p-[6px_12px] text-xs cursor-pointer transition-all duration-150 ease-out bg-gradient-to-br from-[#7C5CFF] to-[#57CDFF] text-[#F5F6FF] shadow-[0_6px_16px_rgba(124,92,255,0.25)] hover:-translate-y-[1px] hover:bg-gradient-to-br hover:from-[#8D6EFF] hover:to-[#63D5FF] disabled:opacity-55 disabled:cursor-default disabled:transform-none disabled:shadow-none';
    saveBtn.textContent = this.texts.highlightSaveLabel;
    saveBtn.addEventListener('click', () => void this.submitEditingDraft(highlight));

    actions.append(cancelBtn, saveBtn);
    editor.append(actions);
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
    void this.submitEditingDraft(highlight);
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
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>('.aiob-reader-highlight-item');
    const highlightId = item?.dataset.highlightId ?? null;

    if (this.editingHighlightId && highlightId !== this.editingHighlightId) {
      void this.submitEditingDraft();
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
    this.host.remove();
  }
}
