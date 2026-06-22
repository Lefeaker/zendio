/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BilibiliVideoPlatform } from '@content/video/platforms/bilibiliPlatform';
import { BilibiliShadowObserver } from '@content/video/platforms/bilibiliPlatformObserver';
import * as bilibiliRestoreScope from '@content/video/platforms/bilibiliCommentRestoreScope';
import type { PlatformSelectionInput } from '@content/video/platforms';
import { createContext, mountBiliCommentWithRichText } from './bilibiliVideoPlatformFixtures';

describe('BilibiliVideoPlatform selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    vi.useRealTimers();
  });

  it('falls back to existing wrapper id when restoreHighlight cannot find text again', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-missing',
      comment: '',
      selectedText: 'missing text',
      selectedHtml: '<p>missing text</p>',
      fragmentUrl: 'https://example.com/#:~:text=missing',
      createdAt: 1,
      wrapperId: 'missing-wrapper'
    });

    expect(restored).toBe('missing-wrapper');
  });

  it('returns null when no bilibili selection text can be resolved', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    const result = platform.resolveSelection({
      range: null,
      selectedText: '   ',
      selectedHtml: '   '
    } as PlatformSelectionInput);

    expect(result).toBeNull();
    expect(platform.findTextRange('   ')).toBeNull();
  });

  it('searches observed Bilibili comment roots before unrelated document shadow roots', () => {
    const targetText = 'scoped restore target';
    const unrelatedHost = document.createElement('bili-avatar');
    const unrelatedRoot = unrelatedHost.attachShadow({ mode: 'open' });
    unrelatedRoot.innerHTML = `<span>${targetText}</span>`;
    document.body.append(unrelatedHost);

    const { commentsHost, content } = mountBiliCommentWithRichText(`<span>${targetText}</span>`);
    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };
    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(commentsHost);

    const range = platform.findTextRange(targetText);

    expect(range?.startContainer.getRootNode()).toBe(content.getRootNode());
    expect(range?.toString()).toBe(targetText);
  });

  it('checks observed comment roots before scoped restore fallback when shadow text is found', () => {
    const targetText = 'shadow-first restore target';
    const { commentsHost } = mountBiliCommentWithRichText(`<span>${targetText}</span>`);
    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };
    const observedSpy = vi.spyOn(
      BilibiliShadowObserver.prototype,
      'getObservedCommentRootsForSearch'
    );
    const fallbackSpy = vi.spyOn(bilibiliRestoreScope, 'collectBilibiliCommentRestoreRoots');

    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(commentsHost);
    const range = platform.findTextRange(targetText);

    expect(range?.toString()).toBe(targetText);
    expect(observedSpy).toHaveBeenCalled();
    expect(fallbackSpy).not.toHaveBeenCalled();

    observedSpy.mockRestore();
    fallbackSpy.mockRestore();
  });

  it('does not search unrelated nested shadow roots inside observed comment roots', () => {
    const targetText = 'nested unrelated shadow target';
    const { commentsHost, content } = mountBiliCommentWithRichText('<span>fixture comment</span>');
    const unrelatedHost = document.createElement('x-unrelated-shadow-host');
    const unrelatedRoot = unrelatedHost.attachShadow({ mode: 'open' });
    unrelatedRoot.innerHTML = `<span>${targetText}</span>`;
    content.append(unrelatedHost);

    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };
    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(commentsHost);

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('does not restore from unrelated page body text outside Bilibili comment regions', () => {
    const targetText = 'outside body restore target';
    document.body.innerHTML = `<main><p>${targetText}</p></main>`;
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('does not restore from unrelated page shadow roots outside Bilibili comment regions', () => {
    const targetText = 'outside shadow restore target';
    const host = document.createElement('section');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    document.body.append(host);
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('does not restore from unrelated bili-rich-text shadow roots outside Bilibili comment regions', () => {
    const targetText = 'outside rich text target';
    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    document.body.append(host);
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('restores from bili-rich-text shadow roots inside legacy Bilibili comment containers', () => {
    const targetText = 'inside legacy comment rich text target';
    const wrapper = document.createElement('div');
    wrapper.id = 'comment';
    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    wrapper.append(host);
    document.body.append(wrapper);
    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = platform.findTextRange(targetText);

    expect(range?.toString()).toBe(targetText);
  });

  it('returns undefined when restoreHighlight cannot resolve wrapper or text range', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const result = platform.restoreHighlight({
      id: 'missing-capture',
      fragmentUrl: '#missing-capture',
      selectedText: 'missing text',
      selectedHtml: '<p>missing text</p>',
      timestamp: 12,
      createdAt: Date.now()
    } as never);

    expect(result).toBeUndefined();
  });

  it('returns undefined when highlight or restore cannot resolve a fragment target', () => {
    const context = createContext(document);
    context.__mocks.highlightSelection.mockReturnValue(undefined);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const range = document.createRange();
    const textNode = document.createTextNode('orphan text');
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    expect(
      platform.highlight(range, 'capture-missing', 'https://example.com/#:~:text=missing')
    ).toBeUndefined();
    expect(
      platform.restoreHighlight({
        kind: 'fragment',
        id: 'fragment-none',
        comment: '',
        selectedText: 'still missing',
        selectedHtml: '<p>still missing</p>',
        fragmentUrl: 'https://example.com/#:~:text=still%20missing',
        createdAt: 1
      })
    ).toBeUndefined();
  });

  it('restores existing fragment wrappers by data attribute when wrapper id is missing', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockImplementation((selector: string) => {
      if (selector === 'mark[data-video-fragment-id="fragment-data-hit"]') {
        const wrapper = document.createElement('mark');
        wrapper.setAttribute('data-video-fragment-id', 'fragment-data-hit');
        return wrapper;
      }
      return null;
    });
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-data-hit',
      comment: '',
      selectedText: 'unused',
      selectedHtml: '<p>unused</p>',
      fragmentUrl: 'https://example.com/#:~:text=unused',
      createdAt: 1
    });

    expect(restored).toBe('fragment-data-hit-wrapper');
    expect(context.__mocks.decorateHighlight).toHaveBeenCalledTimes(1);
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalledTimes(1);
  });

  it('falls back to text-range restore when wrapper lookup misses but text exists', () => {
    document.body.innerHTML = '<div id="comment"><p>Recovered fragment text</p></div>';
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    context.__mocks.highlightSelection.mockReturnValue('restored-by-text');
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-text-hit',
      comment: '',
      selectedText: 'Recovered fragment text',
      selectedHtml: '<p>Recovered fragment text</p>',
      fragmentUrl: 'https://example.com/#:~:text=Recovered%20fragment%20text',
      wrapperId: 'missing-wrapper',
      createdAt: 1
    });

    expect(restored).toBe('restored-by-text');
    expect(context.__mocks.highlightSelection).toHaveBeenCalledTimes(1);
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalledTimes(1);
  });

  it('restores from observed comment roots before scoped restore fallback lookup', () => {
    const targetText = 'Observed comment root restore text';
    const { commentsHost } = mountBiliCommentWithRichText(`<span>${targetText}</span>`);
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    context.__mocks.highlightSelection.mockReturnValue('restored-from-shadow');

    const platform = new BilibiliVideoPlatform(context);
    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };
    const fallbackSpy = vi.spyOn(bilibiliRestoreScope, 'collectBilibiliCommentRestoreRoots');
    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(commentsHost);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-shadow-restore',
      comment: '',
      selectedText: targetText,
      selectedHtml: `<p>${targetText}</p>`,
      fragmentUrl:
        'https://www.bilibili.com/video/BV1/#:~:text=Observed%20comment%20root%20restore%20text',
      wrapperId: 'missing-shadow-wrapper',
      createdAt: 1
    });

    expect(restored).toBe('restored-from-shadow');
    expect(context.__mocks.highlightSelection).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).not.toHaveBeenCalled();

    fallbackSpy.mockRestore();
  });
});
