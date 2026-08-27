/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  VideoSessionState,
  buildVideoHintContext,
  partitionVideoPanelCaptures
} from '@content/video/sessionState';

describe('VideoSessionState helpers', () => {
  it('derives hint context from video and capture availability', () => {
    const state = new VideoSessionState('gradient');
    expect(buildVideoHintContext(state)).toEqual({ videoAvailable: false, hasCaptures: false });

    state.videoElement = document.createElement('video');
    state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 9,
        comment: '',
        url: 'https://video.example/watch?t=9',
        createdAt: 1
      }
    ];

    expect(buildVideoHintContext(state)).toEqual({ videoAvailable: true, hasCaptures: true });
  });

  it('partitions timestamps and orders fragments by document position with createdAt fallback', () => {
    document.body.innerHTML = '<main><mark id="frag-b"></mark><mark id="frag-a"></mark></main>';
    const state = new VideoSessionState('gradient');
    state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-2',
        timeSec: 20,
        comment: '',
        url: 'https://video.example/watch?t=20',
        createdAt: 20
      },
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 10,
        comment: '',
        url: 'https://video.example/watch?t=10',
        createdAt: 10
      },
      {
        kind: 'fragment',
        id: 'fragment-a',
        comment: '',
        selectedText: 'A',
        selectedHtml: '<p>A</p>',
        fragmentUrl: 'https://video.example/watch#:~:text=A',
        wrapperId: 'frag-a',
        createdAt: 30
      },
      {
        kind: 'fragment',
        id: 'fragment-b',
        comment: '',
        selectedText: 'B',
        selectedHtml: '<p>B</p>',
        fragmentUrl: 'https://video.example/watch#:~:text=B',
        wrapperId: 'frag-b',
        createdAt: 40
      },
      {
        kind: 'fragment',
        id: 'fragment-c',
        comment: '',
        selectedText: 'C',
        selectedHtml: '<p>C</p>',
        fragmentUrl: 'https://video.example/watch#:~:text=C',
        createdAt: 5
      }
    ];

    const groups = partitionVideoPanelCaptures(state.captures, (capture) => {
      if (!capture.wrapperId) {
        return null;
      }
      return document.getElementById(capture.wrapperId);
    });

    expect(groups.timestamps.map((capture) => capture.id)).toEqual(['timestamp-1', 'timestamp-2']);
    expect(groups.fragments.map((capture) => capture.id)).toEqual([
      'fragment-b',
      'fragment-a',
      'fragment-c'
    ]);
  });

  it('orders fragment marks across sibling nested ShadowRoots by their host chain', () => {
    const thread = document.createElement('x-thread');
    document.body.replaceChildren(thread);
    const threadRoot = thread.attachShadow({ mode: 'open' });
    const mainHost = document.createElement('x-main-comment');
    const replyHost = document.createElement('x-reply-comment');
    threadRoot.append(mainHost, replyHost);
    const mainMark = document.createElement('mark');
    const replyMark = document.createElement('mark');
    mainHost.attachShadow({ mode: 'open' }).append(mainMark);
    replyHost.attachShadow({ mode: 'open' }).append(replyMark);

    const captures = [createFragment('reply', 20), createFragment('main', 10)];
    const elements = new Map([
      ['main', mainMark],
      ['reply', replyMark]
    ]);

    const groups = partitionVideoPanelCaptures(
      captures,
      (capture) => elements.get(capture.id) ?? null
    );

    expect(mainMark.compareDocumentPosition(replyMark) & Node.DOCUMENT_POSITION_DISCONNECTED).toBe(
      Node.DOCUMENT_POSITION_DISCONNECTED
    );
    expect(groups.fragments.map((capture) => capture.id)).toEqual(['main', 'reply']);
  });

  it('falls back deterministically for fragment marks without a shared host chain', () => {
    const firstHost = document.createElement('x-detached-first');
    const secondHost = document.createElement('x-detached-second');
    const firstMark = document.createElement('mark');
    const secondMark = document.createElement('mark');
    firstHost.attachShadow({ mode: 'open' }).append(firstMark);
    secondHost.attachShadow({ mode: 'open' }).append(secondMark);
    const captures = [createFragment('later', 20), createFragment('earlier', 10)];
    const elements = new Map([
      ['earlier', firstMark],
      ['later', secondMark]
    ]);

    const groups = partitionVideoPanelCaptures(
      captures,
      (capture) => elements.get(capture.id) ?? null
    );

    expect(groups.fragments.map((capture) => capture.id)).toEqual(['earlier', 'later']);
  });
});

function createFragment(id: string, createdAt: number) {
  return {
    kind: 'fragment' as const,
    id,
    comment: '',
    selectedText: id,
    selectedHtml: `<p>${id}</p>`,
    fragmentUrl: `https://video.example/watch#:~:text=${id}`,
    createdAt
  };
}
