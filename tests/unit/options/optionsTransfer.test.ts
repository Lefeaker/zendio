import { describe, it, expect } from 'vitest';
import { normalizeOptionsForTransfer } from '@options/utils/optionsTransfer';
import type { StoredOptions } from '@shared/types';

describe('options transfer normalizer', () => {
  it('fills newly added fields with defaults when missing', () => {
    const normalized = normalizeOptionsForTransfer({});
    expect(normalized.readingSession?.highlightTheme).toBe('gradient');
    expect(normalized.video?.floatingPromptEnabled).toBe(true);
    expect(normalized.video?.promptButtonLabel).toBe('开启视频笔记');
    expect(normalized.video?.promptShortcut).toBe('Alt+V');
  });

  it('preserves existing user selections for new fields', () => {
    const stored: StoredOptions = {
      readingSession: {
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      },
      vaultRouter: {
        vaults: [
          {
            id: 'extra',
            name: 'ExtraVault',
            httpsUrl: 'https://127.0.0.1:3000/',
            httpUrl: 'http://127.0.0.1:3001/',
            vault: 'ExtraVault',
            apiKey: 'token',
            isDefault: false,
            rules: [
              {
                id: 'rule-1',
                type: 'domain',
                pattern: 'example.com',
                enabled: true,
                priority: 10,
                vaultId: 'extra'
              }
            ]
          }
        ],
        defaultVaultId: 'extra'
      },
      video: {
        floatingPromptEnabled: false,
        promptButtonLabel: 'Start Video Notes',
        promptShortcut: 'cmd+shift+v'
      },
      customKey: { hello: 'world' }
    };
    const normalized = normalizeOptionsForTransfer(stored);
    expect(normalized.readingSession?.highlightTheme).toBe('neonOrange');
    expect(normalized.readingSession?.exportMode).toBe('full');
    expect(normalized.video?.promptButtonLabel).toBe('Start Video Notes');
    expect(normalized.video?.promptShortcut).toBe('CMD+SHIFT+V');
    expect(normalized.vaultRouter?.vaults[0].rules?.[0].pattern).toBe('example.com');
    expect((normalized as Record<string, unknown>).customKey).toEqual({ hello: 'world' });
  });

  it('includes sanitized yaml config overrides in transfer payload', () => {
    const stored: StoredOptions = {
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [{ name: 'alias', type: 'text', enabled: true, valuePath: 'title' }]
          },
          clipper: {
            domainOverrides: {
              '*.example.com': [
                { name: 'tags', type: 'array', enabled: true, defaultValue: ['clip'] }
              ]
            }
          }
        }
      }
    };

    const normalized = normalizeOptionsForTransfer(stored);
    expect(normalized.yamlConfig).toEqual({
      contentTypes: {
        article: {
          customFields: [
            { name: 'alias', type: 'text', enabled: true, valuePath: 'title', isCustom: true }
          ]
        },
        clipper: {
          domainOverrides: {
            '*.example.com': [
              { name: 'tags', type: 'array', enabled: true, defaultValue: ['clip'] }
            ]
          }
        }
      }
    });
  });

  it('explicitly sets yamlConfig to null when overrides sanitize away', () => {
    const stored: StoredOptions = {
      yamlConfig: {
        contentTypes: {
          article: {
            fields: []
          }
        }
      }
    };

    const normalized = normalizeOptionsForTransfer(stored);
    expect(normalized.yamlConfig).toBeNull();
  });
});
