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
});
