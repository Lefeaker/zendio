import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { createPageI18nController } from '../../../src/i18n/pageController';
import type { I18nBindingAdapter, I18nBindingHandle, I18nResource } from '../../../src/i18n';
import type { Language, Messages } from '../../../src/i18n/locales';

const messages: Partial<Record<Language, Messages>> & Record<'en' | 'zh-CN', Messages> = {
  en: {
    extensionName: 'Zendio',
    domainMappingDomainPlaceholder: 'example.com',
    commentLabel: 'Comment'
  } as Messages,
  'zh-CN': {
    extensionName: 'Zendio',
    domainMappingDomainPlaceholder: '示例.中国',
    commentLabel: '评论'
  } as Messages
};

function createMockBindingAdapter(): I18nBindingAdapter & {
  handles: I18nBindingHandle[];
  bindTextMock: Mock<(...args: [element: HTMLElement, key: keyof Messages]) => I18nBindingHandle>;
  bindAttrMock: Mock<
    (...args: [element: HTMLElement, attribute: string, key: keyof Messages]) => I18nBindingHandle
  >;
  bindHtmlMock: Mock<(...args: [element: HTMLElement, key: keyof Messages]) => I18nBindingHandle>;
  refreshMock: Mock<(...args: [resource: I18nResource]) => void>;
  clearMock: Mock<(...args: []) => void>;
} {
  const handles: I18nBindingHandle[] = [];

  const bindTextImpl: I18nBindingAdapter['bindText'] = (element, key) => {
    const handle: I18nBindingHandle = {
      dispose: vi.fn()
    };
    element.setAttribute('data-i18n', key as string);
    handles.push(handle);
    return handle;
  };

  const bindAttrImpl: I18nBindingAdapter['bindAttribute'] = (element, attr, key) => {
    const handle: I18nBindingHandle = {
      dispose: vi.fn()
    };
    element.setAttribute(`data-i18n-${attr}`, key as string);
    handles.push(handle);
    return handle;
  };

  const bindHtmlImpl: I18nBindingAdapter['bindHtml'] = (element, key) => {
    const handle: I18nBindingHandle = {
      dispose: vi.fn()
    };
    element.setAttribute('data-i18n-html', key as string);
    handles.push(handle);
    return handle;
  };

  const refreshImpl: I18nBindingAdapter['refresh'] = () => {
    // no-op for tests
  };

  const clearImpl: I18nBindingAdapter['clear'] = () => {
    handles.splice(0, handles.length);
  };

  const bindTextMock = vi.fn(bindTextImpl);
  const bindAttrMock = vi.fn(bindAttrImpl);
  const bindHtmlMock = vi.fn(bindHtmlImpl);
  const refreshMock = vi.fn(refreshImpl);
  const clearMock = vi.fn(clearImpl);

  return {
    bindText: bindTextMock as I18nBindingAdapter['bindText'],
    bindAttribute: bindAttrMock as I18nBindingAdapter['bindAttribute'],
    bindHtml: bindHtmlMock as I18nBindingAdapter['bindHtml'],
    refresh: refreshMock as I18nBindingAdapter['refresh'],
    clear: clearMock as I18nBindingAdapter['clear'],
    handles,
    bindTextMock,
    bindAttrMock,
    bindHtmlMock,
    refreshMock,
    clearMock
  };
}

