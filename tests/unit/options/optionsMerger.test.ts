import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import { mergeOptions, optionsMerger } from '@shared/config/optionsMerger';
import type { StoredOptions, ReadingSessionOptions } from '@shared/types';
import type { FragmentModifierKey, ReaderHighlightTheme } from '@shared/types/options';

const defaultReadingSession = DEFAULT_OPTIONS.readingSession!;
const defaultFragmentClipper = DEFAULT_OPTIONS.fragmentClipper!;

describe('shared optionsMerger', () => {
  it('returns defaults when no stored options provided', () => {
    const result = mergeOptions(undefined);
    expect(result.rest.baseUrl).toBe(DEFAULT_OPTIONS.rest.baseUrl);
    expect(result.templates.article).toBe(DEFAULT_OPTIONS.templates.article);
    expect(result.interfaceTheme).toBe('system');
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
    expect(result.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
    expect(result.readingSession?.exportMode).toBe(defaultReadingSession.exportMode);
    expect(result.readingSession?.highlightTheme).toBe(defaultReadingSession.highlightTheme);
    expect(result.experimentalAi).toEqual(DEFAULT_OPTIONS.experimentalAi);
    expect(result.pageSummary).toEqual(DEFAULT_OPTIONS.pageSummary);
    expect(result.readingOverlaySummary).toEqual(DEFAULT_OPTIONS.readingOverlaySummary);
    expect(result.subtitleTranslation).toEqual(DEFAULT_OPTIONS.subtitleTranslation);
  });

  it('merges partial rest and classifier values', () => {
    const stored: StoredOptions = {
      rest: {
        baseUrl: 'https://example.com',
        apiKey: 'token'
      },
      classifier: {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o'
      },
      fragmentClipper: {
        captureContext: true
      }
    };

    const result = mergeOptions(stored);
    expect(result.rest.baseUrl).toBe('https://example.com');
    expect(result.rest.apiKey).toBe('token');
    expect(result.rest.httpsUrl).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
    expect(result.classifier?.enabled).toBe(true);
    expect(result.classifier?.provider).toBe('openai');
    expect(result.classifier?.model).toBe('gpt-4o');
    expect(result.classifier?.taxonomy).toEqual(DEFAULT_OPTIONS.classifier?.taxonomy);
    expect(result.fragmentClipper?.captureContext).toBe(true);
    expect(result.fragmentClipper?.contextLength).toBe(defaultFragmentClipper.contextLength);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(
      defaultFragmentClipper.selectionModifierEnabled
    );
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(
      defaultFragmentClipper.selectionModifierKeys
    );
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(
      defaultFragmentClipper.keyboardShortcutsEnabled
    );
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
  });

  it('normalizes fragment modifier keys', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['meta', 'ctrl', 'cmd', 'Alt'] as unknown as FragmentModifierKey[]
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(true);
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(['meta', 'ctrl']);
  });

  it('merges reading session highlight theme when valid', () => {
    const stored: StoredOptions = {
      readingSession: {
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      } as Partial<ReadingSessionOptions>
    };

    const result = mergeOptions(stored);
    expect(result.readingSession?.exportMode).toBe('full');
    expect(result.readingSession?.highlightTheme).toBe('neonOrange');
  });

  it('falls back to default highlight theme when invalid', () => {
    const stored: StoredOptions = {
      readingSession: {
        highlightTheme: 'invalid-color' as unknown as ReaderHighlightTheme
      } as Partial<ReadingSessionOptions>
    };

    const result = mergeOptions(stored);
    expect(result.readingSession?.highlightTheme).toBe(defaultReadingSession.highlightTheme);
  });

  it('merges keyboard shortcuts configuration', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        keyboardShortcutsEnabled: false,
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt']
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(false);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(true);
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(['alt']);
  });

  it('uses default keyboard shortcuts when not specified', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        selectionModifierEnabled: true
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(
      defaultFragmentClipper.keyboardShortcutsEnabled
    );
  });

  it('merges experimental options with defaults', () => {
    const stored: StoredOptions = {
      experimentalAi: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      },
      pageSummary: {
        enabled: true
      },
      subtitleTranslation: {
        enabled: true
      }
    };

    const result = mergeOptions(stored);

    expect(result.experimentalAi).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiUrl: DEFAULT_OPTIONS.experimentalAi?.apiUrl ?? '',
      apiKey: DEFAULT_OPTIONS.experimentalAi?.apiKey ?? ''
    });
    expect(result.pageSummary).toEqual({ enabled: true });
    expect(result.readingOverlaySummary).toEqual(DEFAULT_OPTIONS.readingOverlaySummary);
    expect(result.subtitleTranslation).toEqual({
      enabled: true,
      targetLanguage: DEFAULT_OPTIONS.subtitleTranslation?.targetLanguage ?? 'zh-CN'
    });
  });

  it('preserves optional rest fields, legacy template fallbacks, and unknown extensions', () => {
    const result = mergeOptions({
      interfaceTheme: 'unexpected' as StoredOptions['interfaceTheme'],
      rest: {
        baseUrl: '',
        vault: '',
        apiKey: '',
        httpsUrl: '',
        httpUrl: 'http://stored.example/',
        rootDir: 'Root',
        localFolderId: '',
        localFolderName: 'Local Folder'
      },
      templates: {
        clipper: 'Legacy/{title}.md'
      } as StoredOptions['templates'],
      domainMappings: { 'example.com': 'Examples' },
      yamlConfig: { fields: [] },
      customExtension: { enabled: true }
    } as StoredOptions & { customExtension: { enabled: boolean } });

    expect(result.interfaceTheme).toBe(DEFAULT_OPTIONS.interfaceTheme ?? 'system');
    expect(result.rest.baseUrl).toBe(DEFAULT_OPTIONS.rest.baseUrl);
    expect(result.rest.vault).toBe(DEFAULT_OPTIONS.rest.vault);
    expect(result.rest.apiKey).toBe(DEFAULT_OPTIONS.rest.apiKey);
    expect(result.rest.httpsUrl).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
    expect(result.rest.httpUrl).toBe('http://stored.example/');
    expect(result.rest.rootDir).toBe('Root');
    expect(result.rest.localFolderId).toBe('');
    expect(result.rest.localFolderName).toBe('Local Folder');
    expect(result.templates.fragment).toBe('Legacy/{title}.md');
    expect(result.templates.reading).toBe('Legacy/{title}.md');
    expect(result.domainMappings).toEqual({ 'example.com': 'Examples' });
    expect(result.yamlConfig).toEqual({ fields: [] });
    expect(
      (result as typeof result & { customExtension: { enabled: boolean } }).customExtension
    ).toEqual({
      enabled: true
    });
  });

  it('normalizes blank optional feature values through documented fallbacks', () => {
    const result = mergeOptions({
      aiChat: { includeTimestamps: true, userName: '' },
      video: {
        floatingPromptEnabled: false,
        promptButtonLabel: '   ',
        promptShortcut: '',
        controlBarAutoPauseEnabled: false,
        controlBarCaptureScreenshotEnabled: false,
        commentEditorAutoPause: true,
        promptPosition: { x: Number.NaN, y: 12 }
      } as StoredOptions['video'],
      experimentalAi: {
        provider: '',
        model: '   ',
        apiUrl: '',
        apiKey: '  custom-key  '
      },
      subtitleTranslation: {
        enabled: true,
        targetLanguage: ''
      }
    });

    expect(result.aiChat?.userName).toBe(DEFAULT_OPTIONS.aiChat?.userName ?? 'USER');
    expect(result.aiChat?.includeTimestamps).toBe(true);
    expect(result.video?.floatingPromptEnabled).toBe(false);
    expect(result.video?.promptButtonLabel).toBe(
      DEFAULT_OPTIONS.video?.promptButtonLabel ?? '开启视频笔记'
    );
    expect(result.video?.promptShortcut).toBe(DEFAULT_OPTIONS.video?.promptShortcut ?? 'Alt+V');
    expect(result.video?.controlBarAutoPause).toBe(false);
    expect(result.video?.controlBarScreenshot).toBe(false);
    expect(result.video?.commentEditorAutoPause).toBe(true);
    expect(result.video?.promptPosition).toEqual({ x: 0, y: 12 });
    expect(result.experimentalAi?.provider).toBe(
      DEFAULT_OPTIONS.experimentalAi?.provider ?? 'compatible'
    );
    expect(result.experimentalAi?.model).toBe(
      DEFAULT_OPTIONS.experimentalAi?.model ?? 'gpt-4.1-mini'
    );
    expect(result.experimentalAi?.apiUrl).toBe(
      DEFAULT_OPTIONS.experimentalAi?.apiUrl ?? 'https://api.openai.com/v1/chat/completions'
    );
    expect(result.experimentalAi?.apiKey).toBe('custom-key');
    expect(result.subtitleTranslation?.targetLanguage).toBe(
      DEFAULT_OPTIONS.subtitleTranslation?.targetLanguage ?? 'zh-CN'
    );
  });

  it('keeps explicit summary and vault-router settings while exposing the merger facade', () => {
    const result = optionsMerger.merge({
      deepResearch: { pureMode: true },
      pageSummary: { enabled: true },
      readingOverlaySummary: { enabled: true },
      vaultRouter: {
        defaultVaultId: 'vault-1',
        vaults: [
          {
            id: 'vault-1',
            name: 'Vault One',
            vault: 'Vault One',
            httpsUrl: 'https://vault.example/',
            httpUrl: 'http://vault.example/',
            apiKey: 'vault-key',
            enabled: true,
            rules: [
              {
                id: 'rule-1',
                vaultId: 'vault-1',
                type: 'domain',
                pattern: '*.example.com',
                enabled: true,
                priority: 1
              }
            ]
          }
        ]
      }
    });

    expect(result.deepResearch).toEqual({ pureMode: true });
    expect(result.pageSummary).toEqual({ enabled: true });
    expect(result.readingOverlaySummary).toEqual({ enabled: true });
    expect(result.vaultRouter?.defaultVaultId).toBe('vault-1');
    expect(result.vaultRouter?.vaults).toHaveLength(1);
  });
});
