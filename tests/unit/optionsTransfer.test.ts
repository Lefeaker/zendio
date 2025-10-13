import { describe, it, expect } from 'vitest';
import { normalizeOptionsForTransfer } from '../../src/options/utils/optionsTransfer';
import type { StoredOptions } from '../../src/shared/types';

describe('options transfer normalizer', () => {
  it('fills newly added fields with defaults when missing', () => {
    const normalized = normalizeOptionsForTransfer({});
    expect(normalized.readingSession?.highlightTheme).toBe('gradient');
    expect(normalized.video?.floatingPromptEnabled).toBe(true);
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
      customKey: { hello: 'world' }
    };
    const normalized = normalizeOptionsForTransfer(stored);
    expect(normalized.readingSession?.highlightTheme).toBe('neonOrange');
    expect(normalized.readingSession?.exportMode).toBe('full');
    expect(normalized.vaultRouter?.vaults[0].rules?.[0].pattern).toBe('example.com');
    expect((normalized as Record<string, unknown>).customKey).toEqual({ hello: 'world' });
  });
});
