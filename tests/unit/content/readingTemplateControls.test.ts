/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { createReadingTemplateController } from '@options/components/controls/readingTemplateControls';

const ARTICLE_DEFAULT = 'Articles/{domain}/{yyyy}/{slug}.md';
const FRAGMENT_DEFAULT = 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';
const READING_DEFAULT = 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';

function createController() {
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

  const articleInput = document.getElementById('tplArticle') as HTMLInputElement;
  const fragmentInput = document.getElementById('tplFragment') as HTMLInputElement;
  const modeSelect = document.getElementById('tplReadingMode') as HTMLSelectElement;
  const customInput = document.getElementById('tplReadingCustom') as HTMLInputElement;

  const controller = createReadingTemplateController(
    {
      articleInput,
      fragmentInput,
      modeSelect,
      customInput
    },
    {
      defaultTemplate: READING_DEFAULT,
      articleDefault: ARTICLE_DEFAULT,
      fragmentDefault: FRAGMENT_DEFAULT
    }
  );

  return { controller, articleInput, fragmentInput, modeSelect, customInput };
}

describe('reading template controls', () => {
  it('reflects article mode when template matches article path', () => {
    const { controller, modeSelect, customInput } = createController();
    controller.apply(ARTICLE_DEFAULT);

    expect(modeSelect.value).toBe('article');
    expect(customInput.disabled).toBe(true);
    expect(customInput.value).toBe(ARTICLE_DEFAULT);
    controller.dispose();
  });

  it('keeps custom template persisted when toggling modes', () => {
    const { controller, modeSelect, customInput, articleInput } = createController();
    controller.apply('Custom/{slug}.md');

    expect(modeSelect.value).toBe('custom');
    expect(customInput.disabled).toBe(false);
    expect(customInput.value).toBe('Custom/{slug}.md');

    modeSelect.value = 'article';
    modeSelect.dispatchEvent(new Event('change'));
    expect(customInput.disabled).toBe(true);
    expect(customInput.value).toBe(ARTICLE_DEFAULT);

    articleInput.value = 'Articles/{domain}/{yyyy}/{slug}-updated.md';
    articleInput.dispatchEvent(new Event('input'));
    expect(customInput.value).toBe('Articles/{domain}/{yyyy}/{slug}-updated.md');

    modeSelect.value = 'custom';
    modeSelect.dispatchEvent(new Event('change'));
    expect(customInput.disabled).toBe(false);
    expect(customInput.value).toBe('Custom/{slug}.md');
    controller.dispose();
  });

  it('collects template value based on selected mode', () => {
    const { controller, modeSelect, customInput } = createController();
    controller.apply(ARTICLE_DEFAULT);

    expect(controller.collect()).toBe(ARTICLE_DEFAULT);

    modeSelect.value = 'fragment';
    modeSelect.dispatchEvent(new Event('change'));
    expect(controller.collect()).toBe(FRAGMENT_DEFAULT);

    modeSelect.value = 'custom';
    modeSelect.dispatchEvent(new Event('change'));
    customInput.value = 'Reading/{yyyy}/{slug}.md';
    customInput.dispatchEvent(new Event('input'));
    expect(controller.collect()).toBe('Reading/{yyyy}/{slug}.md');
    controller.dispose();
  });
});
