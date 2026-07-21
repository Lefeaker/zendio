/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StyleAttachmentHandle } from '@ui/foundation/style-host';
import {
  DEFAULT_HIGHLIGHT_THEME,
  FragmentHighlighter,
  resolveHighlightTheme
} from '@content/video/fragmentHighlighter';

type HighlightStyleRegistration = {
  root: WeakRef<ShadowRoot>;
  handle: StyleAttachmentHandle;
};

function getStyleRegistrations(highlighter: FragmentHighlighter): HighlightStyleRegistration[] {
  return Reflect.get(highlighter, 'shadowHighlightStyles') as HighlightStyleRegistration[];
}

describe('FragmentHighlighter', () => {
  afterEach(() => {
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    document.body.innerHTML = '';
  });

  it('falls back to the default theme for unknown values', () => {
    expect(resolveHighlightTheme('mystery')).toBe(DEFAULT_HIGHLIGHT_THEME);
  });

  it('highlights a range, decorates the wrapper, and can remove it again', () => {
    document.body.innerHTML = '<p id="root">Hello world</p>';
    const textNode = document.getElementById('root')?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('expected text node');
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);

    const highlighter = new FragmentHighlighter(document);
    const wrapperId = highlighter.highlightRange(range, 'capture-1', 'https://example.com/#frag');
    if (!wrapperId) {
      throw new Error('Expected wrapper id');
    }

    const wrapper = document.getElementById(wrapperId);
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toBe('world');
    expect(wrapper?.classList.contains('aiob-video-fragment-highlight')).toBe(true);

    highlighter.removeById(wrapperId);
    expect(document.getElementById('capture-1-wrapper')).toBeNull();
    expect(document.getElementById('root')?.textContent).toBe('Hello world');
  });

  it('decorates and resolves elements inside shadow roots', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<mark id="deep-highlight"></mark>';

    const highlighter = new FragmentHighlighter(document);
    highlighter.decorateById('deep-highlight');
    await getStyleRegistrations(highlighter)[0]?.handle.ready;

    const deep = shadow.getElementById('deep-highlight');
    expect(deep?.classList.contains('aiob-reader-highlight')).toBe(true);
    expect(shadow.querySelector('style')?.textContent).toContain(
      'aiob-video-shadow-highlight-focus'
    );
  });

  it('keeps solid highlight themes visible inside shadow roots', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('mark');
    shadow.appendChild(inner);

    const highlighter = new FragmentHighlighter(document);
    highlighter.setTheme('neonOrange');
    highlighter.decorateElement(inner);
    await getStyleRegistrations(highlighter)[0]?.handle.ready;

    const styleText = shadow.querySelector('style')?.textContent ?? '';
    expect(styleText).toContain('background: var(--reader-highlight-bg');
    expect(styleText).toContain('!important');
    expect(styleText).not.toContain('background-color: transparent');
  });

  it('refreshes or removes shadow styles based on host connectivity', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('span');
    shadow.appendChild(inner);

    const highlighter = new FragmentHighlighter(document);
    highlighter.decorateElement(inner);
    await getStyleRegistrations(highlighter)[0]?.handle.ready;
    const style = shadow.querySelector('style');
    expect(style).toBeTruthy();

    highlighter.setTheme('purple');
    expect(document.body.dataset.aiobReaderHighlight).toBe('purple');
    expect(style?.textContent).toContain('aiob-reader-highlight');

    host.remove();
    highlighter.refreshShadowHighlightStyles();
    expect(style?.isConnected).toBe(false);
  });

  it('stores only weak root references and disposes one reused handle exactly once', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const highlighter = new FragmentHighlighter(document);

    highlighter.ensureHighlightStyles(shadow);
    const [registration] = getStyleRegistrations(highlighter);
    if (!registration) throw new Error('style registration missing');
    await registration.handle.ready;
    const dispose = vi.spyOn(registration.handle, 'dispose');
    highlighter.ensureHighlightStyles(shadow);

    expect(getStyleRegistrations(highlighter)).toHaveLength(1);
    expect(registration.root).toBeInstanceOf(WeakRef);
    expect(registration.root.deref()).toBe(shadow);
    highlighter.reset();
    highlighter.reset();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(shadow.querySelector('[data-aiob-style-bridge="video-fragment-highlight"]')).toBeNull();
  });

  it('clears document theme state on reset', () => {
    const highlighter = new FragmentHighlighter(document);
    highlighter.setTheme('neonGreen');
    expect(document.body.dataset.aiobReaderHighlight).toBe('neonGreen');

    highlighter.reset();
    expect(document.body.dataset.aiobReaderHighlight).toBeUndefined();
  });
});
