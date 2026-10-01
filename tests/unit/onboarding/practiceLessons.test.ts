/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPracticeReaderLesson } from '../../../src/onboarding/practiceReaderLesson';
import { createPracticeVideoLesson } from '../../../src/onboarding/practiceVideoLesson';
import en from '../../../src/i18n/generated/locales/en.generated';
const messages = en.runtime;

function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error('Missing ' + selector);
  return node;
}
function panel(html: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

describe('practice navigation lessons', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });
  it('requires real document movement for both reader markers, not just clicks', () => {
    const root = panel(
      '<article data-role="highlight-item" data-highlight-id="first"><div data-role="session-item-marker"><span class="session-item-marker-index">1</span></div></article><article data-role="highlight-item" data-highlight-id="last"><div data-role="session-item-marker"><span class="session-item-marker-index">2</span></div></article><button data-action-id="reader:finish">Finish</button>'
    );
    const first = document.createElement('mark'),
      last = document.createElement('mark');
    first.dataset.readerHighlightId = 'first';
    last.dataset.readerHighlightId = 'last';
    document.body.append(first, last);
    let y = 1000;
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    first.getBoundingClientRect = () => new DOMRect(0, 100 - y, 300, 24);
    last.getBoundingClientRect = () => new DOMRect(0, 1200 - y, 300, 24);
    try {
      const lesson = createPracticeReaderLesson(messages);
      const firstMarker = required<HTMLElement>(root, '.session-item-marker-index');
      const lastMarker = required<HTMLElement>(
        root,
        '[data-highlight-id="last"] .session-item-marker-index'
      );
      expect(lesson.read(root).hint?.target).toBe(firstMarker);
      lesson.onClick(firstMarker);
      expect(lesson.read(root).hint?.target).toBe(firstMarker);
      y = 0;
      expect(lesson.read(root).hint?.target).toBe(lastMarker);
      lesson.onClick(lastMarker);
      expect(lesson.read(root).step.phase).toBe('navigate');
      y = 1000;
      expect(lesson.read(root).step.phase).toBe('ready');
      root.querySelector('[data-highlight-id="last"]')?.remove();
      expect(lesson.read(root).step.phase).toBe('reading');
    } finally {
      if (original) Object.defineProperty(window, 'scrollY', original);
    }
  });
  it('waits for real seeks and completed on/off states; pending or failed toggles cannot finish the lesson', () => {
    const root = panel(
      '<article data-capture-id="a"><div class="video-timestamp-marker"><button data-action-id="video:toggle-screenshot" data-capture-id="a" data-screenshot-state="off"></button><span class="session-item-marker-time">00:03</span></div></article><article data-capture-id="b"><div class="video-timestamp-marker"><span class="session-item-marker-time">00:12</span></div></article><button data-action-id="video:finish">Finish</button>'
    );
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2 });
    video.currentTime = 12;
    const lesson = createPracticeVideoLesson(video, messages);
    const first = required<HTMLElement>(root, '[data-capture-id="a"] .session-item-marker-time');
    const last = required<HTMLElement>(root, '[data-capture-id="b"] .session-item-marker-time');
    lesson.onClick(first);
    expect(lesson.read(root).step.index).toBe(2);
    video.currentTime = 3;
    expect(lesson.read(root).hint?.target).toBe(last);
    lesson.onClick(last);
    video.currentTime = 12;
    expect(lesson.read(root).step.index).toBe(3);
    const toggle = required<HTMLElement>(root, '[data-action-id="video:toggle-screenshot"]');
    lesson.onClick(toggle);
    toggle.dataset.screenshotState = 'pending';
    expect(lesson.read(root).step.index).toBe(3);
    toggle.dataset.screenshotState = 'off';
    expect(lesson.read(root).step.index).toBe(3);
    lesson.onClick(toggle);
    toggle.dataset.screenshotState = 'on';
    lesson.read(root);
    lesson.onClick(toggle);
    toggle.dataset.screenshotState = 'off';
    expect(lesson.read(root).step.index).toBe(4);
    lesson.onClick(toggle);
    toggle.dataset.screenshotState = 'pending';
    expect(lesson.read(root).step.index).toBe(4);
    toggle.dataset.screenshotState = 'on';
    expect(lesson.read(root).step.index).toBe(5);
    expect(video.currentTime).toBe(12);
  });
});
