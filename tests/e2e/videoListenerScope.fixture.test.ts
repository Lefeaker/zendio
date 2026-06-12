/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/options/stitch/styles/runtime/video-control-bar.css?inline', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  return {
    default: fs.readFileSync(
      path.resolve(process.cwd(), 'src/options/stitch/styles/runtime/video-control-bar.css'),
      'utf8'
    )
  };
});

import {
  ensureVideoControlBarButton,
  removeVideoControlBarButton
} from '../../src/content/video/videoControlBarButton';
import { BilibiliVideoPlatform } from '../../src/content/video/platforms/bilibiliPlatform';
import { findVideoControlTarget } from '../../src/content/video/videoPromptObserver';
import { SelectionCaptureController } from '../../src/content/video/selectionCaptureController';
import { VideoFragmentSelectionController } from '../../src/content/video/videoFragmentSelectionController';
import type { PendingSelectionTracker } from '../../src/content/video/pendingSelectionTracker';
import type {
  PlatformSelectionInput,
  VideoPlatformAdapter,
  VideoPlatformContext
} from '../../src/content/video/platforms';
import { asType, selection as mkSelection } from '../utils/typeHelpers';
import { readVideoControlBarGeometry } from '../utils/videoControlBarGeometry';

function queryRequired<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function createRangeSelection(text = 'Selected text'): { range: Range; selection: Selection } {
  document.body.insertAdjacentHTML('beforeend', `<p id="selectable">${text}</p>`);
  const textNode = document.getElementById('selectable')?.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error('missing text node');
  }
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, text.length);
  return {
    range,
    selection: mkSelection({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      toString: () => text,
      removeAllRanges: vi.fn()
    })
  };
}

function createPlatformContext(): VideoPlatformContext {
  return {
    doc: document,
    highlightSelection: vi.fn(() => undefined),
    decorateHighlight: vi.fn(),
    scheduleFragmentHighlightRestore: vi.fn(),
    getElementByIdDeep: vi.fn(() => null),
    querySelectorDeep: vi.fn(() => null),
    observeWithFragmentObserver: vi.fn(),
    registerShadowSelectionBridge: vi.fn(),
    ensureHighlightStyles: vi.fn()
  };
}

function createRichTextHost(fixtureId: string, html: string): HTMLElement {
  const richText = document.createElement('bili-rich-text');
  richText.dataset.fixture = fixtureId;
  const root = richText.attachShadow({ mode: 'open' });
  root.innerHTML = `<div id="contents" class="rich-text-content">${html}</div>`;
  return richText;
}

function mountNestedBilibiliCommentsFixture(): {
  mainContent: HTMLElement;
  mainRichText: HTMLElement;
  replyContent: HTMLElement;
  replyRichText: HTMLElement;
} {
  const comments = document.createElement('bili-comments');
  const commentsRoot = comments.attachShadow({ mode: 'open' });
  const thread = document.createElement('bili-comment-thread-renderer');
  const threadRoot = thread.attachShadow({ mode: 'open' });
  const comment = document.createElement('bili-comment-renderer');
  const commentRoot = comment.attachShadow({ mode: 'open' });
  const reply = document.createElement('bili-comment-reply-renderer');
  const replyRoot = reply.attachShadow({ mode: 'open' });
  const mainRichText = createRichTextHost('main-rich-text', '<span>Main fixture rich text</span>');
  const replyRichText = createRichTextHost(
    'reply-rich-text',
    '<span>Reply </span><a data-type="mention" href="//space.bilibili.com/123">@reply-user</a><span> fixture rich text</span>'
  );

  commentRoot.append(mainRichText);
  replyRoot.append(replyRichText);
  threadRoot.append(comment, reply);
  commentsRoot.append(thread);
  document.body.append(comments);

  const mainContent = mainRichText.shadowRoot?.querySelector<HTMLElement>('.rich-text-content');
  const replyContent = replyRichText.shadowRoot?.querySelector<HTMLElement>('.rich-text-content');
  if (!mainContent || !replyContent) {
    throw new Error('Failed to mount nested Bilibili fixture.');
  }

  return { mainContent, mainRichText, replyContent, replyRichText };
}

