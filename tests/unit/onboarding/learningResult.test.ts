/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyLearningPath, revealLearningResult } from '../../../src/onboarding/learningResult';
import type { LearningReceipt } from '../../../src/shared/learningProgress';

const navigation = { openVault: vi.fn(), openOptions: vi.fn(), openExternalLink: vi.fn() };
const receipt: LearningReceipt = {
  operationId: 'saved',
  destination: 'downloads',
  filePath: '/Downloads/actual (1).md',
  downloadId: 9,
  savedAt: 1
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('saved note actions', () => {
  it('reveals the confirmed download and propagates unavailable or failed reveal', async () => {
    const show = vi.fn().mockResolvedValue(undefined);
    await revealLearningResult(receipt, navigation, { show, download: vi.fn() });
    expect(show).toHaveBeenCalledWith(9);
    show.mockRejectedValue(new Error('File removed'));
    await expect(
      revealLearningResult(receipt, navigation, { show, download: vi.fn() })
    ).rejects.toThrow('File removed');
    await expect(revealLearningResult(receipt, navigation)).rejects.toThrow();
    expect(navigation.openVault).not.toHaveBeenCalled();
  });
  it('opens the specific vault note and copies the actual saved path', async () => {
    const vault: LearningReceipt = {
      ...receipt,
      destination: 'vault',
      vaultName: 'My Vault',
      filePath: 'notes/a b.md'
    };
    await revealLearningResult(vault, navigation);
    expect(navigation.openVault).toHaveBeenCalledWith(
      'obsidian://open?vault=My%20Vault&file=notes%2Fa%20b.md'
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copyLearningPath(receipt);
    expect(writeText).toHaveBeenCalledWith('/Downloads/actual (1).md');
    writeText.mockRejectedValue(new Error('Clipboard unavailable'));
    await expect(copyLearningPath(receipt)).rejects.toThrow('Clipboard unavailable');
  });
});
