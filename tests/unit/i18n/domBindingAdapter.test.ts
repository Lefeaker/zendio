import { describe, it, expect } from 'vitest';
import { createDomBindingAdapter } from '../../../src/i18n/adapters/domBindingAdapter';
import { createI18nResource } from '../../../src/i18n/resource';
import { loadLocaleMessages } from '../../../src/i18n/locales';

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
    const placeholderHandle = adapter.bindAttribute(input, 'placeholder', 'domainMappingDomainPlaceholder');

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
});
