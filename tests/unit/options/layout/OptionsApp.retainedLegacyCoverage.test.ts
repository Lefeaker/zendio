/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { createOptionsStateManager } from '@options/state/StateManager';

type SidebarRenderConfig = {
  brand?: { title?: string; version?: string };
  footerLinks?: Array<{ label?: string; href?: string; external?: boolean; id?: string }>;
  navigation?: { activeId?: string };
};

type ContentRenderConfig = {
  stateManager: ReturnType<typeof createOptionsStateManager>;
  initialSection?: string;
  formRegistry: FormSectionRegistry;
};

const sidebarRenderArgs = vi.hoisted(() => [] as SidebarRenderConfig[]);
const contentRenderArgs = vi.hoisted(() => [] as ContentRenderConfig[]);
const sidebarRenderMock = vi.hoisted(() =>
  vi.fn((config: SidebarRenderConfig) => {
    sidebarRenderArgs.push(config);
    const node = document.createElement('aside');
    node.className = 'sidebar-rendered';
    return node;
  })
);
const sidebarSetActiveMock = vi.hoisted(() => vi.fn());
const sidebarDestroyMock = vi.hoisted(() => vi.fn());
const contentRenderMock = vi.hoisted(() =>
  vi.fn((config: ContentRenderConfig) => {
    contentRenderArgs.push(config);
    const node = document.createElement('main');
    node.className = 'content-rendered';
    return node;
  })
);
const contentNavigateToMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const contentMountSectionMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 'section-instance' }))
);
const contentPreloadSectionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const contentGetSectionInstanceMock = vi.hoisted(() => vi.fn(() => ({ mounted: true })));
const contentForEachSectionMock = vi.hoisted(() =>
  vi.fn((callback: (id: string, section: unknown) => void) => {
    callback('usage', { mounted: true });
  })
);
const contentDestroyMock = vi.hoisted(() => vi.fn());
const navControllerDisposeMock = vi.hoisted(() => vi.fn());
const modalDisposeMock = vi.hoisted(() => vi.fn());
const modalCtorMock = vi.hoisted(() => vi.fn());

vi.mock('@options/components/layout/Sidebar', () => ({
  Sidebar: class SidebarMock {
    setMessages = vi.fn();
    render = sidebarRenderMock;
    setActiveNavigation = sidebarSetActiveMock;
    destroy = sidebarDestroyMock;
  }
}));

vi.mock('@options/components/layout/MainContent', () => ({
  MainContent: class MainContentMock {
    setMessages = vi.fn();
    render = contentRenderMock;
    navigateTo = contentNavigateToMock;
    mountSection = contentMountSectionMock;
    preloadSections = contentPreloadSectionsMock;
    getSectionInstance = contentGetSectionInstanceMock;
    forEachSection = contentForEachSectionMock;
    destroy = contentDestroyMock;
  }
}));

vi.mock('@options/components/layout/NavigationController', () => ({
  NavigationController: class NavigationControllerMock {
    constructor() {}
    dispose = navControllerDisposeMock;
  }
}));

vi.mock('@options/components/infrastructure/ModalController', () => ({
  ModalController: class ModalControllerMock {
    constructor(config: unknown) {
      modalCtorMock(config);
    }
    dispose = modalDisposeMock;
  }
}));

import { OptionsApp } from '@options/components/layout/OptionsApp';

describe('OptionsApp', () => {
  let container: HTMLElement;
  let app: OptionsApp;
  const stateManager = createOptionsStateManager();
  const formRegistry = new FormSectionRegistry();

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    app = new OptionsApp(container);
    sidebarRenderArgs.length = 0;
    contentRenderArgs.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    app.destroy();
  });

  it('renders sidebar and content with default brand and footer links from messages', () => {
    app.setMessages({
      extensionName: 'All in Obsidian',
      extensionSubtitle: 'Capture smarter',
      versionNumber: 'v9.9.9',
      onboardingLinkText: 'Open onboarding',
      footerSupportLink: 'Support us',
      footerSuggestionsLink: 'Suggestions',
      footerContactLink: 'Contact'
    } as never);

    const shell = app.render({ stateManager, formRegistry, initialSection: 'rest' });
    const sidebarConfig = sidebarRenderArgs[0];
    const contentConfig = contentRenderArgs[0];

    expect(shell.classList.contains('aobx-shell')).toBe(true);
    expect(sidebarConfig?.brand?.title).toBe('All in Obsidian');
    expect(sidebarConfig?.brand?.version).toBe('v9.9.9');
    expect(sidebarConfig?.footerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Open onboarding',
          href: '../onboarding/index.html',
          external: true
        }),
        expect.objectContaining({ label: 'Support us', id: 'supportLink' })
      ])
    );
    expect(sidebarConfig?.navigation?.activeId).toBe('rest');
    expect(contentConfig).toEqual(
      expect.objectContaining({
        stateManager,
        initialSection: 'rest',
        formRegistry
      })
    );
    expect(container.querySelector('.aobx-shell__sidebar')).not.toBeNull();
    expect(container.querySelector('.aobx-shell__content')).not.toBeNull();
  });

  it('navigateTo updates content first and then marks the sidebar item active', async () => {
    app.render({ stateManager, formRegistry });

    await app.navigateTo('diagnosis');

    expect(contentNavigateToMock).toHaveBeenCalledWith('diagnosis');
    expect(sidebarSetActiveMock).toHaveBeenCalledWith('diagnosis');
  });

  it('configureUI replaces the prior modal controller instance', () => {
    app.render({
      stateManager,
      formRegistry,
      modalBindings: [{ triggerId: 'supportLink', modalId: 'supportModal' }]
    });
    expect(modalCtorMock).toHaveBeenCalledTimes(1);

    app.configureUI({ modalBindings: [{ triggerId: 'contactLink', modalId: 'contactModal' }] });

    expect(modalDisposeMock).toHaveBeenCalledTimes(1);
    expect(modalCtorMock).toHaveBeenCalledTimes(2);
  });

  it('destroy disposes navigation, modal, sidebar, and content controllers', () => {
    app.render({
      stateManager,
      formRegistry,
      modalBindings: [{ triggerId: 'supportLink', modalId: 'supportModal' }]
    });

    app.destroy();

    expect(navControllerDisposeMock).toHaveBeenCalledTimes(1);
    expect(modalDisposeMock).toHaveBeenCalledTimes(1);
    expect(sidebarDestroyMock).toHaveBeenCalledTimes(1);
    expect(contentDestroyMock).toHaveBeenCalledTimes(1);
  });
});
