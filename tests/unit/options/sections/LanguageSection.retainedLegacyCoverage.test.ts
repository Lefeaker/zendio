/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { LanguageSection } from '@options/components/sections/LanguageSection';
import { OptionsStateManager } from '@options/state/StateManager';
import type { Language } from '../../../../src/i18n';
import { MockOptionsRepository } from '../../../utils/repositories';

const changeLanguageMock = vi.fn<[Language], Promise<void>>();

vi.mock('@options/app/optionsActions', () => ({
  changeLanguage: (language: Language) => changeLanguageMock(language)
}));

describe('LanguageSection', () => {
  let registry: FormSectionRegistry;
  let stateManager: OptionsStateManager;

  beforeEach(() => {
    document.body.innerHTML = '<section id="language"></section>';
    registry = new FormSectionRegistry();
    stateManager = new OptionsStateManager();
    changeLanguageMock.mockClear();
  });

  const renderSection = (
    repo: MockOptionsRepository
  ): { section: LanguageSection; select: HTMLSelectElement } => {
    const container = document.getElementById('language');
    if (!(container instanceof HTMLElement)) {
      throw new Error('language container missing');
    }
    const section = new LanguageSection(container, repo);
    section.render({ stateManager, formRegistry: registry });
    const select = container.querySelector('#languageSelect');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('language select missing');
    }
    return { section, select };
  };

  it('persists user selection via repository and calls changeLanguage once', async () => {
    const repo = new MockOptionsRepository();
    const { section, select } = renderSection(repo);

    select.value = 'fr';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(changeLanguageMock).toHaveBeenCalledTimes(1);
      expect(changeLanguageMock).toHaveBeenCalledWith('fr');
    });

    await vi.waitFor(() => {
      const stored = repo.getMockData() as { languagePreference?: { code?: Language } };
      expect(stored.languagePreference?.code).toBe('fr');
    });

    section.destroy();
  });

  it('reacts to repository updates from other contexts', async () => {
    const repo = new MockOptionsRepository();
    const { section } = renderSection(repo);

    await repo.set({
      languagePreference: {
        code: 'ja'
      }
    });

    await vi.waitFor(() => {
      expect(changeLanguageMock).toHaveBeenCalledWith('ja');
    });

    section.destroy();
  });
});