function createBilibiliMouseUp(path: readonly EventTarget[]): MouseEvent {
  const event = new MouseEvent('mouseup', { bubbles: true, composed: true });
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => path
  });
  return event;
}

function expectPxWithin(actual: number | null, expected: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(1);
}

describe('video listener scope jsdom fixtures', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  it('inserts one YouTube control-bar logo and opens the add-note popover from the logo', () => {
    document.body.innerHTML = '<div class="ytp-right-controls"></div>';
    const onPrimaryAction = vi.fn(() => {
      const panel = document.createElement('section');
      panel.dataset.stitchSurface = 'video';
      document.body.appendChild(panel);
    });

    expect(
      ensureVideoControlBarButton({
        doc: document,
        url: 'https://www.youtube.com/watch?v=abc',
        label: 'Clip video',
        shortcut: 'Alt+V',
        preferences: {
          autoPauseEnabled: true,
          captureScreenshotEnabled: false
        },
        onPrimaryAction
      })
    ).toBe(true);

    const button = queryRequired<HTMLButtonElement>('[data-aiob-video-control-bar-button="true"]');
    const beforeOpen = readVideoControlBarGeometry({
      targetSelector: '.ytp-right-controls'
    });

    expect(beforeOpen.button?.parentMatchesTarget).toBe(true);
    expect(beforeOpen.button?.isFirstElementChild).toBe(true);
    expect(button.classList.contains('aiob-video-control-bar-button--youtube')).toBe(true);
    expect(document.querySelectorAll('#aiob-video-control-bar-button-style')).toHaveLength(1);
    expectPxWithin(beforeOpen.button?.computed.width ?? null, 31);
    expectPxWithin(beforeOpen.button?.computed.height ?? null, 31);
    expectPxWithin(beforeOpen.button?.computed.marginLeft ?? null, 8);
    expectPxWithin(beforeOpen.button?.computed.marginRight ?? null, 8);
    button.click();
    expect(onPrimaryAction).not.toHaveBeenCalled();

    const afterOpen = readVideoControlBarGeometry({
      targetSelector: '.ytp-right-controls'
    });
    expect(afterOpen.popover).not.toBeNull();
    expectPxWithin(afterOpen.popover?.computed.width ?? null, 220);
    expect(afterOpen.popover?.noteInputIsActive).toBe(true);
    expect(afterOpen.popover?.noteInputIsFirstFocusable).toBe(true);
    expect(afterOpen.popover?.focusableOrder).toEqual([
      'note-input',
      'toggle:autoPauseEnabled',
      'toggle:captureScreenshotEnabled'
    ]);
    expect(afterOpen.popover?.toggleOrder).toEqual([
      'autoPauseEnabled',
      'captureScreenshotEnabled'
    ]);

    const screenshotToggle = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '[data-aiob-video-control-bar-popover="true"] input[type="checkbox"]'
      )
    ).find((input) => input.dataset.preference === 'captureScreenshotEnabled');
    expect(screenshotToggle).toBeTruthy();
    screenshotToggle!.checked = true;
    screenshotToggle!.dispatchEvent(new Event('change', { bubbles: true }));

    const noteInput = document.querySelector<HTMLInputElement>(
      '[data-aiob-video-control-bar-note-input="true"]'
    );
    expect(noteInput).toBeTruthy();
    noteInput!.value = 'Control bar note';
    noteInput!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    expect(onPrimaryAction).toHaveBeenCalledWith(
      {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      {
        comment: 'Control bar note',
        source: 'note-input'
      }
    );
    expect(document.querySelector('[data-stitch-surface="video"]')).toBeTruthy();
  });

  it('keeps the Bilibili logo stable while danmaku nodes churn', () => {
    document.body.innerHTML =
      '<div class="bpx-player-control-bottom-right"></div><div class="bpx-player-render-dm-wrap"></div>';
    const onPrimaryAction = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      label: 'Clip video',
      shortcut: '',
      onPrimaryAction
    });

    const danmakuRoot = document.querySelector('.bpx-player-render-dm-wrap');
    for (let index = 0; index < 50; index += 1) {
      const dm = document.createElement('span');
      dm.className = 'bili-danmaku-x-dm';
      dm.textContent = `dm-${index}`;
      danmakuRoot?.appendChild(dm);
    }

    expect(document.querySelectorAll('[data-aiob-video-control-bar-button="true"]')).toHaveLength(
      1
    );
    const target = queryRequired<HTMLElement>('.bpx-player-control-bottom-right');
    const snapshot = readVideoControlBarGeometry({
      targetSelector: '.bpx-player-control-bottom-right'
    });
    const button = queryRequired<HTMLButtonElement>('[data-aiob-video-control-bar-button="true"]');
    expect(snapshot.button?.parentMatchesTarget).toBe(true);
    expect(snapshot.button?.isFirstElementChild).toBe(true);
    expect(target.firstElementChild).toBe(button);
    expect(button.classList.contains('aiob-video-control-bar-button--bilibili')).toBe(true);
    expect(document.querySelectorAll('#aiob-video-control-bar-button-style')).toHaveLength(1);
    expectPxWithin(snapshot.button?.computed.width ?? null, 25);
    expectPxWithin(snapshot.button?.computed.height ?? null, 25);
    expectPxWithin(snapshot.button?.computed.marginLeft ?? null, 6);
    expectPxWithin(snapshot.button?.computed.marginRight ?? null, 6);
    expectPxWithin(snapshot.button?.computed.translateY ?? null, -4);
    expect(findVideoControlTarget(document, 'https://www.bilibili.com/video/BV1abc/')).toBe(
      document.querySelector('.bpx-player-control-bottom-right')
    );
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  it('ignores text selection until the configured modifier is active', () => {
    const { range, selection } = createRangeSelection('Modifier selected text');
    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn((): Range | null => range),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => false),
      scheduleClear: vi.fn()
    };
    const onSelectionAccepted = vi.fn();
    const fragmentSelectionController = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
        getFragmentConfig: () => ({
          useFootnoteFormat: false,
          captureContext: true,
          contextLength: 100,
          contextMode: 'chars',
          selectionModifierEnabled: true,
          selectionModifierKeys: ['shift'],
          keyboardShortcutsEnabled: true
        }),
        getPlatformAdapter: () =>
          asType<VideoPlatformAdapter>({
            resolveSelection: vi.fn(() => ({
              text: 'Modifier selected text',
              html: '<p>Modifier selected text</p>',
              range
            }))
          })
      },
      { onSelectionAccepted }
    );
    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
      shouldTrackSelection: () => fragmentSelectionController.shouldTrackSelection(),
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => false,
      getDocumentSelection: () => selection,
      onSelectionActivated: (payload) =>
        fragmentSelectionController.processActivatedSelection(payload)
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(pendingSelection.capture).not.toHaveBeenCalled();
    expect(onSelectionAccepted).not.toHaveBeenCalled();

    fragmentSelectionController.handleKeyDown(new KeyboardEvent('keydown', { shiftKey: true }));
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true }));

    expect(pendingSelection.capture).toHaveBeenCalled();
    expect(onSelectionAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'Modifier selected text'
      })
    );
    controller.stop();
    removeVideoControlBarButton(document);
  });

  it('extracts nested Bilibili main and reply rich text from open shadow roots', () => {
    const { mainContent, mainRichText, replyContent, replyRichText } =
      mountNestedBilibiliCommentsFixture();
    const platform = new BilibiliVideoPlatform(createPlatformContext());

    const main = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event: createBilibiliMouseUp([
        mainContent.firstChild ?? mainContent,
        mainContent,
        mainRichText.shadowRoot!,
        mainRichText,
        document.body,
        document,
        window
      ])
    } as PlatformSelectionInput);
    expect(main?.text).toBe('Main fixture rich text');

    const reply = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event: createBilibiliMouseUp([
        replyContent.firstChild ?? replyContent,
        replyContent,
        replyRichText.shadowRoot!,
        replyRichText,
        document.body,
        document,
        window
      ])
    } as PlatformSelectionInput);
    expect(reply?.text).toBe('Reply @reply-user fixture rich text');
    expect(reply?.html).toContain('@reply-user');
  });
});
