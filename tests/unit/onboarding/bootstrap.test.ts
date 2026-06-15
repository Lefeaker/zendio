/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type OnboardingRuntimeMessagesMock = Partial<{
  onboardingDocumentTitle: string;
  onboardingSupportModalTitle: string;
  onboardingSupportModalDescription: string;
  onboardingSupportModalCloseButton: string;
  onboardingSupportModalAfdianLabel: string;
}>;

const currentResourceMock = vi.hoisted<{
  value: { language: string; messages: OnboardingRuntimeMessagesMock };
}>(() => ({
  value: {
    language: 'en',
    messages: {
      onboardingDocumentTitle: 'Zendio',
      onboardingSupportModalTitle: 'Thank You for Your Support',
      onboardingSupportModalDescription:
        'Development is not easy. If this plugin helps you, welcome to support through the following ways:',
      onboardingSupportModalCloseButton: 'Close',
      onboardingSupportModalAfdianLabel: 'Afdian'
    }
  }
}));
const pageI18nControllerMock = vi.hoisted(() => ({
  load: vi.fn(() => Promise.resolve(undefined)),
  mount: vi.fn(),
  getCurrentResource: vi.fn(() => currentResourceMock.value)
}));
const createDefaultPageI18nControllerMock = vi.hoisted(() => vi.fn(() => pageI18nControllerMock));
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
  document.documentElement.lang = 'zh-CN';
  document.title = 'Zendio - 欢迎使用';
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

async function waitForSentMessage(
  send: (message: unknown) => unknown,
  message: unknown
): Promise<void> {
  await vi.waitFor(() => {
    expect(send).toHaveBeenCalledWith(message);
  });
}

function createStorageAreaMock() {
  return {
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve(undefined)),
    getMany: vi.fn(() => Promise.resolve({})),
    setMany: vi.fn(() => Promise.resolve(undefined)),
    remove: vi.fn(() => Promise.resolve(undefined)),
    clear: vi.fn(() => Promise.resolve(undefined)),
    watchKey: vi.fn(() => () => {}),
    watchAll: vi.fn(() => () => {})
  };
}

async function createSupportModalTestController() {
  const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
  type ModalTestDependencies = NonNullable<ConstructorParameters<typeof OnboardingController>[1]>;
  type ModalTestTabs = ModalTestDependencies['tabs'];
  const syncArea = createStorageAreaMock();
  const localArea = createStorageAreaMock();
  const sendMessage: ModalTestTabs['sendMessage'] = (
    _tabId: Parameters<ModalTestTabs['sendMessage']>[0],
    _message: Parameters<ModalTestTabs['sendMessage']>[1],
    _options?: Parameters<ModalTestTabs['sendMessage']>[2]
  ) => new Promise<never>(() => {});
  const navigationRepo = {
    openVault: vi.fn(() => Promise.resolve(undefined)),
    openOptions: vi.fn(() => Promise.resolve(undefined)),
    openExternalLink: vi.fn(() => Promise.resolve(undefined))
  } satisfies ConstructorParameters<typeof OnboardingController>[0];
  const dependencies = {
    storage: {
      sync: syncArea,
      local: localArea
    },
    tabs: {
      create: vi.fn(() => Promise.resolve(undefined)),
      getCurrent: vi.fn(() => Promise.resolve(undefined)),
      remove: vi.fn(() => Promise.resolve(undefined)),
      get: vi.fn(() => Promise.resolve(undefined)),
      query: vi.fn(() => Promise.resolve([])),
      sendMessage,
      onActivated: vi.fn(() => () => {}),
      onUpdated: vi.fn(() => () => {}),
      onRemoved: vi.fn(() => () => {})
    }
  } satisfies ConstructorParameters<typeof OnboardingController>[1];

  return new OnboardingController(navigationRepo, dependencies);
}

