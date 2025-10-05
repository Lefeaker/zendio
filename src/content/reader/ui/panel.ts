export interface ReaderPanelCallbacks {
  onFinish: () => void;
  onCancel: () => void;
}

export interface ReaderPanelTexts {
  title: string;
  status: string;
  counter: string;
  counterZero: string;
  finish: string;
  cancel: string;
  hint: string;
}

export class ReaderPanel {
  private container: HTMLDivElement;
  private counterEl: HTMLDivElement;
  private hintEl: HTMLDivElement;

  constructor(private callbacks: ReaderPanelCallbacks, private texts: ReaderPanelTexts) {
    this.container = document.createElement('div');
    this.container.id = 'aiob-reader-panel';

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
    status.textContent = texts.status;

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

    this.container.append(header, this.counterEl, footer, this.hintEl);
    document.body.appendChild(this.container);
  }

  get element(): HTMLDivElement {
    return this.container;
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

  destroy(): void {
    this.container.remove();
  }
}
