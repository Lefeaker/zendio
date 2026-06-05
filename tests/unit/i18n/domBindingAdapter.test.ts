/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
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

describe('domBindingAdapter', () => {
  it('binds elements and updates on refresh', async () => {
    const adapter = createDomBindingAdapter();

    const element = {
      textContent: '',
      dataset: {} as DOMStringMap,
      setAttribute(_name: string, _value: string) {
        // no-op
      }
    } as unknown as HTMLElement;

    const input = {
      placeholder: '',
      dataset: {} as DOMStringMap,
      setAttribute(this: { placeholder: string }, name: string, value: string) {
        if (name === 'placeholder') {
          this.placeholder = value;
        }
      }
    } as unknown as HTMLInputElement;

    const textHandle = adapter.bindText(element, 'extensionName');
    const placeholderHandle = adapter.bindAttribute(
      input,
      'placeholder',
      'domainMappingDomainPlaceholder'
    );

    const zhCNMessages = await loadLocaleMessages('zh-CN');
    const enMessages = await loadLocaleMessages('en');

    const resource = createI18nResource({
      language: 'zh-CN',
      messages: zhCNMessages,
      fallbackChain: [enMessages]
    });

    adapter.refresh(resource);

    expect(element.textContent).toBe(zhCNMessages.extensionName);
    expect(input.placeholder).toBe(zhCNMessages.domainMappingDomainPlaceholder);

    const nextResource = createI18nResource({
      language: 'en',
      messages: enMessages,
      fallbackChain: [enMessages]
    });

    adapter.refresh(nextResource);

    expect(element.textContent).toBe(enMessages.extensionName);
    expect(input.placeholder).toBe(enMessages.domainMappingDomainPlaceholder);

    textHandle.dispose();
    placeholderHandle.dispose();
    adapter.clear();
  });

  it('keeps placeholder title value and aria-label attribute bindings compatible', async () => {
    const adapter = createDomBindingAdapter();
    const input = document.createElement('input');
    const titleElement = document.createElement('button');
    const textarea = document.createElement('textarea');

    adapter.bindAttribute(input, 'placeholder', 'domainMappingDomainPlaceholder');
    adapter.bindAttribute(input, 'value', 'extensionName');
    adapter.bindAttribute(titleElement, 'title', 'extensionName');
    adapter.bindAttribute(textarea, 'aria-label', 'commentLabel');

    const resource = await createEnglishResource();
    adapter.refresh(resource);

    expect(input.placeholder).toBe(resource.messages.domainMappingDomainPlaceholder);
    expect(input.getAttribute('placeholder')).toBe(
      resource.messages.domainMappingDomainPlaceholder
    );
    expect(input.value).toBe(resource.messages.extensionName);
    expect(input.getAttribute('value')).toBe(resource.messages.extensionName);
    expect(titleElement.title).toBe(resource.messages.extensionName);
    expect(textarea.getAttribute('aria-label')).toBe(resource.messages.commentLabel);
  });
});
