import { describe, expect, it } from 'vitest';
import {
  isClipErrorMessage,
  isClipResultMessage,
  isLocalVaultPermissionPromptMessage,
  isSupportPromptMessage,
  isTestConnectionMessage,
  isTestVaultConnectionMessage,
  SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
  SHOW_SUPPORT_PROMPT
} from '@shared/types/clip';

describe('shared clip message guards', () => {
  it.each([
    [
      'accepts valid local vault prompt messages',
      {
        type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
        folderId: 'folder-1',
        folderName: 'Notes',
        vaultName: 'Main'
      },
      true
    ],
    ['rejects empty folder ids', { type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT, folderId: '' }, false],
    [
      'rejects non-string optional local vault labels',
      { type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT, folderId: 'folder-1', folderName: 12 },
      false
    ],
    ['rejects non-object local vault payloads', null, false]
  ])('%s', (_caseName, message, expected) => {
    expect(isLocalVaultPermissionPromptMessage(message)).toBe(expected);
  });

  it.each([
    [
      'accepts valid support prompt messages',
      {
        type: SHOW_SUPPORT_PROMPT,
        vaultName: 'Main',
        status: 'progress',
        errorMessage: 'Working',
        progress: { value: 40, label: 'Uploading', variant: 'progress' }
      },
      true
    ],
    ['rejects unsupported statuses', { type: SHOW_SUPPORT_PROMPT, status: 'pending' }, false],
    [
      'rejects progress without a numeric value',
      { type: SHOW_SUPPORT_PROMPT, progress: { label: 'Uploading' } },
      false
    ],
    [
      'rejects invalid progress variants',
      { type: SHOW_SUPPORT_PROMPT, progress: { value: 1, variant: 'pending' } },
      false
    ],
    [
      'rejects non-string error messages',
      { type: SHOW_SUPPORT_PROMPT, errorMessage: { message: 'nope' } },
      false
    ]
  ])('%s', (_caseName, message, expected) => {
    expect(isSupportPromptMessage(message)).toBe(expected);
  });

  it('classifies runtime message envelopes by type', () => {
    expect(isClipResultMessage({ type: 'CLIP_RESULT', payload: { markdown: '# Note' } })).toBe(
      true
    );
    expect(isClipErrorMessage({ type: 'CLIP_ERROR', error: new Error('boom') })).toBe(true);
    expect(isTestConnectionMessage({ type: 'TEST_CONNECTION', rest: { port: 27123 } })).toBe(true);
    expect(isTestConnectionMessage({ type: 'TEST_CONNECTION', rest: 'bad' })).toBe(false);
    expect(
      isTestVaultConnectionMessage({ type: 'TEST_VAULT_CONNECTION', vaultId: 'vault-1' })
    ).toBe(true);
    expect(isTestVaultConnectionMessage({ type: 'TEST_VAULT_CONNECTION', vaultId: '' })).toBe(
      false
    );
  });
});
