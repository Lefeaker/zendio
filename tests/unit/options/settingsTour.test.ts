/* @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsTour } from '../../../src/options/app/settingsTour';
import { settingsTourSteps } from '../../../src/options/app/settingsTourSteps';
import { SETTINGS_GUIDE_BASICS, SETTINGS_GUIDE_SECTIONS } from '../../../src/shared/settingsGuide';
import en from '../../../src/i18n/generated/locales/en.generated';

const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn()
  });
});
afterEach(() => {
  if (originalScroll)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
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
    expect(firefox.find((step) => step.id === 'rest')?.link?.[1]).toBe(
      'https://github.com/coddingtonbear/obsidian-local-rest-api'
    );
  });
  it('finishes a standalone topic without sending the user into routing, and offers a real practice', () => {
    history.replaceState(null, '', '/?guide=vault');
    const root = document.createElement('main');
    root.innerHTML =
      '<section data-panel-id="storage"><div class="card"><div class="storage-vault-table-scroll"><input value="keep"></div></div></section>';
    document.body.append(root);
    const tour = mountSettingsTour({
      root,
      firefox: false,
      getMessages: () => en.runtime,
      scrollToPanel: vi.fn()
    });
    document.getElementById('settingsTourNext')?.click();
    expect(document.getElementById('settingsTourTitle')?.textContent).toBe(
      en.runtime.settingsTourFinishTitle
    );
    expect(new URL(location.href).searchParams.get('guide')).toBe('vault');
    expect(document.querySelector('.settings-tour-target')).toBeNull();
    expect(document.getElementById('settingsTourVerify')?.getAttribute('href')).toMatch(
      /practice.html\?lesson=fragment&run=/
    );
    expect(root.querySelector('input')?.value).toBe('keep');
    tour?.dispose();
  });
  it('keeps the basic route short, allows direct topics and follows explicit section navigation', () => {
    history.replaceState(null, '', '/?guide=overview&guideMode=basics');
    const root = document.createElement('main');
    document.body.append(root);
    const tour = mountSettingsTour({
      root,
      firefox: false,
      getMessages: () => en.runtime,
      scrollToPanel: vi.fn()
    });
    const select = document.querySelector<HTMLSelectElement>('#settingsTourTopics');
    for (const step of SETTINGS_GUIDE_BASICS) {
      expect(select?.value).toBe(step);
      document.getElementById('settingsTourNext')?.click();
    }
    expect(document.getElementById('settingsTourVerify')?.hidden).toBe(false);
    expect(document.getElementById('settingsTourVerify')?.getAttribute('href')).toBe(
      '../onboarding/index.html'
    );
    expect(tour?.navigateToPanel('output')).toBe(true);
    expect(select?.value).toBe('output');
    expect(new URL(location.href).searchParams.has('guideMode')).toBe(false);
    if (select) {
      select.value = 'yaml';
      select.dispatchEvent(new Event('change'));
    }
    expect(new URL(location.href).searchParams.get('guide')).toBe('yaml');
    expect(document.getElementById('settingsTourPrevious')?.hidden).toBe(true);
    expect(select?.querySelectorAll('optgroup')).toHaveLength(6);
    if (select) {
      select.value = 'sources';
      select.dispatchEvent(new Event('change'));
    }
    document.getElementById('settingsTourNext')?.click();
    expect(document.getElementById('settingsTourVerify')?.getAttribute('href')).toBe(
      '../onboarding/index.html'
    );
    tour?.dispose();
    expect(tour?.navigateToPanel('storage')).toBe(false);
  });
  it('collapses without losing the selected topic and handles Escape from a settings input', () => {
    history.replaceState(null, '', '/?guide=selection');
    const root = document.createElement('main');
    root.innerHTML =
      '<section data-panel-id="capture-behavior"><input class="selection-trigger-inline" value="preserved"></section>';
    document.body.append(root);
    const tour = mountSettingsTour({
      root,
      firefox: false,
      getMessages: () => en.runtime,
      scrollToPanel: vi.fn()
    });
    document.getElementById('settingsTourToggle')?.click();
    expect(document.body.classList.contains('settings-tour-collapsed')).toBe(true);
    expect(document.getElementById('settingsTourContent')?.hidden).toBe(true);
    document.getElementById('settingsTourToggle')?.click();
    expect(document.querySelector<HTMLSelectElement>('#settingsTourTopics')?.value).toBe(
      'selection'
    );
    root
      .querySelector('input')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('settingsTour')).toBeNull();
    expect(document.body.classList.contains('settings-tour-active')).toBe(false);
    expect(root.querySelector('input')?.value).toBe('preserved');
    tour?.dispose();
  });
});
