import { describe, expect, it } from 'vitest';
import {
  isLocalVaultPermissionPromptMessage,
  isSupportPromptMessage
} from '../../../src/content/runtime/contentMessageGuards';

describe('content message guards', () => {
  it.each([
    [
      'accepts valid local vault prompt messages',
      {
        type: 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT',
        folderId: 'folder-1',
        folderName: 'Notes',
        vaultName: 'Main'
      },
      true
    ],
    [
      'rejects missing folder ids',
      { type: 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT', folderName: 'Notes' },
      false
    ],
    [
      'rejects non-string vault names',
      { type: 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT', folderId: 'folder-1', vaultName: 99 },
      false
    ],
    ['rejects non-object prompts', 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT', false]
  ])('%s', (_caseName, message, expected) => {
    expect(isLocalVaultPermissionPromptMessage(message)).toBe(expected);
  });

  it.each([
    [
      'accepts valid support prompts',
      {
        type: 'SHOW_SUPPORT_PROMPT',
        vaultName: 'Main',
        status: 'success',
        errorMessage: 'Saved',
        progress: { value: 100, label: 'Complete', variant: 'success' }
      },
      true
    ],
    ['rejects unsupported statuses', { type: 'SHOW_SUPPORT_PROMPT', status: 'queued' }, false],
    [
      'rejects non-string vault names',
      { type: 'SHOW_SUPPORT_PROMPT', vaultName: { name: 'Main' } },
      false
    ],
    [
      'rejects progress without a numeric value',
      { type: 'SHOW_SUPPORT_PROMPT', progress: { label: 'Uploading' } },
      false
    ],
    [
      'rejects invalid progress labels',
      { type: 'SHOW_SUPPORT_PROMPT', progress: { value: 50, label: 50 } },
      false
    ],
    ['rejects non-object support prompts', null, false]
  ])('%s', (_caseName, message, expected) => {
    expect(isSupportPromptMessage(message)).toBe(expected);
  });
});
