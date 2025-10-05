import { InlineStyleManager } from '../clipper/shared/styleManager';

const SUPPORT_PROMPT_STYLES = `
#aiob-support-prompt {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483647;
  width: 280px;
  border-radius: 16px;
  padding: 16px;
  background: rgba(20, 23, 42, 0.94);
  border: 0.75px solid rgba(116, 141, 231, 0.35);
  box-shadow: 0 14px 32px rgba(17, 22, 45, 0.5);
  color: #d8dcff;
  text-shadow: 0 0 10px rgba(124, 92, 255, 0.35);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#aiob-support-prompt h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #eef0ff;
  text-shadow: 0 0 12px rgba(124, 92, 255, 0.4);
}

#aiob-support-prompt .aiob-support-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

#aiob-support-prompt .aiob-support-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(64, 55, 207, 0.08);
  transition: background 0.18s ease, transform 0.18s ease;
  color: #e4e7ff;
  box-sizing: border-box;
  text-shadow: 0 0 8px rgba(124, 92, 255, 0.3);
}

#aiob-support-prompt .aiob-support-link:hover {
  background: rgba(64, 55, 207, 0.15);
  transform: translateY(-1px);
}

#aiob-support-prompt .aiob-support-icon {
  width: 26px;
  height: 26px;
  background: linear-gradient(135deg, #8b5cf6, #22d3ee);
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
}

#aiob-support-prompt .aiob-support-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

#aiob-support-prompt .aiob-support-text strong {
  font-size: 13px;
  color: #f2f3ff;
  text-shadow: 0 0 10px rgba(138, 92, 246, 0.35);
}

#aiob-support-prompt .aiob-support-text span {
  font-size: 12px;
  color: rgba(215, 219, 255, 0.72);
  text-shadow: 0 0 6px rgba(99, 102, 241, 0.25);
}

#aiob-support-prompt .aiob-support-feedback {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
  height: 100%;
}

#aiob-support-prompt .aiob-support-feedback-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  border: none;
  background: rgba(64, 55, 207, 0.08);
  padding: 8px 0;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
  color: inherit;
}

#aiob-support-prompt .aiob-support-feedback-btn:hover {
  background: rgba(64, 55, 207, 0.16);
  transform: translateY(-1px);
}

#aiob-support-prompt .aiob-support-feedback-btn:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.5);
  outline-offset: 2px;
}

#aiob-support-prompt .aiob-support-feedback-icon {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #8b5cf6, #22d3ee);
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
}

#aiob-support-prompt .aiob-support-feedback-icon--dislike {
  transform: scaleY(-1);
}

#aiob-support-prompt .aiob-support-footer {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}

#aiob-support-prompt .aiob-support-status {
  font-size: 12px;
  color: rgba(230, 233, 255, 0.88);
  text-shadow: 0 0 10px rgba(138, 92, 246, 0.35);
}

#aiob-support-prompt .aiob-support-status[data-status="failure"] {
  color: rgba(255, 186, 196, 0.95);
  text-shadow: 0 0 10px rgba(244, 114, 182, 0.35);
}

#aiob-support-prompt .aiob-support-dismiss {
  font-size: 11px;
  color: rgba(216, 220, 255, 0.42);
  text-shadow: none;
  margin-left: auto;
  text-align: right;
}
`;

interface SupportLink {
  icon: string;
  title: string;
  description?: string;
  url: string;
}

type PromptStatus = 'success' | 'failure';

