/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  copyOptionsToClipboard,
  parseConfigInput,
  readConfigTextFromClipboard,
  writeToClipboard,
  ConfigTransferError
} from '@options/services/configTransfer';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();

declare global {
  // eslint-disable-next-line no-var
  var navigator: Navigator;
}

declare global {
  // eslint-disable-next-line no-var
  var navigator: Navigator;
}

type ClipboardMocks = {
  writeText: Mock<(text: string) => Promise<void>>;
  readText: Mock<() => Promise<string>>;
};

let clipboardMocks: ClipboardMocks | null = null;

describe('configTransfer service', () => {
  beforeEach(() => {
    const clipboard: ClipboardMocks = {
      writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
      readText: vi.fn<() => Promise<string>>().mockResolvedValue('{"value":42}')
    };

    clipboardMocks = clipboard;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard
      }
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'navigator');
    clipboardMocks = null;
  });

  it('copies transfer payload到剪贴板', async () => {
    const payload = {
      version: 1,
      options: { foo: 'bar' },
      analytics: {
        consent: {
          analytics: true,
          errorReporting: false
        },
        debugMode: true
      }
    };

    await copyOptionsToClipboard(payload);

    if (!clipboardMocks) {
      throw new Error('Clipboard writeText mock missing');
    }
    expect(clipboardMocks.writeText).toHaveBeenCalledTimes(1);
    const maybeWritten = clipboardMocks.writeText.mock.calls.at(-1)?.[0];
    if (typeof maybeWritten !== 'string') {
      throw new Error('Clipboard contents must be stringified JSON');
    }
    expect(JSON.parse(maybeWritten)).toEqual(payload);
  });

  it('reads configuration text from clipboard', async () => {
    const result = await readConfigTextFromClipboard();
    expect(result).toBe('{"value":42}');
    if (!clipboardMocks) {
      throw new Error('Clipboard readText mock missing');
    }
    expect(clipboardMocks.readText).toHaveBeenCalledTimes(1);
  });

  it('解析新版传输格式', () => {
    const text =
      '{"version":2,"options":{"rest":{"baseUrl":"https://example.com"}},"analytics":{"consent":{"analytics":true,"errorReporting":false},"debugMode":false}}';
    const parsed = parseConfigInput(text);
    expect(parsed.version).toBe(2);
    expect(parsed.options).toEqual({ rest: { baseUrl: 'https://example.com' } });
    expect(parsed.analytics).toEqual({
      consent: { analytics: true, errorReporting: false },
      debugMode: false
    });
  });

  it('normalizes legacy YAML array shape before schema validation for versioned imports', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        version: 2,
        options: {
          yamlConfig: {
            contentTypes: [
              {
                contentType: 'article',
                fields: [{ name: 'title', type: 'text', enabled: false }]
              }
            ]
          }
        }
      })
    );

    expect(parsed.version).toBe(2);
    expect(parsed.options.yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual({
      name: 'title',
      type: 'text',
      enabled: false
    });
    expect(Array.isArray(parsed.options.yamlConfig?.contentTypes)).toBe(false);
  });

  it('migrates legacy direct-selection imports to the canonical trigger mode', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        version: 2,
        options: {
          fragmentClipper: {
            selectionModifierEnabled: false,
            selectionModifierKeys: ['shift']
          }
        }
      })
    );

    expect(parsed.options.fragmentClipper).toEqual({
      selectionTriggerMode: 'direct',
      selectionModifierKeys: ['shift']
    });
    expect(parsed.options.fragmentClipper).not.toHaveProperty('selectionModifierEnabled');
  });

  it('migrates legacy template, video, and taxonomy values before strict import validation', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        version: 2,
        options: {
          templates: { clipper: 'Legacy/{{title}}.md' },
          video: {
            controlBarAutoPauseEnabled: false,
            controlBarCaptureScreenshotEnabled: false
          },
          classifier: {
            taxonomy: {
              type: ['article'],
              topics: ['research'],
              ai_platform: ['chatgpt']
            }
          }
        }
      })
    );

    expect(parsed.options.templates).toEqual({
      fragment: 'Legacy/{{title}}.md',
      reading: 'Legacy/{{title}}.md'
    });
    expect(parsed.options.video).toEqual({
      controlBarAutoPause: false,
      controlBarScreenshot: false
    });
    expect(parsed.options.classifier?.taxonomy?.name).toBe('Migrated Taxonomy');
  });

  it('兼容旧版仅包含选项的格式', () => {
    const text = '{"rest":{"baseUrl":"https://example.com"}}';
    const parsed = parseConfigInput(text);
    expect(parsed.version).toBe(0);
    expect(parsed.options).toEqual({ rest: { baseUrl: 'https://example.com' } });
    expect(parsed.analytics).toBeUndefined();
  });

  it('normalizes legacy YAML array shape before schema validation for bare options imports', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        yamlConfig: {
          contentTypes: [
            {
              contentType: 'article',
              fields: [{ name: 'title', type: 'text', enabled: false }]
            }
          ]
        }
      })
    );

    expect(parsed.version).toBe(0);
    expect(parsed.options.yamlConfig?.contentTypes?.article?.fields?.[0]?.enabled).toBe(false);
  });

  it.each([
    { rest: { baseUrl: 'not a url' } },
    { version: 2, options: { rest: { baseUrl: 'https://example.com/' }, unknownRoot: true } },
    { rest: { baseUrl: 'https://example.com/' }, unknownRoot: true },
    {
      version: 2,
      options: {
        vaultRouter: {
          vaults: [
            {
              id: 'main',
              name: 'Main',
              httpsUrl: 'https://example.com/',
              httpUrl: 'http://example.com/',
              vault: 'Main',
              apiKey: '',
              unknownNested: true
            }
          ]
        }
      }
    },
    {
      version: 2,
      options: {
        yamlConfig: {
          contentTypes: {
            article: {
              fields: [{ name: 'title', type: 'text', enabled: true, unknownNested: true }]
            }
          }
        }
      }
    }
  ])('rejects unknown root and nested keys all-or-nothing', (candidate) => {
    expect(() => parseConfigInput(JSON.stringify(candidate))).toThrowError(
      expect.objectContaining({ code: 'PARSE_FAILED' })
    );
  });

  it('imports known current settings and sensitive fields through the transfer sanitizer', () => {
    const text = JSON.stringify({
      version: 2,
      options: {
        interfaceTheme: 'light',
        rest: {
          baseUrl: REST_DEFAULTS.baseUrl,
          vault: 'MainVault',
          apiKey: 'REST_SECRET_TOKEN',
          rootDir: 'LegacyRoot/'
        },
        templates: { article: 'Articles/{{title}}.md' },
        domainMappings: { 'example.com': 'Research' },
        aiChat: { userName: 'Researcher' },
        deepResearch: { pureMode: true },
        classifier: {
          enabled: true,
          provider: 'compatible',
          endpoint: 'https://classifier.example/v1/chat',
          apiKey: 'CLASSIFIER_SECRET_TOKEN',
          model: 'classify-1'
        },
        experimentalAi: {
          provider: 'compatible',
          model: 'summary-1',
          apiUrl: 'https://ai.example/v1/chat/completions',
          apiKey: 'EXPERIMENTAL_SECRET_TOKEN'
        },
        pageSummary: { enabled: true },
        readingOverlaySummary: { enabled: true },
        subtitleTranslation: { enabled: true, targetLanguage: 'ja' },
        video: { promptShortcut: 'cmd+shift+v' },
        vaultRouter: {
          vaults: [
            {
              id: 'main',
              name: 'MainVault',
              httpsUrl: REST_DEFAULTS.httpsUrl,
              httpUrl: REST_DEFAULTS.httpUrl,
              vault: 'MainVault',
              apiKey: 'VAULT_SECRET_TOKEN'
            }
          ],
          defaultVaultId: 'main'
        }
      }
    });

    const parsed = parseConfigInput(text);

    expect(parsed.options.interfaceTheme).toBe('light');
    expect(parsed.options.rest?.apiKey).toBe('REST_SECRET_TOKEN');
    expect(parsed.options.rest?.vault).toBe('MainVault');
    expect(parsed.options.rest).not.toHaveProperty('rootDir');
    expect(parsed.options.templates?.article).toBe('Articles/{{title}}.md');
    expect(parsed.options.domainMappings?.['example.com']).toBe('Research');
    expect(parsed.options.aiChat?.userName).toBe('Researcher');
    expect(parsed.options.deepResearch?.pureMode).toBe(true);
    expect(parsed.options.classifier?.apiKey).toBe('CLASSIFIER_SECRET_TOKEN');
    expect(parsed.options.experimentalAi?.apiKey).toBe('EXPERIMENTAL_SECRET_TOKEN');
    expect(parsed.options.pageSummary?.enabled).toBe(true);
    expect(parsed.options.readingOverlaySummary?.enabled).toBe(true);
    expect(parsed.options.subtitleTranslation?.targetLanguage).toBe('ja');
    expect(parsed.options.video?.promptShortcut).toBe('cmd+shift+v');
    expect(parsed.options.vaultRouter?.vaults[0]?.apiKey).toBe('VAULT_SECRET_TOKEN');
  });

  it('strips machine-local vault bindings from imported configuration', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        version: 2,
        options: {
          rest: {
            vault: 'MainVault',
            localFolderId: 'foreign-folder',
            localFolderName: 'Foreign Folder'
          },
          vaultRouter: {
            defaultVaultId: 'main',
            vaults: [
              {
                id: 'main',
                name: 'MainVault',
                vault: 'MainVault',
                httpsUrl: '',
                httpUrl: '',
                apiKey: '',
                localFolderId: 'foreign-folder',
                localFolderName: 'Foreign Folder'
              }
            ]
          }
        }
      })
    );

    expect(parsed.options.rest).not.toHaveProperty('localFolderId');
    expect(parsed.options.rest).not.toHaveProperty('localFolderName');
    expect(parsed.options.vaultRouter?.vaults[0]).not.toHaveProperty('localFolderId');
    expect(parsed.options.vaultRouter?.vaults[0]).not.toHaveProperty('localFolderName');
  });

  it('round-trips a full optional taxonomy through strict import without stripping data', () => {
    const taxonomy = {
      version: '2.0.0',
      name: 'Research taxonomy',
      description: 'Full optional configuration',
      descriptionKey: 'taxonomy.research.description',
      classificationHint: 'Classify research material',
      categories: [
        {
          id: 'research',
          name: 'Research',
          description: 'Research category',
          descriptionKey: 'taxonomy.category.research',
          classificationHint: 'Academic content',
          parent: 'knowledge',
          keywords: ['paper', 'study'],
          weight: 0.9
        }
      ],
      tags: [
        {
          id: 'review',
          name: 'Review',
          description: 'Needs review',
          descriptionKey: 'taxonomy.tag.review',
          classificationHint: 'Review later',
          category: 'research',
          color: '#336699',
          aliases: ['read-later']
        }
      ],
      rules: [
        {
          id: 'rule-1',
          name: 'Domain rule',
          description: 'Classify a domain',
          conditions: [
            {
              type: 'domain',
              operator: 'endsWith',
              value: '.example.edu',
              caseSensitive: false
            }
          ],
          actions: [
            {
              type: 'assignCategory',
              target: 'category',
              value: 'research',
              metadata: { source: 'import', nested: { trusted: true } }
            }
          ],
          priority: 10,
          enabled: true
        }
      ],
      defaultCategory: 'research',
      defaultTags: ['review'],
      settings: {
        autoClassification: true,
        confidenceThreshold: 0.8,
        maxCategories: 2,
        maxTags: 4,
        fallbackBehavior: 'prompt',
        customPrompts: { classify: 'Choose a research category' }
      }
    };

    const parsed = parseConfigInput(
      JSON.stringify({ version: 2, options: { classifier: { taxonomy } } })
    );

    expect(parsed.options.classifier?.taxonomy).toEqual(taxonomy);
  });

  it('throws EMPTY_IMPORT for empty input', () => {
    expect(() => parseConfigInput('   ')).toThrowError(ConfigTransferError);
    try {
      parseConfigInput('   ');
    } catch (error) {
      if (!(error instanceof ConfigTransferError)) {
        throw error;
      }
      expect(error).toBeInstanceOf(ConfigTransferError);
      expect(error.code).toBe('EMPTY_IMPORT');
    }
  });

  it('throws PARSE_FAILED for invalid json', () => {
    expect(() => parseConfigInput('not json')).toThrowError(ConfigTransferError);
    try {
      parseConfigInput('not json');
    } catch (error) {
      if (!(error instanceof ConfigTransferError)) {
        throw error;
      }
      expect(error).toBeInstanceOf(ConfigTransferError);
      expect(error.code).toBe('PARSE_FAILED');
    }
  });

  it('rejects over-budget UTF-8 input before native parsing', () => {
    const oversized = JSON.stringify({
      templates: { article: '文章'.repeat(200_000) }
    });
    expect(() => parseConfigInput(oversized)).toThrowError(
      expect.objectContaining({ code: 'PARSE_FAILED' })
    );
    expect(() => parseConfigInput(`${' '.repeat(600 * 1024)}{}`)).toThrowError(
      expect.objectContaining({ code: 'PARSE_FAILED' })
    );
    expect(() => parseConfigInput(' '.repeat(600 * 1024))).toThrowError(
      expect.objectContaining({ code: 'PARSE_FAILED' })
    );
  });

  it('treats an own non-object options member as an invalid wrapper', () => {
    expect(() => parseConfigInput('{"version":2,"options":null}')).toThrowError(
      expect.objectContaining({ code: 'PARSE_FAILED' })
    );
  });

  it('falls back to document.execCommand when clipboard api is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });
    document.body.innerHTML = '';
    const execCommandMock = vi.fn(() => true);
    document.execCommand = execCommandMock;

    await writeToClipboard('hello');

    expect(execCommandMock).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('throws clipboard-specific errors for unavailable read and failed copy fallback', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });
    document.execCommand = vi.fn(() => false);

    await expect(writeToClipboard('hello')).rejects.toMatchObject({
      code: 'CLIPBOARD_UNAVAILABLE'
    });
    await expect(readConfigTextFromClipboard()).rejects.toMatchObject({
      code: 'CLIPBOARD_READ_UNAVAILABLE'
    });
  });

  it('defaults version to 1 and drops invalid analytics payloads', () => {
    const parsed = parseConfigInput(
      '{"options":{"rest":{"baseUrl":"https://example.com"}},"analytics":{"debugMode":"nope","consent":"invalid"}}'
    );
    expect(parsed.version).toBe(1);
    expect(parsed.analytics).toBeUndefined();
  });

  it('keeps analytics transfer payload limited to consent and debug mode', () => {
    const parsed = parseConfigInput(
      JSON.stringify({
        version: 2,
        options: {
          rest: { baseUrl: 'https://example.com' }
        },
        analytics: {
          consent: {
            analytics: true,
            errorReporting: false
          },
          debugMode: true,
          measurementId: 'G-1111111111',
          transportMode: 'proxy',
          proxyEndpoint: 'https://proxy.example/collect'
        }
      })
    );

    expect(parsed.analytics).toEqual({
      consent: {
        analytics: true,
        errorReporting: false
      },
      debugMode: true
    });
    expect(parsed.analytics).not.toHaveProperty('measurementId');
    expect(parsed.analytics).not.toHaveProperty('transportMode');
    expect(parsed.analytics).not.toHaveProperty('proxyEndpoint');
  });
});
