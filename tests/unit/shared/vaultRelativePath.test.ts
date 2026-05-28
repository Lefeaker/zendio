import { describe, expect, it } from 'vitest';
import { normalizeVaultRelativePath } from '../../../src/shared/paths/vaultRelativePath';

describe('normalizeVaultRelativePath', () => {
  it.each(['', '/', '.', '..', 'folder/../file.md', 'folder/./file.md', 'Vault/../file.md'])(
    'rejects unsafe vault-relative path %j',
    (input) => {
      expect(() => normalizeVaultRelativePath(input)).toThrow();
    }
  );

  it.each([
    ['Inbox/file.md', 'Inbox/file.md'],
    ['/Inbox/file.md', 'Inbox/file.md'],
    ['Inbox\\nested\\file.md', 'Inbox/nested/file.md'],
    [' Inbox / nested / file.md ', 'Inbox/nested/file.md'],
    ['Inbox/nested/file with spaces.md', 'Inbox/nested/file with spaces.md']
  ])('normalizes safe vault-relative path %j', (input, expected) => {
    expect(normalizeVaultRelativePath(input)).toBe(expected);
  });

  it.each([
    ['Vault/Inbox/file.md', 'Inbox/file.md'],
    ['/Vault/Inbox/file.md', 'Inbox/file.md']
  ])('removes one matching vault-name prefix from %j', (input, expected) => {
    expect(normalizeVaultRelativePath(input, { vaultName: 'Vault' })).toBe(expected);
  });

  it.each(['', '/'])('allows empty path %j when requested', (input) => {
    expect(normalizeVaultRelativePath(input, { allowEmpty: true })).toBe('');
  });
});
