/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findVideoControlTarget,
  isIgnoredVideoMutationNode,
  observeVideoControlTarget
} from '@content/video/videoPromptObserver';

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];
  public readonly observe = vi.fn((target: Node, options?: MutationObserverInit) => {
    this.observeTarget = target;
    this.observeOptions = options;
  });
  public readonly disconnect = vi.fn();
  public observeTarget: Node | null = null;
  public observeOptions: MutationObserverInit | undefined;

  constructor(public readonly callback: MutationCallback) {
    TestMutationObserver.instances.push(this);
  }
}

describe('videoPromptObserver scoped control targets', () => {
  const originalObserver = globalThis.MutationObserver;

  beforeEach(() => {
    TestMutationObserver.instances = [];
    // @ts-expect-error test shim
    globalThis.MutationObserver = TestMutationObserver;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    globalThis.MutationObserver = originalObserver;
  });

  it('finds YouTube and Bilibili control targets without scanning danmaku', () => {
    document.body.innerHTML = '<div class="ytp-right-controls"></div>';
    expect(findVideoControlTarget(document, 'https://www.youtube.com/watch?v=abc')).toBeTruthy();

    document.body.innerHTML = '<div class="bpx-player-control-bottom-right"></div>';
    expect(findVideoControlTarget(document, 'https://www.bilibili.com/video/BV1abc/')).toBeTruthy();

    document.body.innerHTML =
      '<div class="bpx-player-render-dm-wrap"><span class="bili-danmaku-x-dm">dm</span></div>';
    expect(findVideoControlTarget(document, 'https://www.bilibili.com/video/BV1abc/')).toBeNull();
  });

  it('classifies Bilibili danmaku nodes as ignored dynamic regions', () => {
    document.body.innerHTML =
      '<div class="bpx-player-render-dm-wrap"><span class="bili-danmaku-x-dm">dm</span></div>';
    const dm = document.querySelector('.bili-danmaku-x-dm');
    expect(dm).toBeTruthy();
    expect(isIgnoredVideoMutationNode(dm)).toBe(true);
  });

  it('observes a YouTube player root instead of body or documentElement while waiting for controls', () => {
    document.body.innerHTML = '<div id="movie_player"><div class="ytp-chrome-bottom"></div></div>';

    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc',
      onTarget: vi.fn()
    });

    const observer = TestMutationObserver.instances[0];
    expect(observer.observeTarget).toBe(document.getElementById('movie_player'));
    expect(observer.observeTarget).not.toBe(document.body);
    expect(observer.observeTarget).not.toBe(document.documentElement);
    expect(observer.observeOptions).toEqual(expect.objectContaining({ childList: true }));
    stop();
  });

  it('observes a Bilibili player root instead of body or documentElement while waiting for controls', () => {
    document.body.innerHTML =
      '<div class="bpx-player-container"><div class="bpx-player-video-wrap"></div></div>';

    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      onTarget: vi.fn()
    });

    const observer = TestMutationObserver.instances[0];
    expect(observer.observeTarget).toBe(document.querySelector('.bpx-player-container'));
    expect(observer.observeTarget).not.toBe(document.body);
    expect(observer.observeTarget).not.toBe(document.documentElement);
    expect(observer.observeOptions).toEqual(expect.objectContaining({ childList: true }));
    stop();
  });

  it('does not create a whole-document observer when no bounded player root is available', () => {
    document.body.innerHTML = '<main><aside class="recommendations"></aside></main>';

    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      onTarget: vi.fn()
    });

    expect(TestMutationObserver.instances).toHaveLength(0);
    stop();
  });

  it('disconnects after the control target is found', () => {
    document.body.innerHTML = '<div class="bpx-player-container"></div>';
    const root = document.querySelector('.bpx-player-container');
    const onTarget = vi.fn();
    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      onTarget
    });

    const observer = TestMutationObserver.instances[0];
    const controls = document.createElement('div');
    controls.className = 'bpx-player-control-bottom-right';
    root?.appendChild(controls);
    observer.callback(
      [{ addedNodes: [controls], type: 'childList' } as unknown as MutationRecord],
      observer as unknown as MutationObserver
    );

    expect(onTarget).toHaveBeenCalledWith(controls);
    expect(observer.disconnect).toHaveBeenCalled();
    stop();
  });
});
