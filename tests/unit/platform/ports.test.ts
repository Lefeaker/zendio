import { describe, it, expect } from 'vitest';
import { collectPortEntriesFromConfig, extractPort, findDuplicatePorts } from '@options/utils/ports';
import type { VaultConfig } from '@shared/types';
import { getRestDefaults } from '../../utils/restDefaults';

describe('ports utils', () => {
  it('extractPort returns the numeric port when present', () => {
    const restDefaults = getRestDefaults();
    const expectedPort = restDefaults.httpsPort ? String(restDefaults.httpsPort) : null;
    expect(extractPort(restDefaults.httpsUrl)).toBe(expectedPort);
    expect(extractPort('http://localhost:8080')).toBe('8080');
    expect(extractPort('localhost')).toBeNull();
  });

  it('findDuplicatePorts detects conflicts across different vaults', () => {
    const restDefaults = getRestDefaults();
    const entries = collectPortEntriesFromConfig(
      { httpsUrl: restDefaults.httpsUrl },
      [
        createVaultConfig({
          id: 'vault-1',
          httpsUrl: 'https://127.0.0.1:27125/'
        }),
        createVaultConfig({
          id: 'vault-2',
          httpsUrl: restDefaults.httpsUrl
        })
      ]
    );

    const duplicates = findDuplicatePorts(entries);
    expect(duplicates).toEqual(expectedPorts(restDefaults.httpsPort));
  });

  it('ignores duplicate ports within the same vault id', () => {
    const restDefaults = getRestDefaults();
    const entries = collectPortEntriesFromConfig(undefined, [
      createVaultConfig({
        id: 'vault-1',
        httpsUrl: restDefaults.httpsUrl,
        httpUrl: restDefaults.httpUrl
      })
    ]);

    const duplicates = findDuplicatePorts(entries);
    expect(duplicates).toHaveLength(0);
  });
});

function expectedPorts(port?: number): string[] {
  return typeof port === 'number' ? [String(port)] : [];
}

function createVaultConfig(overrides: Partial<VaultConfig>): VaultConfig {
  return {
    id: 'vault-id',
    name: 'Test Vault',
    httpsUrl: 'https://127.0.0.1:27125/',
    httpUrl: 'http://127.0.0.1:27124/',
    vault: 'Vault',
    apiKey: 'key',
    enabled: true,
    ...overrides
  };
}
