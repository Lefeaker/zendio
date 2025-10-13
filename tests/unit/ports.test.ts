import { describe, it, expect } from 'vitest';
import { collectPortEntriesFromConfig, extractPort, findDuplicatePorts } from '../../src/options/utils/ports';

describe('ports utils', () => {
  it('extractPort returns the numeric port when present', () => {
    expect(extractPort('https://127.0.0.1:27124/')).toBe('27124');
    expect(extractPort('http://localhost:8080')).toBe('8080');
    expect(extractPort('localhost')).toBeNull();
  });

  it('findDuplicatePorts detects conflicts across different vaults', () => {
    const entries = collectPortEntriesFromConfig(
      { httpsUrl: 'https://127.0.0.1:27124/' },
      [
        { id: 'vault-1', httpsUrl: 'https://127.0.0.1:27125/' } as any,
        { id: 'vault-2', httpsUrl: 'https://127.0.0.1:27124/' } as any
      ]
    );

    const duplicates = findDuplicatePorts(entries);
    expect(duplicates).toEqual(['27124']);
  });

  it('ignores duplicate ports within the same vault id', () => {
    const entries = collectPortEntriesFromConfig(
      undefined,
      [
        {
          id: 'vault-1',
          httpsUrl: 'https://127.0.0.1:27124/',
          httpUrl: 'http://127.0.0.1:27124/'
        } as any
      ]
    );

    const duplicates = findDuplicatePorts(entries);
    expect(duplicates).toHaveLength(0);
  });
});
