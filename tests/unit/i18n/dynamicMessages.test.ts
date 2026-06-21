import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { build } from 'esbuild';
import { join } from 'node:path';
import {
  generateDynamicMessages,
  getDynamicMessage,
  updateDynamicMessages
} from '../../../src/i18n/dynamicMessages';
import { DYNAMIC_MESSAGE_TEMPLATES } from '../../../src/i18n/catalog/dynamicTemplates';
import { createPageI18nController } from '../../../src/i18n/pageController';
import type { Language } from '../../../src/i18n/locales';
import { pseudoLocalizeString } from '../../../src/i18n/pseudoLocalization';

async function buildProductionBundle(entryPoint: string): Promise<string> {
  const result = await build({
    entryPoints: [join(process.cwd(), entryPoint)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: true,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    }
  });

  return result.outputFiles[0].text;
}

describe('dynamicMessages', () => {
  describe('generateDynamicMessages', () => {
    it('generates Chinese messages with correct port numbers', () => {
      const messages = generateDynamicMessages('zh-CN');

      expect(messages.httpsUrlHint).toBe('通常端口为 27124，适用于安全连接');
      expect(messages.httpUrlHint).toBe('通常端口为 27123，作为备用连接');
      expect(messages.vaultNamePlaceholder).toBe('Zendio');
    });

    it('generates English messages with correct port numbers', () => {
      const messages = generateDynamicMessages('en');

      expect(messages.httpsUrlHint).toBe('Usually port 27124, for secure connections');
      expect(messages.httpUrlHint).toBe('Usually port 27123, as fallback connection');
      expect(messages.vaultNamePlaceholder).toBe('Zendio');
    });

    it('generates Japanese messages with correct port numbers', () => {
      const messages = generateDynamicMessages('ja');

      expect(messages.httpsUrlHint).toBe('通常はポート 27124、セキュア接続用');
      expect(messages.httpUrlHint).toBe('通常はポート 27123、フォールバック接続用');
      expect(messages.vaultNamePlaceholder).toBe('Zendio');
    });

    it('generates French messages with correct port numbers', () => {
      const messages = generateDynamicMessages('fr');

      expect(messages.httpsUrlHint).toBe('Généralement port 27124, pour les connexions sécurisées');
      expect(messages.httpUrlHint).toBe('Généralement port 27123, comme connexion de secours');
      expect(messages.vaultNamePlaceholder).toBe('Zendio');
    });

    it('keeps qps-ploc coverage dev-only via pseudo-localized English templates', () => {
      const messages = generateDynamicMessages('qps-ploc');

      expect(messages.httpsUrlHint).toBe(
        pseudoLocalizeString(DYNAMIC_MESSAGE_TEMPLATES.en.httpsUrlHint).replace(
          '{httpsPort}',
          '27124'
        )
      );
      expect(messages.httpUrlHint).toBe(
        pseudoLocalizeString(DYNAMIC_MESSAGE_TEMPLATES.en.httpUrlHint).replace(
          '{httpPort}',
          '27123'
        )
      );
      expect(messages.vaultNamePlaceholder).toBe(
        pseudoLocalizeString(DYNAMIC_MESSAGE_TEMPLATES.en.vaultNamePlaceholder).replace(
          '{vault}',
          'Zendio'
        )
      );
    });

    it('omits pseudo locale identifiers from production dynamic message bundles', async () => {
      const bundle = await buildProductionBundle('src/i18n/dynamicMessages.ts');

      expect(bundle).not.toContain('qps-ploc');
      expect(bundle).not.toContain('qps_ploc');
    });

    it('falls back to English for unsupported languages', () => {
      const messages = generateDynamicMessages('xx' as Language);

      expect(messages.httpsUrlHint).toBe('Usually port 27124, for secure connections');
      expect(messages.httpUrlHint).toBe('Usually port 27123, as fallback connection');
      expect(messages.vaultNamePlaceholder).toBe('Zendio');
    });
  });

  describe('getDynamicMessage', () => {
    it('returns correct message for valid key', () => {
      const message = getDynamicMessage('httpsUrlHint', 'en');
      expect(message).toBe('Usually port 27124, for secure connections');
    });

    it('returns empty string for invalid key', () => {
      const message = getDynamicMessage('invalidKey', 'en');
      expect(message).toBe('');
    });
  });

  describe('updateDynamicMessages', () => {
    interface MockTextElement {
      selector: string;
      textContent: string;
    }

    type MockInputElement = Pick<HTMLInputElement, 'value' | 'placeholder'>;

    type QuerySelectorMock = Mock<(...args: [selector: string]) => MockTextElement | null>;
    type QuerySelectorAllMock = Mock<(...args: [selector: string]) => MockInputElement[]>;
    type DocumentStub = {
      querySelector: QuerySelectorMock;
      querySelectorAll: QuerySelectorAllMock;
    };

    let mockDocument: DocumentStub;
    let mockElements: MockTextElement[];

    const installDocumentStub = (doc?: DocumentStub) => {
      if (doc) {
        vi.stubGlobal('document', doc as unknown as Document);
      } else {
        vi.stubGlobal('document', undefined);
      }
    };

    beforeEach(() => {
      mockElements = [];

      const querySelector: QuerySelectorMock = vi.fn<
        (...args: [selector: string]) => MockTextElement | null
      >((selector) => {
        const element: MockTextElement = {
          textContent: '',
          selector
        };
        mockElements.push(element);
        return element;
      });
      const querySelectorAll: QuerySelectorAllMock = vi.fn<
        (...args: [selector: string]) => MockInputElement[]
      >(() => []);

      mockDocument = {
        querySelector,
        querySelectorAll
      };
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('updates HTTPS and HTTP URL hints', () => {
      installDocumentStub(mockDocument);
      updateDynamicMessages('en');

      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-i18n="httpsUrlHint"]');
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-i18n="httpUrlHint"]');

      const httpsElement = mockElements.find((el) => el.selector === '[data-i18n="httpsUrlHint"]');
      const httpElement = mockElements.find((el) => el.selector === '[data-i18n="httpUrlHint"]');

      expect(httpsElement?.textContent).toBe('Usually port 27124, for secure connections');
      expect(httpElement?.textContent).toBe('Usually port 27123, as fallback connection');
    });

    it('handles missing DOM elements gracefully', () => {
      installDocumentStub(mockDocument);
      mockDocument.querySelector.mockReturnValue(null);

      expect(() => updateDynamicMessages('en')).not.toThrow();
    });

    it('does nothing when document is not available', () => {
      installDocumentStub();

      expect(() => updateDynamicMessages('en')).not.toThrow();
      expect(mockDocument.querySelector).not.toHaveBeenCalled();
    });

    it('updates vault input placeholders', () => {
      installDocumentStub(mockDocument);
      // Provide a typed stub so instanceof checks behave predictably in Node
      class MockHTMLInputElement implements MockInputElement {
        value = '';
        placeholder = '';
      }
      vi.stubGlobal('HTMLInputElement', MockHTMLInputElement);

      const mockInput = new MockHTMLInputElement();

      mockDocument.querySelectorAll.mockReturnValue([mockInput]);

      updateDynamicMessages('en');

      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith(
        'input[id*="vault"], input[placeholder*="Vault"]'
      );
      expect(mockInput.placeholder).toBe('Zendio');
    });

    it('still updates dynamic DOM nodes after pageController language changes', async () => {
      const httpsElement = {
        selector: '[data-i18n="httpsUrlHint"]',
        textContent: ''
      };
      const httpElement = {
        selector: '[data-i18n="httpUrlHint"]',
        textContent: ''
      };

      class MockHTMLInputElement implements MockInputElement {
        value = '';
        placeholder = '';
      }

      const vaultInput = new MockHTMLInputElement();

      const documentStub: DocumentStub = {
        querySelector: vi.fn((selector: string) => {
          if (selector === '[data-i18n="httpsUrlHint"]') {
            return httpsElement;
          }
          if (selector === '[data-i18n="httpUrlHint"]') {
            return httpElement;
          }
          return null;
        }),
        querySelectorAll: vi.fn((selector: string) => {
          if (selector === 'input[id*="vault"], input[placeholder*="Vault"]') {
            return [vaultInput];
          }
          return [];
        })
      };

      vi.stubGlobal('HTMLInputElement', MockHTMLInputElement);
      installDocumentStub(documentStub);

      const controller = createPageI18nController({
        bindingAdapter: {
          bindText: vi.fn(),
          bindAttribute: vi.fn(),
          bindHtml: vi.fn(),
          refresh: vi.fn(),
          clear: vi.fn()
        },
        defaultLanguage: 'zh-CN',
        loadMessages: (language) =>
          Promise.resolve({
            extensionName: language === 'zh-CN' ? 'Zendio' : 'Zendio',
            httpsUrlHint:
              language === 'zh-CN'
                ? '通常端口为 27124，适用于安全连接'
                : 'Usually port 27124, for secure connections',
            httpUrlHint:
              language === 'zh-CN'
                ? '通常端口为 27123，作为备用连接'
                : 'Usually port 27123, as fallback connection',
            vaultNamePlaceholder: 'YourVault'
          } as never),
        getCurrentLanguage: () => Promise.resolve('zh-CN'),
        setCurrentLanguage: vi.fn()
      });

      await controller.load();
      const root = {
        querySelectorAll: () => [] as unknown as NodeListOf<HTMLElement>
      } as unknown as ParentNode;

      controller.mount(root);
      await controller.changeLanguage('en');

      expect(httpsElement.textContent).toBe('Usually port 27124, for secure connections');
      expect(httpElement.textContent).toBe('Usually port 27123, as fallback connection');
      expect(vaultInput.placeholder).toBe('Zendio');
    });
  });
});
