import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  generateDynamicMessages,
  getDynamicMessage,
  updateDynamicMessages
} from '../../../src/i18n/dynamicMessages';
import type { Language } from '../../../src/i18n/locales';

// Mock the configProvider
vi.mock('../../../src/shared/config/provider', () => ({
  configProvider: {
    getRestDefaults: () => ({
      httpsPort: 27124,
      httpPort: 27123,
      vault: 'TestVault'
    })
  }
}));

describe('dynamicMessages', () => {
  describe('generateDynamicMessages', () => {
    it('generates Chinese messages with correct port numbers', () => {
      const messages = generateDynamicMessages('zh-CN');

      expect(messages.httpsUrlHint).toBe('通常端口为 27124，适用于安全连接');
      expect(messages.httpUrlHint).toBe('通常端口为 27123，作为备用连接');
      expect(messages.vaultNamePlaceholder).toBe('TestVault');
    });

    it('generates English messages with correct port numbers', () => {
      const messages = generateDynamicMessages('en');

      expect(messages.httpsUrlHint).toBe('Usually port 27124, for secure connections');
      expect(messages.httpUrlHint).toBe('Usually port 27123, as fallback connection');
      expect(messages.vaultNamePlaceholder).toBe('TestVault');
    });

    it('generates Japanese messages with correct port numbers', () => {
      const messages = generateDynamicMessages('ja');

      expect(messages.httpsUrlHint).toBe('通常はポート 27124、セキュア接続用');
      expect(messages.httpUrlHint).toBe('通常はポート 27123、フォールバック接続用');
      expect(messages.vaultNamePlaceholder).toBe('TestVault');
    });

    it('generates French messages with correct port numbers', () => {
      const messages = generateDynamicMessages('fr');

      expect(messages.httpsUrlHint).toBe('Généralement port 27124, pour les connexions sécurisées');
      expect(messages.httpUrlHint).toBe('Généralement port 27123, comme connexion de secours');
      expect(messages.vaultNamePlaceholder).toBe('TestVault');
    });

    it('generates pseudo-localized messages for qps-ploc', () => {
      const messages = generateDynamicMessages('qps-ploc');

      expect(messages.httpsUrlHint).toMatch(/^\[.+·\d+\]$/);
      expect(messages.httpsUrlHint).toContain('27124');
      expect(messages.vaultNamePlaceholder).toMatch(/^\[.+·\d+\]$/);
    });

    it('falls back to Chinese for unsupported languages', () => {
      const messages = generateDynamicMessages('xx' as Language);

      expect(messages.httpsUrlHint).toBe('通常端口为 27124，适用于安全连接');
      expect(messages.httpUrlHint).toBe('通常端口为 27123，作为备用连接');
      expect(messages.vaultNamePlaceholder).toBe('TestVault');
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
      expect(mockInput.placeholder).toBe('TestVault');
    });
  });
});
