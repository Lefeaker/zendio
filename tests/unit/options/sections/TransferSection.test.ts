/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { TransferSection } from '@options/components/sections/TransferSection';
import { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const copyConfigMock = vi.fn<[], Promise<void>>();
const importConfigMock = vi.fn<[], Promise<void>>();

vi.mock('@options/app/optionsActions', () => ({
  copyConfig: () => copyConfigMock(),
  importConfig: () => importConfigMock()
}));

describe('TransferSection', () => {
  let registry: FormSectionRegistry;
  let stateManager: OptionsStateManager;

  beforeEach(() => {
    document.body.innerHTML = '<section id="transfer"></section>';
    registry = new FormSectionRegistry();
    stateManager = new OptionsStateManager();
    copyConfigMock.mockResolvedValue(undefined);
    importConfigMock.mockResolvedValue(undefined);
  });

  const renderSection = (repo: MockOptionsRepository): { section: TransferSection; container: HTMLElement } => {
    const container = document.getElementById('transfer');
    if (!(container instanceof HTMLElement)) {
      throw new Error('transfer container missing');
    }
    const section = new TransferSection(container, repo);
    section.render({ stateManager, formRegistry: registry });
    return { section, container };
  };

  it('persists transfer log after copy', async () => {
    const repo = new MockOptionsRepository();
    const { section, container } = renderSection(repo);
    const copyButton = container.querySelector<HTMLButtonElement>('#copyConfigBtn');
    if (!copyButton) {
      throw new Error('copy button missing');
    }

    copyButton.click();

    await vi.waitFor(() => {
      expect(copyConfigMock).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      const snapshot = repo.getMockData() as { transferLog?: { lastAction: string } };
      expect(snapshot.transferLog?.lastAction).toBe('copy');
    });

    section.destroy();
  });

  it('renders transfer history when repository updates', async () => {
    const repo = new MockOptionsRepository();
    const { section, container } = renderSection(repo);
    section.setMessages({
      copyConfigSuccess: '复制成功',
      importSuccess: '导入成功'
    } as unknown as typeof section['messages']);

    await repo.set({
      transferLog: {
        lastAction: 'import',
        timestamp: Date.now()
      }
    });

    await vi.waitFor(() => {
      const messageArea = container.querySelector<HTMLElement>('#transferMessage');
      expect(messageArea?.hidden).toBe(false);
      expect(messageArea?.textContent).toContain('导入成功');
    });

    section.destroy();
  });
});
