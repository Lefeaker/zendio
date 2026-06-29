/* @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { createDomBindingAdapter } from '../../../src/i18n/adapters/domBindingAdapter';
import { createI18nResource } from '../../../src/i18n/resource';
import { loadLocaleMessages, type Messages } from '../../../src/i18n/locales';

async function createEnglishResource(overrides: Partial<Messages> = {}) {
  const enMessages = await loadLocaleMessages('en');
  return createI18nResource({
    language: 'en',
    messages: {
      ...enMessages,
      ...overrides
    },
    fallbackChain: [enMessages]
  });
}

describe('htmlBindingSafety', () => {
  it('renders allowlisted contact modal rich HTML safely', async () => {
    const adapter = createDomBindingAdapter();
    const element = document.createElement('div');

    adapter.bindHtml(element, 'contactModalDescription');
    adapter.refresh(await createEnglishResource());

    const link = element.querySelector('a');
    expect(element.querySelector('br')).not.toBeNull();
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toMatch(/^https:/);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('renders allowlisted rich HTML without template innerHTML parsing', async () => {
    const adapter = createDomBindingAdapter();
    const element = document.createElement('div');
    const nativeCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    createElementSpy.mockImplementation(function (
      this: Document,
      tagName: string,
      options?: ElementCreationOptions
    ): HTMLElement {
      if (tagName.toLowerCase() === 'template') {
        throw new Error('rich HTML rendering must not use template.innerHTML');
      }
      return nativeCreateElement.call(this, tagName, options) as HTMLElement;
    } as typeof document.createElement);

    try {
      adapter.bindHtml(element, 'contactModalDescription');
      adapter.refresh(
        await createEnglishResource({
          contactModalDescription:
            'Reach <strong>out</strong><br><a href="https://example.com" target="_blank">online</a>'
        })
      );

      expect(element.querySelector('strong')?.textContent).toBe('out');
      expect(element.querySelector('br')).not.toBeNull();
      expect(element.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('blocks script tags event handlers and javascript urls in allowlisted rich HTML keys', async () => {
    const adapter = createDomBindingAdapter();
    const element = document.createElement('div');

    adapter.bindHtml(element, 'contactModalDescription');
    adapter.refresh(
      await createEnglishResource({
        contactModalDescription:
          'Before<script>alert(1)</script><a href="javascript:alert(2)" onclick="alert(3)">bad</a><strong onclick="alert(4)">bold</strong><em>safe</em><a href="https://example.com" onmouseover="alert(5)">good</a>After'
      })
    );

    expect(element.querySelector('script')).toBeNull();
    expect(
      Array.from(element.querySelectorAll('*')).every((node) =>
        node.getAttributeNames().every((name) => !name.startsWith('on'))
      )
    ).toBe(true);
    expect(
      Array.from(element.querySelectorAll('a')).map((node) => node.getAttribute('href'))
    ).toEqual(['https://example.com']);
    expect(element.textContent).toContain('Before');
    expect(element.textContent).toContain('bad');
    expect(element.textContent).toContain('bold');
    expect(element.textContent).toContain('safe');
    expect(element.textContent).toContain('good');
    expect(element.textContent).toContain('After');
  });

  it('renders unallowlisted HTML keys as plain text', async () => {
    const adapter = createDomBindingAdapter();
    const element = document.createElement('div');

    adapter.bindHtml(element, 'supportModalDescription');
    adapter.refresh(
      await createEnglishResource({
        supportModalDescription: 'Support <a href="https://example.com">the project</a>'
      })
    );

    expect(element.querySelector('a')).toBeNull();
    expect(element.innerHTML).toContain('&lt;a');
    expect(element.textContent).toContain('Support');
    expect(element.textContent).toContain('the project');
  });
});
