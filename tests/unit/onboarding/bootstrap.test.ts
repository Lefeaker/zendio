/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDefaultPageI18nControllerMock = vi.hoisted(() =>
  vi.fn(() => ({
    load: vi.fn(() => Promise.resolve(undefined)),
    mount: vi.fn(),
    getCurrentResource: vi.fn(() => ({
      messages: { supportModalTitle: 'Support', supportModalDescription: 'Help us' }
    }))
  }))
);
const configureI18nStorageMock = vi.hoisted(() => vi.fn());
const resolveRepositoryMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/i18n', () => ({
  createDefaultPageI18nController: createDefaultPageI18nControllerMock,
  configureI18nStorage: configureI18nStorageMock
}));
vi.mock('../../../src/shared/di/serviceRegistry', () => ({
  resolveRepository: resolveRepositoryMock
}));
vi.mock('../../../src/shared/di', () => ({
  getService: getServiceMock
}));

function installLocalStorageMock(): void {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      }
    }
  });
}

function buildOnboardingDom(): void {
  document.body.innerHTML = `
    <button id="openVault"></button>
    <button id="configureApiBtn"></button>
    <button id="skipStep1Btn"></button>
    <button id="configureVaultsBtn"></button>
    <button id="skipStep2Btn"></button>
    <button id="exploreSettingsBtn"></button>
    <button id="skipStep3Btn"></button>
    <button id="exploreAuxiliaryBtn"></button>
    <button id="skipStep4Btn"></button>
    <a id="suggestionsLink" href="#"></a>
    <a id="supportLink" href="#"></a>
    <a id="contactLink" href="#"></a>
    <button id="skipOnboardingBtn"></button>
    <button id="completeOnboardingBtn" class="hidden"></button>
    <div id="progressBar"></div>
    <div id="step1"></div>
    <div id="step2"></div>
    <div id="step3"></div>
    <div id="step4"></div>
    <div id="step5"></div>
  `;
}

describe('onboarding bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installLocalStorageMock();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as never);
    localStorage.clear();
    buildOnboardingDom();
  });

  it('restores completed steps and updates progress on initialize', async () => {
    const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
    localStorage.setItem('onboardingCompletedSteps', JSON.stringify([1, 3]));
    const controller = new OnboardingController(
      {
        openVault: vi.fn(() => Promise.resolve(undefined)),
        openOptions: vi.fn(() => Promise.resolve(undefined)),
        openExternalLink: vi.fn(() => Promise.resolve(undefined))
      } as never,
      {
        storage: { local: { set: vi.fn(() => Promise.resolve(undefined)) } },
        tabs: {
          getCurrent: vi.fn(() => Promise.resolve(undefined)),
          remove: vi.fn(() => Promise.resolve(undefined))
        }
      } as never
    );

    controller.initialize();

    expect(localStorage.getItem('onboardingCompletedSteps')).toContain('1');
    expect(document.getElementById('step3')?.classList.contains('step-completed')).toBe(true);
    expect(document.getElementById('progressBar')?.getAttribute('style')).toContain('width: 40%');
  });

  it('marks steps, opens support flow, and completes onboarding lifecycle', async () => {
    const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
    const navigationRepo = {
      openVault: vi.fn(() => Promise.resolve(undefined)),
      openOptions: vi.fn(() => Promise.resolve(undefined)),
      openExternalLink: vi.fn(() => Promise.resolve(undefined))
    };
    const storageSet = vi.fn(() => Promise.resolve(undefined));
    const tabsRemove = vi.fn(() => Promise.resolve(undefined));
    const controller = new OnboardingController(
      navigationRepo as never,
      {
        storage: { local: { set: storageSet } },
        tabs: { getCurrent: vi.fn(() => Promise.resolve({ id: 77 })), remove: tabsRemove }
      } as never
    );

    controller.initialize();
    document
      .getElementById('configureApiBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigationRepo.openOptions).toHaveBeenCalledTimes(1);

    document
      .getElementById('skipStep1Btn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(localStorage.getItem('onboardingCompletedSteps') ?? '').toContain('1');

    document
      .getElementById('suggestionsLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigationRepo.openExternalLink).toHaveBeenCalledWith(
      'https://github.com/Lefeaker/AllinOB/issues'
    );

    document
      .getElementById('skipOnboardingBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(storageSet).toHaveBeenCalledWith('onboardingCompleted', true);
  });

  it('bootstraps controller from resolved dependencies', async () => {
    const navigationRepo = {
      openVault: vi.fn(() => Promise.resolve(undefined)),
      openOptions: vi.fn(() => Promise.resolve(undefined)),
      openExternalLink: vi.fn(() => Promise.resolve(undefined))
    };
    resolveRepositoryMock.mockReturnValue(navigationRepo);
    getServiceMock.mockReturnValue({
      storage: { local: { set: vi.fn(() => Promise.resolve(undefined)) } },
      tabs: {
        getCurrent: vi.fn(() => Promise.resolve(undefined)),
        remove: vi.fn(() => Promise.resolve(undefined))
      }
    });

    const mod = await import('../../../src/onboarding/bootstrap');
    await mod.bootstrapOnboardingApp();

    document
      .getElementById('configureVaultsBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(navigationRepo.openOptions).toHaveBeenCalledTimes(1);
    expect(createDefaultPageI18nControllerMock).toHaveBeenCalledTimes(1);
  });

  it('applies the stored options theme during bootstrap', async () => {
    const navigationRepo = {
      openVault: vi.fn(() => Promise.resolve(undefined)),
      openOptions: vi.fn(() => Promise.resolve(undefined)),
      openExternalLink: vi.fn(() => Promise.resolve(undefined))
    };
    const optionsRepo = {
      get: vi.fn(() => Promise.resolve({ interfaceTheme: 'light' }))
    };
    resolveRepositoryMock.mockReturnValueOnce(optionsRepo).mockReturnValue(navigationRepo);
    getServiceMock.mockReturnValue({
      storage: { local: { set: vi.fn(() => Promise.resolve(undefined)) } },
      tabs: {
        getCurrent: vi.fn(() => Promise.resolve(undefined)),
        remove: vi.fn(() => Promise.resolve(undefined))
      }
    });

    const mod = await import('../../../src/onboarding/bootstrap');
    await mod.bootstrapOnboardingApp();

    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.body.dataset.previewTheme).toBe('light');
  });
});
