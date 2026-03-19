import { ReaderPanel } from '../../src/content/reader/ui/panel';
import { panelStyleSheetManager } from '../../src/content/shared/panels/styleSheetManager';
import { SupportPromptToastController } from '../../src/content/ui/supportPrompt/SupportPromptToastController';
import { createPromptElement } from '../../src/content/video/videoPromptRenderer';

type SupportPromptMessagesLite = {
  likeThankYou: string;
  reviewLinkLabel: string;
  reviewAcknowledgedLabel: string;
  dislikeToastTitle: string;
  dislikeRedditLinkLabel: string;
  dislikeQrLinkLabel: string;
  dislikeQrPlaceholder: string;
};

const supportMessages: SupportPromptMessagesLite = {
  likeThankYou: 'Thanks!',
  reviewLinkLabel: 'Write review',
  reviewAcknowledgedLabel: 'I already reviewed',
  dislikeToastTitle: 'Share feedback',
  dislikeRedditLinkLabel: 'Discuss on Reddit',
  dislikeQrLinkLabel: 'Join Xiaohongshu',
  dislikeQrPlaceholder: 'QR soon'
};

const readerTexts = {
  title: 'Reader',
  status: 'Active',
  counter: '{count} highlights',
  counterZero: 'No highlights',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Select and review',
  highlightEditLabel: 'Edit note',
  highlightDeleteLabel: 'Delete note',
  highlightNoComment: 'No comment',
  highlightSaveLabel: 'Save',
  highlightCancelLabel: 'Cancel edit',
  highlightEditPlaceholder: 'Write note',
  highlightFocusLabel: 'Focus highlight {index}'
};

const root = document.getElementById('app');
if (!root) {
  throw new Error('manual harness root missing');
}

const toastController = new SupportPromptToastController({
  doc: document,
  resolveReviewUrl: () => 'https://example.com/review',
  onReviewLinkClick: async () => undefined,
  onReviewAcknowledgedClick: async () => undefined,
  onDislikeRedditClick: () => undefined,
  onDislikeQrClick: () => undefined,
  onLikeToastShown: () => undefined,
  onDislikeToastShown: () => undefined
});

let readerPanel: ReaderPanel | null = null;
let videoPromptHost: HTMLDivElement | null = null;

function clearReaderPanel(): void {
  readerPanel?.destroy();
  readerPanel = null;
}

function clearVideoPrompt(): void {
  videoPromptHost?.remove();
  videoPromptHost = null;
}

function resetHarness(): void {
  toastController.dismissToast(true);
  clearReaderPanel();
  clearVideoPrompt();
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 transition hover:border-sky-400 hover:bg-slate-800';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function showReaderPanel(): Promise<void> {
  resetHarness();
  await panelStyleSheetManager.initialize();
  readerPanel = new ReaderPanel({
    callbacks: {
      onFinish: () => undefined,
      onCancel: () => undefined,
      onDeleteHighlight: () => undefined,
      onSubmitHighlightEdit: async () => undefined,
      onFocusHighlight: () => undefined
    },
    texts: readerTexts,
    getIconUrl: (name) => `/assets/icontrs/${name}`
  });
  readerPanel.updateCount(2);
  readerPanel.setHighlights([
    {
      id: 'h-1',
      excerpt: 'Short excerpt',
      comment: 'Original comment',
      fullText: 'Long full highlight text',
      commentPreview: 'Original comment',
      index: 1,
      timestamp: 1
    },
    {
      id: 'h-2',
      excerpt: 'Second excerpt',
      comment: '',
      fullText: 'Second full text',
      commentPreview: '',
      index: 2,
      timestamp: 2
    }
  ]);
}

async function showVideoPrompt(): Promise<void> {
  resetHarness();
  await panelStyleSheetManager.initialize();

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  panelStyleSheetManager.applyVideoStyles(shadow);

  const { container } = createPromptElement({
    id: 'manual-video-prompt',
    label: 'Clip video',
    shortcut: 'Ctrl+Shift+V',
    messages: {
      videoPromptTitle: 'Clip video',
      videoPromptDismiss: 'Dismiss'
    } as never,
    getIconUrl: () => '/assets/icons/bannerlogo-48.png',
    onPrimaryAction: () => undefined,
    onDismiss: () => clearVideoPrompt()
  });

  shadow.appendChild(container);
  document.body.appendChild(host);
  videoPromptHost = host;
}

function showSupportPromptToast(kind: 'like' | 'dislike'): void {
  resetHarness();
  if (kind === 'like') {
    toastController.showLikeToast(supportMessages as never, 'first');
    return;
  }
  toastController.showDislikeToast(supportMessages as never);
}

const shell = document.createElement('main');
shell.className = 'min-h-screen bg-slate-950 px-6 py-8 font-sans text-slate-100';

const title = document.createElement('h1');
title.className = 'mb-2 text-2xl font-semibold';
title.textContent = 'Tailwind Manual Regression Harness';

const description = document.createElement('p');
description.className = 'mb-6 max-w-3xl text-sm leading-6 text-slate-300';
description.textContent =
  'Use this page to manually verify first-open styles for SupportPrompt toast, Reader panel, and Video prompt after the Shadow DOM bridge cleanup.';

const actions = document.createElement('div');
actions.className = 'flex flex-wrap gap-3';
actions.append(
  createButton('Show Support Toast Like', () => showSupportPromptToast('like')),
  createButton('Show Support Toast Dislike', () => showSupportPromptToast('dislike')),
  createButton('Show Reader Panel', () => {
    void showReaderPanel();
  }),
  createButton('Show Video Prompt', () => {
    void showVideoPrompt();
  }),
  createButton('Reset', () => resetHarness())
);

const note = document.createElement('section');
note.className = 'mt-8 max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm leading-6 text-slate-300';
note.innerHTML = [
  '<strong class="text-slate-100">Current scope</strong>',
  '<div>1. First-open style presence inside ShadowRoot.</div>',
  '<div>2. Managed bridge fallback still handled centrally.</div>',
  '<div>3. This harness validates UI mounting, not full site lifecycle integration.</div>'
].join('');

shell.append(title, description, actions, note);
root.appendChild(shell);