export class SupportPrompt {
  private container: HTMLDivElement | null = null;
  private readonly styleManager: InlineStyleManager;
  private stylesMounted = false;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.container) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this.container.contains(target)) {
      return;
    }
    this.hide();
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide();
    }
  };

  constructor(private readonly doc: Document) {
    this.styleManager = new InlineStyleManager(doc);
  }

  show(options?: { vaultName?: string; status?: PromptStatus; errorMessage?: string }): void {
    this.hide();

    if (!this.stylesMounted) {
      this.styleManager.mount(SUPPORT_PROMPT_STYLES);
      this.stylesMounted = true;
    }

    const links: SupportLink[] = [
      {
        icon: chrome.runtime.getURL('assets/icontrs/ko-fi.svg'),
        title: 'Ko-fi',
        description: 'Buy me a coffee',
        url: 'https://ko-fi.com/xiannian'
      },
      {
        icon: chrome.runtime.getURL('assets/icontrs/aifadian-line-copy.svg'),
        title: '爱发电',
        description: '',
        url: 'https://afdian.com/a/LefShi'
      },
      {
        icon: chrome.runtime.getURL('assets/icontrs/github-fill.svg'),
        title: 'GitHub',
        description: '提交反馈',
        url: 'https://github.com/Lefeaker/AllinOB/issues'
      }
    ];

    const container = this.doc.createElement('div');
    container.id = 'aiob-support-prompt';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', '支持 All in Ob');
    container.tabIndex = -1;

    const title = this.doc.createElement('h3');
    title.textContent = '支持 All in Ob';

    const linksWrapper = this.doc.createElement('div');
    linksWrapper.className = 'aiob-support-links';

    const donationLinks = links.slice(0, 2);
    for (const link of donationLinks) {
      const anchor = this.doc.createElement('a');
      anchor.className = 'aiob-support-link';
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';

      const icon = this.doc.createElement('span');
      icon.className = 'aiob-support-icon';
      icon.style.maskImage = `url(${link.icon})`;
      icon.style.webkitMaskImage = `url(${link.icon})`;

      const textWrap = this.doc.createElement('div');
      textWrap.className = 'aiob-support-text';

      const strong = this.doc.createElement('strong');
      strong.textContent = link.title;

      textWrap.append(strong);

      if (link.description) {
        const description = this.doc.createElement('span');
        description.textContent = link.description;
        textWrap.appendChild(description);
      }
      anchor.append(icon, textWrap);
      linksWrapper.appendChild(anchor);
    }

    const githubLink = (() => {
      const link = links[2];
      const anchor = this.doc.createElement('a');
      anchor.className = 'aiob-support-link';
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';

      const icon = this.doc.createElement('span');
      icon.className = 'aiob-support-icon';
      icon.style.maskImage = `url(${link.icon})`;
      icon.style.webkitMaskImage = `url(${link.icon})`;

      const textWrap = this.doc.createElement('div');
      textWrap.className = 'aiob-support-text';

      const strong = this.doc.createElement('strong');
      strong.textContent = link.title;

      textWrap.append(strong);

      if (link.description) {
        const description = this.doc.createElement('span');
        description.textContent = link.description;
        textWrap.appendChild(description);
      }
      anchor.append(icon, textWrap);
      return anchor;
    })();

    linksWrapper.appendChild(githubLink);

    const feedbackGroup = this.doc.createElement('div');
    feedbackGroup.className = 'aiob-support-feedback';
    feedbackGroup.setAttribute('role', 'group');
    feedbackGroup.setAttribute('aria-label', '快速反馈');

    const likeIconPath = chrome.runtime.getURL('assets/icontrs/赞.svg');

    const likeBtn = this.doc.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = 'aiob-support-feedback-btn';
    likeBtn.title = '赞一个';
    likeBtn.setAttribute('aria-label', '赞一个');
    likeBtn.addEventListener('click', () => {
      window.open('https://github.com/Lefeaker/AllinOB/issues/new?labels=feedback&title=%5B赞%5D%20反馈', '_blank', 'noopener');
      this.hide();
    });

    const likeIcon = this.doc.createElement('span');
    likeIcon.className = 'aiob-support-feedback-icon';
    likeIcon.style.maskImage = `url(${likeIconPath})`;
    likeIcon.style.webkitMaskImage = `url(${likeIconPath})`;
    likeBtn.appendChild(likeIcon);

    const dislikeBtn = this.doc.createElement('button');
    dislikeBtn.type = 'button';
    dislikeBtn.className = 'aiob-support-feedback-btn';
    dislikeBtn.title = '倒赞';
    dislikeBtn.setAttribute('aria-label', '倒赞');
    dislikeBtn.addEventListener('click', () => {
      window.open('https://github.com/Lefeaker/AllinOB/issues/new?labels=feedback&title=%5B吐槽%5D%20反馈', '_blank', 'noopener');
      this.hide();
    });

    const dislikeIcon = this.doc.createElement('span');
    dislikeIcon.className = 'aiob-support-feedback-icon aiob-support-feedback-icon--dislike';
    dislikeIcon.style.maskImage = `url(${likeIconPath})`;
    dislikeIcon.style.webkitMaskImage = `url(${likeIconPath})`;
    dislikeBtn.appendChild(dislikeIcon);

    feedbackGroup.append(likeBtn, dislikeBtn);

    linksWrapper.appendChild(feedbackGroup);

    const footer = this.doc.createElement('div');
    footer.className = 'aiob-support-footer';

    const status = this.doc.createElement('div');
    const isFailure = options?.status === 'failure';
    status.className = 'aiob-support-status';
    if (isFailure) {
      status.textContent = options?.errorMessage
        ? `发送失败，${options.errorMessage}`
        : '发送失败';
      status.dataset.status = 'failure';
    } else {
      const vaultLabel = options?.vaultName?.trim();
      status.textContent = vaultLabel ? `成功发送到 ${vaultLabel}` : '发送成功';
      status.dataset.status = 'success';
    }

    const dismiss = this.doc.createElement('div');
    dismiss.className = 'aiob-support-dismiss';
    dismiss.textContent = '点击页面其他区域即可关闭';

    footer.append(status, dismiss);

    container.append(title, linksWrapper, footer);
    this.doc.body.appendChild(container);
    this.container = container;

    container.focus();

    this.doc.addEventListener('pointerdown', this.handlePointerDown, true);
    this.doc.addEventListener('keydown', this.handleKeydown, true);
  }

  hide(): void {
    if (!this.container) {
      return;
    }

    this.container.remove();
    this.container = null;
    this.doc.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.doc.removeEventListener('keydown', this.handleKeydown, true);
  }
}
