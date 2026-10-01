/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsTour } from '../../../src/options/app/settingsTour';
import { settingsTourSteps } from '../../../src/options/app/settingsTourSteps';
import { SETTINGS_GUIDE_SECTIONS } from '../../../src/shared/settingsGuide';
import en from '../../../src/i18n/generated/locales/en.generated';

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('Options tour', () => {
  it('guides real controls, follows replacements and removes its UI without changing form values', async () => {
    history.replaceState(null, '', '/?guide=selection');
    const root = document.createElement('main');
    root.innerHTML =
      '<section data-panel-id="capture-behavior"><input class="selection-trigger-inline" value="untouched"></section>';
    document.body.append(root);
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
    const tour = mountSettingsTour({
      root,
      firefox: false,
      getMessages: () => en.runtime,
      scrollToPanel: scroll
    });
    expect(scroll).toHaveBeenCalledWith('capture-behavior');
    expect(root.querySelector('.settings-tour-target')).toBe(root.querySelector('input'));
    expect(root.querySelector('input')?.value).toBe('untouched');
    root.innerHTML =
      '<section data-panel-id="capture-behavior"><input class="selection-trigger-inline" value="edited"></section>';
    await vi.waitFor(() =>
      expect(root.querySelector('.settings-tour-target')).toBe(root.querySelector('input'))
    );
    tour?.dispose();
    expect(document.querySelector('#settingsTour')).toBeNull();
    expect(root.querySelector('.settings-tour-target')).toBeNull();
    expect(root.querySelector('input')?.value).toBe('edited');
    expect(location.search).toBe('');
  });
  it('covers every live section and gives Firefox REST instructions instead of local-folder instructions', () => {
    const firefox = settingsTourSteps(en.runtime, true);
    expect(new Set(firefox.map((step) => SETTINGS_GUIDE_SECTIONS[step.id]))).toEqual(
      new Set([
        'overview',
        'storage',
        'capture-sources',
        'capture-behavior',
        'output',
        'maintenance'
      ])
    );
    const vault = firefox.find((step) => step.id === 'vault');
    expect(vault?.text).toContain(en.runtime.settingsVaultFirefox);
    expect(vault?.text).not.toContain(en.runtime.settingsVaultLocal);
    expect(vault?.link?.[1]).toBe('https://github.com/coddingtonbear/obsidian-local-rest-api');
  });
});
