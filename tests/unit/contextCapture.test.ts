/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractContextFromRange } from '../../src/content/clipper/services/contextCapture';
import { resolveContextRange, collectListPath } from '../../src/content/clipper/shared/contextDom';
import type { FragmentClipperOptions } from '../../src/shared/types/options';

describe('contextCapture services', () => {
  const baseConfig: FragmentClipperOptions = {
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: []
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <ul>
        <li>Intro</li>
        <li>
          Parent item
          <ul>
            <li id="target">Highlighted <strong>section</strong></li>
            <li>Sibling</li>
          </ul>
        </li>
        <li>Outro</li>
      </ul>
    `;
  });

  it('resolves selection ranges and collects list ancestry', () => {
    const target = document.getElementById('target');
    if (!target) throw new Error('missing target element');

    const range = document.createRange();
    range.selectNodeContents(target);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const resolved = resolveContextRange(selection);
    const listPath = resolved ? collectListPath(resolved) : [];

    expect(resolved).not.toBeNull();
    expect(resolved?.toString().trim()).toContain('Highlighted');
    expect(listPath.length).toBe(2);
  });

  it('extracts surrounding context when enabled', () => {
    const strong = document.querySelector('#target strong');
    if (!strong) throw new Error('missing strong element');

    const range = document.createRange();
    range.selectNodeContents(strong);

    const config: FragmentClipperOptions = {
      ...baseConfig,
      captureContext: true
    };

    const result = extractContextFromRange(range, config);

    expect(result).not.toBeNull();
    expect(result?.selectedText.trim()).toBe('section');
    expect(result?.beforeHtml).toMatch(/Parent item/i);
  });

  it('returns null when captureContext is disabled', () => {
    const strong = document.querySelector('#target strong');
    if (!strong) throw new Error('missing strong element');

    const range = document.createRange();
    range.selectNodeContents(strong);

    const config: FragmentClipperOptions = {
      ...baseConfig,
      captureContext: false,
      contextLength: 40
    };

    const result = extractContextFromRange(range, config);
    expect(result).toBeNull();
  });

  it('limits collected context by configured length', () => {
    document.body.innerHTML = `
      <article>
        <p class="before">Alpha Bravo Charlie Delta Echo Foxtrot Golf</p>
        <p>
          <span id="select">Hotel India</span>
        </p>
        <p class="after">Juliet Kilo Lima Mike November Oscar</p>
      </article>
    `;

    const span = document.getElementById('select');
    if (!span) throw new Error('missing span');

    const range = document.createRange();
    range.selectNodeContents(span);

    const config: FragmentClipperOptions = {
      ...baseConfig,
      captureContext: true,
      contextLength: 20
    };

    const result = extractContextFromRange(range, config);
    expect(result).not.toBeNull();
    expect(result?.beforeHtml).toMatch(/Alpha Bravo/);
    expect(result?.afterHtml).toBe('');
  });

  it('collects context across nested structure including siblings and ancestors', () => {
    document.body.innerHTML = `
      <article>
        <header><h1>Heading</h1></header>
        <section>
          <p class="intro">Intro paragraph before selection.</p>
          <div>
            <p>Wrapper <em id="spot">target text</em> end.</p>
          </div>
        </section>
        <section>
          <blockquote>After blockquote content.</blockquote>
        </section>
      </article>
    `;

    const target = document.getElementById('spot');
    if (!target) throw new Error('missing selection node');

    const range = document.createRange();
    range.selectNodeContents(target);

    const config: FragmentClipperOptions = {
      ...baseConfig,
      captureContext: true,
      contextLength: 120
    };

    const result = extractContextFromRange(range, config);
    expect(result).not.toBeNull();
    expect(result?.beforeHtml).toMatch(/Intro paragraph/i);
    expect(result?.afterHtml).toMatch(/After blockquote content/i);
  });

  it('handles shadow DOM selections without errors', () => {
    const host = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <section>
        <p class="pre">Shadow intro</p>
        <p>Shadow <span id="shadow-text">selection</span> context.</p>
      </section>
    `;

    const target = shadow.getElementById('shadow-text');
    if (!target) throw new Error('missing shadow selection node');

    const range = document.createRange();
    range.selectNodeContents(target);

    const config: FragmentClipperOptions = {
      ...baseConfig,
      captureContext: true,
      contextLength: 80
    };

    expect(() => extractContextFromRange(range, config)).not.toThrow();
    const result = extractContextFromRange(range, config);
    expect(result?.beforeHtml).toMatch(/Shadow intro/);
  });
});
