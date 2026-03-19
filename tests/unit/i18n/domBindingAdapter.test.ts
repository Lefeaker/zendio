import { describe, it, expect } from 'vitest';
import { createDomBindingAdapter } from '../../../src/i18n/adapters/domBindingAdapter';
import { createI18nResource } from '../../../src/i18n/resource';
import { messages } from '../../../src/i18n/locales';

describe('domBindingAdapter', () => {
  it('binds elements and updates on refresh', () => {
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
    const placeholderHandle = adapter.bindAttribute(input, 'placeholder', 'domainMappingDomainPlaceholder');

    const resource = createI18nResource({
      language: 'zh-CN',
      messages: messages['zh-CN'],
      fallbackChain: [messages['en']]
    });

    adapter.refresh(resource);

    expect(element.textContent).toBe(messages['zh-CN'].extensionName);
    expect(input.placeholder).toBe(messages['zh-CN'].domainMappingDomainPlaceholder);

    const nextResource = createI18nResource({
      language: 'en',
      messages: messages['en'],
      fallbackChain: [messages['en']]
    });

    adapter.refresh(nextResource);

    expect(element.textContent).toBe(messages['en'].extensionName);
    expect(input.placeholder).toBe(messages['en'].domainMappingDomainPlaceholder);

    textHandle.dispose();
    placeholderHandle.dispose();
    adapter.clear();
  });
});
