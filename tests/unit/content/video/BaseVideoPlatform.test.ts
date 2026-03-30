/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import type { VideoFragmentCapture } from '@content/video/types';
import {
  BaseVideoPlatform,
  type VideoPlatformContext
} from '@content/video/platforms/baseVideoPlatform';

function createContext(doc: Document): VideoPlatformContext {
  return {
    doc,
    highlightSelection: vi.fn(() => 'generated-wrapper'),
    decorateHighlight: vi.fn(),
    scheduleFragmentHighlightRestore: vi.fn(),
    getElementByIdDeep: vi.fn(() => null),
    querySelectorDeep: <T extends Element>(_selector: string): T | null => null,
    observeWithFragmentObserver: vi.fn(),
    registerShadowSelectionBridge: vi.fn(),
    ensureHighlightStyles: vi.fn()
  };
}

function createCapture(id: string, wrapperId?: string): VideoFragmentCapture {
  return {
    id,
    kind: 'fragment',
    selectedText: 'Selected text',
    selectedHtml: '<p>Selected text</p>',
    comment: '',
    fragmentUrl: 'https://example.com/#frag',
    wrapperId,
    createdAt: Date.now()
  };
}

describe('BaseVideoPlatform', () => {
  it('normalizes plain-text selection into html and keeps the provided range', () => {
    const context = createContext(document);
    const platform = new BaseVideoPlatform('bilibili', context);
    const range = document.createRange();

    const result = platform.resolveSelection({
      range,
      selectedText: '  hello   world  ',
      selectedHtml: ''
    });

    expect(result).toEqual({
      text: 'hello world',
      html: '<p>hello world</p>',
      range
    });
  });

  it('returns null when normalized selection text is empty', () => {
    const platform = new BaseVideoPlatform('youtube', createContext(document));
    expect(platform.resolveSelection({ range: null, selectedText: '   ', selectedHtml: '' })).toBeNull();
  });

  it('restores an existing wrapper by id and decorates it', () => {
    const wrapper = document.createElement('mark');
    wrapper.id = 'frag-1-wrapper';
    const context = createContext(document);
    const decorateHighlight = vi.fn();
    const scheduleFragmentHighlightRestore = vi.fn();
    context.getElementByIdDeep = vi.fn(() => wrapper);
    context.decorateHighlight = decorateHighlight;
    context.scheduleFragmentHighlightRestore = scheduleFragmentHighlightRestore;
    const platform = new BaseVideoPlatform('bilibili', context);

    const restored = platform.restoreHighlight(createCapture('frag-1', 'frag-1-wrapper'));

    expect(restored).toBe('frag-1-wrapper');
    expect(decorateHighlight).toHaveBeenCalledWith(wrapper);
    expect(scheduleFragmentHighlightRestore).toHaveBeenCalled();
  });

  it('restores an existing wrapper by fragment data attribute when wrapper id is missing', () => {
    const wrapper = document.createElement('mark');
    const context = createContext(document);
    const decorateHighlight = vi.fn();
    context.querySelectorDeep = <T extends Element>(_selector: string): T | null => wrapper as unknown as T;
    context.decorateHighlight = decorateHighlight;
    const platform = new BaseVideoPlatform('bilibili', context);

    const restored = platform.restoreHighlight(createCapture('frag-2'));

    expect(restored).toBe('frag-2-wrapper');
    expect(wrapper.id).toBe('frag-2-wrapper');
    expect(decorateHighlight).toHaveBeenCalledWith(wrapper);
  });

  it('finds a range and highlights when no existing wrapper is found', () => {
    const context = createContext(document);
    const scheduleFragmentHighlightRestore = vi.fn();
    context.scheduleFragmentHighlightRestore = scheduleFragmentHighlightRestore;
    const platform = new BaseVideoPlatform('youtube', context);
    const range = document.createRange();
    const findSpy = vi.spyOn(platform, 'findTextRange').mockReturnValue(range);
    const highlightSpy = vi.spyOn(platform, 'highlight').mockReturnValue('fresh-wrapper');

    const restored = platform.restoreHighlight(createCapture('frag-3'));

    expect(findSpy).toHaveBeenCalledWith('Selected text');
    expect(highlightSpy).toHaveBeenCalledWith(range, 'frag-3', 'https://example.com/#frag');
    expect(restored).toBe('fresh-wrapper');
    expect(scheduleFragmentHighlightRestore).toHaveBeenCalled();
  });
});
