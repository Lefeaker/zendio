/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findVideoControlTarget,
  isIgnoredVideoMutationNode,
  observeVideoControlTarget
} from '@content/video/videoPromptObserver';

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

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

  it('disconnects after the control target is found', () => {
    const onTarget = vi.fn();
    const stop = observeVideoControlTarget({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      onTarget
    });

    const observer = TestMutationObserver.instances[0];
    const controls = document.createElement('div');
    controls.className = 'bpx-player-control-bottom-right';
    document.body.appendChild(controls);
    observer.callback(
      [{ addedNodes: [controls], type: 'childList' } as MutationRecord],
      observer as unknown as MutationObserver
    );

    expect(onTarget).toHaveBeenCalledWith(controls);
    expect(observer.disconnect).toHaveBeenCalled();
    stop();
  });
});