describe('pageController', () => {
  let bindingAdapter: ReturnType<typeof createMockBindingAdapter>;

  beforeEach(() => {
    bindingAdapter = createMockBindingAdapter();
  });

  const createNodeList = <T extends HTMLElement>(items: T[]): NodeListOf<T> => {
    const nodeList = {
      length: items.length,
      item: (index: number) => items[index] ?? null,
      forEach: (
        callbackfn: (value: T, key: number, parent: NodeListOf<T>) => void,
        thisArg?: unknown
      ) => {
        items.forEach((value, key) => callbackfn.call(thisArg, value, key, nodeList));
      },
      entries: () => items.entries(),
      keys: () => items.keys(),
      values: () => items.values(),
      [Symbol.iterator]: () => items.values()
    };
    items.forEach((value, index) => {
      Object.defineProperty(nodeList, index, {
        value,
        enumerable: true
      });
    });
    return nodeList as NodeListOf<T>;
  };

  const createElementStub = () => {
    const attributes = new Map<string, string>();
    return {
      textContent: '',
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
      getAttribute: (name: string) => attributes.get(name) ?? null
    } as HTMLElement;
  };

  const createInputStub = () => {
    const attributes = new Map<string, string>();
    return {
      placeholder: '',
      setAttribute: function (this: { placeholder: string }, name: string, value: string) {
        attributes.set(name, value);
        if (name === 'placeholder') {
          this.placeholder = value;
        }
      },
      getAttribute: (name: string) => attributes.get(name) ?? null
    } as HTMLInputElement;
  };

  it('loads current language and registers static bindings on mount', async () => {
    const controller = createPageI18nController({
      bindingAdapter,
      defaultLanguage: 'zh-CN',
      loadMessages: (language) => Promise.resolve(messages[language] ?? messages['zh-CN']),
      getCurrentLanguage: () => Promise.resolve('zh-CN')
    });

    await controller.load();

    expect(bindingAdapter.refreshMock).toHaveBeenCalledTimes(1);
    const resource = controller.getCurrentResource();
    expect(resource?.language).toBe('zh-CN');

    const textNode = createElementStub();
    textNode.setAttribute('data-i18n', 'extensionName');
    const inputNode = createInputStub();
    inputNode.setAttribute('data-i18n-placeholder', 'domainMappingDomainPlaceholder');
    const root = {
      querySelectorAll: (selector: string) => {
        if (selector === '[data-i18n]') {
          return createNodeList([textNode]);
        }
        if (selector === '[data-i18n-placeholder]') {
          return createNodeList([inputNode]);
        }
        return createNodeList([]);
      }
    } as ParentNode;

    controller.mount(root);

    expect(bindingAdapter.bindTextMock).toHaveBeenCalledWith(textNode, 'extensionName');
    expect(bindingAdapter.bindAttrMock).toHaveBeenCalledWith(
      inputNode,
      'placeholder',
      'domainMappingDomainPlaceholder'
    );
    expect(bindingAdapter.refreshMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes bindings on language change', async () => {
    const controller = createPageI18nController({
      bindingAdapter,
      defaultLanguage: 'zh-CN',
      loadMessages: (language) => Promise.resolve(messages[language] ?? messages['zh-CN']),
      getCurrentLanguage: () => Promise.resolve('zh-CN'),
      setCurrentLanguage: vi.fn()
    });

    await controller.load();
    await controller.changeLanguage('en');

    expect(bindingAdapter.refreshMock).toHaveBeenCalledTimes(2);
    const resource = controller.getCurrentResource();
    expect(resource?.language).toBe('en');
  });

  it('scans declarative aria-label bindings on mount', async () => {
    const controller = createPageI18nController({
      bindingAdapter,
      defaultLanguage: 'zh-CN',
      loadMessages: (language) => Promise.resolve(messages[language] ?? messages['zh-CN']),
      getCurrentLanguage: () => Promise.resolve('zh-CN')
    });

    await controller.load();

    const ariaNode = createElementStub();
    ariaNode.setAttribute('data-i18n-aria-label', 'commentLabel');
    const root = {
      querySelectorAll: (selector: string) => {
        if (selector === '[data-i18n-aria-label]') {
          return createNodeList([ariaNode]);
        }
        return createNodeList([]);
      }
    } as ParentNode;

    controller.mount(root);

    expect(bindingAdapter.bindAttrMock).toHaveBeenCalledWith(
      ariaNode,
      'aria-label',
      'commentLabel'
    );
  });
});