describe('onboarding bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    currentResourceMock.value = {
      language: 'en',
      messages: {
        onboardingDocumentTitle: 'Zendio',
        onboardingSupportModalTitle: 'Thank You for Your Support',
        onboardingSupportModalDescription:
          'Development is not easy. If this plugin helps you, welcome to support through the following ways:',
        onboardingSupportModalCloseButton: 'Close',
        onboardingSupportModalAfdianLabel: 'Afdian'
      }
    };
    installLocalStorageMock();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as never);
    localStorage.clear();
    buildOnboardingDom();
  });

  it('sets document lang and title from the active onboarding runtime resource', async () => {
    currentResourceMock.value = {
      language: 'zh-CN',
      messages: {
        onboardingDocumentTitle: '欢迎使用 Zendio',
        onboardingSupportModalTitle: '感谢支持',
        onboardingSupportModalDescription: '如果这个插件对您有帮助，欢迎支持。',
        onboardingSupportModalCloseButton: '关闭',
        onboardingSupportModalAfdianLabel: '爱发电'
      }
    };
    resolveRepositoryMock.mockReturnValue({
      openVault: vi.fn(() => Promise.resolve(undefined)),
      openOptions: vi.fn(() => Promise.resolve(undefined)),
      openExternalLink: vi.fn(() => Promise.resolve(undefined))
    });

    const { bootstrapOnboardingApp } = await import('../../../src/onboarding/bootstrap');
    await bootstrapOnboardingApp();

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe('欢迎使用 Zendio');
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

  it('renders the support modal from onboarding catalog messages', async () => {
    currentResourceMock.value = {
      language: 'en',
      messages: {
        onboardingDocumentTitle: 'Zendio',
        onboardingSupportModalTitle: 'Support Title Sentinel',
        onboardingSupportModalDescription: 'Support Description Sentinel',
        onboardingSupportModalCloseButton: 'Dismiss Support Sentinel',
        onboardingSupportModalAfdianLabel: 'Afdian Label Sentinel'
      }
    };

    const controller = await createSupportModalTestController();

    controller.initialize();
    document
      .getElementById('supportLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const modal = document.querySelector('.support-modal');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Support Title Sentinel');
    expect(modal?.textContent).toContain('Support Description Sentinel');
    expect(modal?.textContent).toContain('Afdian Label Sentinel');
    expect(modal?.textContent).not.toContain('感谢支持');
    expect(modal?.textContent).not.toContain('爱发电');
    expect(
      modal?.querySelector<HTMLButtonElement>('.support-modal-close')?.getAttribute('aria-label')
    ).toBe('Dismiss Support Sentinel');
  });

  it('uses English-only support modal fallback before onboarding messages are available', async () => {
    currentResourceMock.value = {
      language: 'en',
      messages: {}
    };

    const controller = await createSupportModalTestController();

    controller.initialize();
    document
      .getElementById('supportLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const modal = document.querySelector('.support-modal');
    const modalText = modal?.textContent ?? '';
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Zendio');
    expect(modalText).toContain('Thank You for Your Support');
    expect(modalText).toContain('Development is not easy.');
    expect(modalText).toContain('Afdian');
    expect(modalText).not.toMatch(/\p{Script=Han}/u);
    expect(
      modal?.querySelector<HTMLButtonElement>('.support-modal-close')?.getAttribute('aria-label')
    ).toBe('Close');
  });

  it('emits catalog-safe onboarding lifecycle telemetry for consented users', async () => {
    const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
    const navigationRepo = {
      openVault: vi.fn(() => Promise.resolve(undefined)),
      openOptions: vi.fn(() => Promise.resolve(undefined)),
      openExternalLink: vi.fn(() => Promise.resolve(undefined))
    };
    let now = 0;
    const messagingRepository = {
      send: vi.fn(() => Promise.resolve(undefined))
    };
    const optionsRepository = {
      get: vi.fn(() =>
        Promise.resolve({
          privacyPreferences: {
            analytics: true
          }
        })
      )
    };
    const controller = new OnboardingController(
      navigationRepo as never,
      {
        storage: { local: { set: vi.fn(() => Promise.resolve(undefined)) } },
        tabs: {
          getCurrent: vi.fn(() => Promise.resolve({ id: 42 })),
          remove: vi.fn(() => Promise.resolve(undefined))
        },
        messagingRepository,
        now: () => now,
        optionsRepository
      } as never
    );

    controller.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_started',
      params: { source: 'install' }
    });

    now = 150;
    document
      .getElementById('configureApiBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_step_completed',
      params: {
        step: 'welcome',
        duration_bucket: '100ms_to_499ms'
      }
    });
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_step_completed',
      params: {
        step: 'welcome',
        duration_ms: 150,
        step_index: 1
      }
    });

    now = 400;
    document
      .getElementById('skipStep2Btn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_skipped',
      params: {
        step: 'vault'
      }
    });
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_step_completed',
      params: {
        step: 'vault',
        duration_bucket: '100ms_to_499ms'
      }
    });

    now = 3_500;
    document
      .getElementById('supportLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(localStorage.getItem('onboardingCompletedSteps') ?? '').toContain('5');
    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_support_action',
      params: {
        action: 'docs'
      }
    });
    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_step_completed',
      params: {
        step: 'finish',
        duration_bucket: '3s_to_9s'
      }
    });
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_support_action',
      params: {
        action: 'docs',
        url: 'https://ko-fi.com/xiannian'
      }
    });

    now = 4_500;
    document
      .getElementById('skipOnboardingBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_completed',
      params: {
        duration_bucket: '3s_to_9s'
      }
    });
  });

  it('emits feedback/contact support actions without changing base contact completion semantics', async () => {
    const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
    const messagingRepository = {
      send: vi.fn(() => Promise.resolve(undefined))
    };
    const optionsRepository = {
      get: vi.fn(() =>
        Promise.resolve({
          privacyPreferences: {
            analytics: true
          }
        })
      )
    };
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
        },
        messagingRepository,
        now: () => 3_200,
        optionsRepository
      } as never
    );

    controller.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));
    localStorage.removeItem('onboardingCompletedSteps');

    document
      .getElementById('contactLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.open).toHaveBeenCalledWith(
      'https://github.com/Lefeaker/AllinOB',
      '_blank',
      'noopener,noreferrer'
    );
    expect(localStorage.getItem('onboardingCompletedSteps')).toBeNull();
    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_support_action',
      params: {
        action: 'contact'
      }
    });
    expect(messagingRepository.send).not.toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_step_completed',
      params: {
        step: 'finish',
        duration_bucket: '3s_to_9s'
      }
    });

    document
      .getElementById('suggestionsLink')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitForSentMessage(messagingRepository.send, {
      type: 'ANALYTICS_EVENT',
      event: 'onboarding_support_action',
      params: {
        action: 'feedback'
      }
    });
    expect(localStorage.getItem('onboardingCompletedSteps') ?? '').toContain('5');
  });

  it('does not emit onboarding telemetry before analytics consent exists', async () => {
    const { OnboardingController } = await import('../../../src/onboarding/bootstrap');
    const messagingRepository = {
      send: vi.fn(() => Promise.resolve(undefined))
    };
    const optionsRepository = {
      get: vi.fn(() =>
        Promise.resolve({
          privacyPreferences: {
            analytics: false
          }
        })
      )
    };
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
        },
        messagingRepository,
        now: () => 0,
        optionsRepository
      } as never
    );

    controller.initialize();
    await Promise.resolve();
    document
      .getElementById('configureApiBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(messagingRepository.send).not.toHaveBeenCalled();
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
