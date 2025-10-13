/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { applyReadingTemplateControls, collectReadingTemplateValue } from '../../src/options/components/readingTemplateControls';

const ARTICLE_DEFAULT = 'Articles/{domain}/{yyyy}/{slug}.md';
const FRAGMENT_DEFAULT = 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';
const READING_DEFAULT = 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';

function setupDom(): void {
  document.body.innerHTML = `
    <input id="tplArticle" value="${ARTICLE_DEFAULT}" />
    <input id="tplFragment" value="${FRAGMENT_DEFAULT}" />
    <select id="tplReadingMode">
      <option value="article">article</option>
      <option value="fragment">fragment</option>
      <option value="custom">custom</option>
    </select>
    <input id="tplReadingCustom" />
  `;
}

describe('reading template controls', () => {
  it('reflects article mode when template matches article path', () => {
    setupDom();

    applyReadingTemplateControls({
      template: ARTICLE_DEFAULT,
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    });

    const mode = document.getElementById('tplReadingMode') as HTMLSelectElement;
    const input = document.getElementById('tplReadingCustom') as HTMLInputElement;

    expect(mode.value).toBe('article');
    expect(input.disabled).toBe(true);
    expect(input.value).toBe(ARTICLE_DEFAULT);
  });

  it('keeps custom template persisted when toggling modes', () => {
    setupDom();

    applyReadingTemplateControls({
      template: 'Custom/{slug}.md',
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    });

    const mode = document.getElementById('tplReadingMode') as HTMLSelectElement;
    const input = document.getElementById('tplReadingCustom') as HTMLInputElement;
    const articleInput = document.getElementById('tplArticle') as HTMLInputElement;

    expect(mode.value).toBe('custom');
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('Custom/{slug}.md');

    mode.value = 'article';
    mode.dispatchEvent(new Event('change'));
    expect(input.disabled).toBe(true);
    expect(input.value).toBe(ARTICLE_DEFAULT);

    articleInput.value = 'Articles/{domain}/{yyyy}/{slug}-updated.md';
    articleInput.dispatchEvent(new Event('input'));
    expect(input.value).toBe('Articles/{domain}/{yyyy}/{slug}-updated.md');

    mode.value = 'custom';
    mode.dispatchEvent(new Event('change'));
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('Custom/{slug}.md');
  });

  it('collects template value based on selected mode', () => {
    setupDom();

    applyReadingTemplateControls({
      template: ARTICLE_DEFAULT,
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    });

    const mode = document.getElementById('tplReadingMode') as HTMLSelectElement;
    const input = document.getElementById('tplReadingCustom') as HTMLInputElement;

    expect(collectReadingTemplateValue({
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    })).toBe(ARTICLE_DEFAULT);

    mode.value = 'fragment';
    mode.dispatchEvent(new Event('change'));
    expect(collectReadingTemplateValue({
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    })).toBe(FRAGMENT_DEFAULT);

    mode.value = 'custom';
    mode.dispatchEvent(new Event('change'));
    input.value = 'Reading/{yyyy}/{slug}.md';
    input.dispatchEvent(new Event('input'));
    expect(collectReadingTemplateValue({
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    })).toBe('Reading/{yyyy}/{slug}.md');
  });
});
