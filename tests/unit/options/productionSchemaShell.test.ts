/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n/locales';
import type { Messages } from '@i18n/messages';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';

const templatesCollectDraftRef = vi.hoisted(() => ({
  current: null as Partial<CompleteOptions> | null
}));

function createWidgetClass(name: string) {
  return class MockWidget {
    mount(container: HTMLElement): void {
      container.dataset.widget = name;
    }

    update(): void {}

    destroy(): void {}
  };
}

vi.mock('@options/widgets/UsageWidget', () => ({ UsageWidget: createWidgetClass('usage') }));
vi.mock('@options/widgets/PrivacyWidget', () => ({ PrivacyWidget: createWidgetClass('privacy') }));
vi.mock('@options/widgets/RestStorageWidget', () => ({
  RestStorageWidget: createWidgetClass('restStorage')
}));
vi.mock('@options/widgets/VaultRouterWidget', () => ({
  VaultRouterWidget: createWidgetClass('vaultRouter')
}));
vi.mock('@options/widgets/YamlConfigWidget', () => ({
  YamlConfigWidget: createWidgetClass('yamlConfig')
}));
vi.mock('@options/widgets/TemplatesWidget', () => ({
  TemplatesWidget: class MockTemplatesWidget {
    private runtime:
      | {
          notifyDirty?: (keys?: string[]) => void;
        }
      | undefined;

    mount(
      container: HTMLElement,
      _props: unknown,
      runtime?: { notifyDirty?: (keys?: string[]) => void }
    ): void {
      this.runtime = runtime;
      container.dataset.widget = 'templates';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.textContent = 'Trigger Template Dirty';
      trigger.addEventListener('click', () => {
        this.runtime?.notifyDirty?.(['templates']);
      });
      container.append(trigger);
    }

    update(): void {}

    destroy(): void {}

    collect(): Partial<CompleteOptions> {
      return (
        templatesCollectDraftRef.current ?? {
          templates: {
            article: 'Collected/Article.md'
          } as CompleteOptions['templates']
        }
      );
    }
  }
}));
vi.mock('@options/widgets/DomainMappingsWidget', () => ({
  DomainMappingsWidget: createWidgetClass('domainMappings')
}));
vi.mock('@options/widgets/VideoSettingsWidget', () => ({
  VideoSettingsWidget: createWidgetClass('videoSettings')
}));
vi.mock('@options/widgets/ReadingSettingsWidget', () => ({
  ReadingSettingsWidget: createWidgetClass('readingSettings')
}));
vi.mock('@options/widgets/FragmentSettingsWidget', () => ({
  FragmentSettingsWidget: createWidgetClass('fragmentSettings')
}));

import { mountProductionSchemaShell } from '@options/app/productionSchemaShell';

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text)
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function buildOptions(): CompleteOptions {
  return {
    ...DEFAULT_OPTIONS,
    rest: { ...DEFAULT_OPTIONS.rest },
    templates: { ...DEFAULT_OPTIONS.templates },
    domainMappings: { ...DEFAULT_OPTIONS.domainMappings },
    aiChat: { ...DEFAULT_OPTIONS.aiChat! },
    deepResearch: { ...DEFAULT_OPTIONS.deepResearch! },
    fragmentClipper: { ...DEFAULT_OPTIONS.fragmentClipper! },
    readingSession: { ...DEFAULT_OPTIONS.readingSession! },
    video: { ...DEFAULT_OPTIONS.video! },
    classifier: { ...DEFAULT_OPTIONS.classifier! },
    experimentalAi: { ...DEFAULT_OPTIONS.experimentalAi! },
    pageSummary: { ...DEFAULT_OPTIONS.pageSummary! },
    readingOverlaySummary: { ...DEFAULT_OPTIONS.readingOverlaySummary! },
    subtitleTranslation: { ...DEFAULT_OPTIONS.subtitleTranslation! }
  } as CompleteOptions;
}

function buildMessagesOverride(overrides: Partial<Messages>): Messages {
  return {
    ...DEFAULT_RUNTIME_MESSAGES,
    ...overrides
  };
}

async function settleLazyWidgets(): Promise<void> {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

function buildTestWidgetFactories() {
  const TemplatesTestWidget = class {
    private runtime:
      | {
          notifyDirty?: (keys?: string[]) => void;
        }
      | undefined;

    mount(
      container: HTMLElement,
      _props: unknown,
      runtime?: { notifyDirty?: (keys?: string[]) => void }
    ): void {
      this.runtime = runtime;
      container.dataset.widget = 'templates';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.textContent = 'Trigger Template Dirty';
      trigger.addEventListener('click', () => {
        this.runtime?.notifyDirty?.(['templates']);
      });
      container.append(trigger);
    }

    update(): void {}

    destroy(): void {}

    collect(): Partial<CompleteOptions> {
      return (
        templatesCollectDraftRef.current ?? {
          templates: {
            article: 'Collected/Article.md'
          } as CompleteOptions['templates']
        }
      );
    }
  };

  return {
    usage: () => new (createWidgetClass('usage'))() as never,
    privacy: () => new (createWidgetClass('privacy'))() as never,
    restStorage: () => new (createWidgetClass('restStorage'))() as never,
    vaultRouter: () => new (createWidgetClass('vaultRouter'))() as never,
    yamlConfig: () => new (createWidgetClass('yamlConfig'))() as never,
    templates: () => new TemplatesTestWidget() as never,
    domainMappings: () => new (createWidgetClass('domainMappings'))() as never,
    videoSettings: () => new (createWidgetClass('videoSettings'))() as never,
    readingSettings: () => new (createWidgetClass('readingSettings'))() as never,
    fragmentSettings: () => new (createWidgetClass('fragmentSettings'))() as never
  };
}

describe('mountProductionSchemaShell', () => {
  const controllerReadFormMock = vi.fn<[], CompleteOptions>(() => buildOptions());
  const controllerSaveSnapshotMock = vi.fn(() => Promise.resolve(undefined));
  const controllerSetSnapshotMock = vi.fn();
  const watchKeyMock = vi.fn(() => vi.fn());
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    controllerReadFormMock.mockReturnValue(buildOptions());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads formal widgets through lazy factories instead of static widget imports', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/options/app/productionSchemaShell.ts'),
      'utf8'
    );

    expect(source).not.toContain("from '@options/widgets/UsageWidget'");
    expect(source).not.toContain("from '@options/widgets/PrivacyWidget'");
    expect(source).not.toContain("from '@options/widgets/RestStorageWidget'");
    expect(source).not.toContain("from '@options/widgets/VaultRouterWidget'");
    expect(source).not.toContain("from '@options/widgets/YamlConfigWidget'");
    expect(source).not.toContain("from '@options/widgets/TemplatesWidget'");
    expect(source).not.toContain("from '@options/widgets/DomainMappingsWidget'");
    expect(source).not.toContain("from '@options/widgets/VideoSettingsWidget'");
    expect(source).not.toContain("from '@options/widgets/ReadingSettingsWidget'");
    expect(source).not.toContain("from '@options/widgets/FragmentSettingsWidget'");
  });

  it('opens and closes modal resources and routes onboarding to a standalone page', async () => {
    const container = document.getElementById('root') as HTMLElement;
    const mounted = mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, 'Support').click();
    expect(container.querySelector('.schema-modal-overlay')).toBeTruthy();

    (container.querySelector('.schema-modal-close') as HTMLButtonElement).click();
    expect(container.querySelector('.schema-modal-overlay')).toBeNull();

    getButtonByText(container, 'Onboarding').click();
    expect(openSpy).toHaveBeenCalledWith(
      '../onboarding/index.html',
      '_blank',
      'noopener,noreferrer'
    );

    mounted.cleanup();
    await settleLazyWidgets();
  });

  it('renders the theme segmented control inside Overview -> Interface', async () => {
    const container = document.getElementById('root') as HTMLElement;
    const mounted = mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    const interfaceGrid = container.querySelector('.interface-theme-grid');
    const themeRow = container.querySelector('.schema-settings-theme-segmented');
    const themeButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.schema-settings-theme-option')
    );

    expect(interfaceGrid).toBeTruthy();
    expect(themeRow?.textContent).toContain('Interface Theme');
    expect(themeButtons.map((button) => button.textContent?.trim() ?? '')).toEqual([
      'Dark',
      'Light'
    ]);

    mounted.cleanup();
    await settleLazyWidgets();
  });

  it('keeps settings panels in a stacked host while leaving resources in the sidebar rail', async () => {
    const container = document.getElementById('root') as HTMLElement;
    const mounted = mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    const panelSections = Array.from(
      container.querySelectorAll<HTMLElement>('.schema-panel-section')
    ).map((section) => section.dataset.panelId);
    const sidebarFooter = container.querySelector('.schema-shell-sidebar-footer');
    const mainText = container.querySelector('.schema-shell-main')?.textContent ?? '';

    expect(panelSections).toEqual([
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'experimental',
      'maintenance'
    ]);
    expect(sidebarFooter?.textContent).toContain('Onboarding');
    expect(sidebarFooter?.textContent).toContain('Changelog');
    expect(mainText).not.toContain('Onboarding');
    expect(mainText).toContain('Output & Metadata');
    expect(mainText).toContain('Maintenance');

    mounted.cleanup();
    await settleLazyWidgets();
  });

  it('maps experimental inputs to controller snapshots and debounced autosave', async () => {
    const container = document.getElementById('root') as HTMLElement;
    mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, 'Experimental').click();

    const experimentalSection = container.querySelector<HTMLElement>(
      '[data-panel-id="experimental"]'
    );
    expect(experimentalSection).toBeTruthy();

    const [providerInput] = Array.from(
      experimentalSection!.querySelectorAll<HTMLInputElement>('input.schema-input')
    );
    providerInput.value = 'openai';
    providerInput.dispatchEvent(new Event('input', { bubbles: true }));

    const [pageSummaryToggle] = Array.from(
      experimentalSection!.querySelectorAll<HTMLInputElement>('input.schema-switch-input')
    );
    pageSummaryToggle.checked = true;
    pageSummaryToggle.dispatchEvent(new Event('change', { bubbles: true }));

    const subtitleSelect = experimentalSection!.querySelector(
      'select.schema-select'
    ) as HTMLSelectElement;
    subtitleSelect.value = 'ja';
    subtitleSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const latestSnapshot = controllerSetSnapshotMock.mock.calls.at(-1)?.[0] as StoredOptions;
    expect(latestSnapshot.experimentalAi?.provider).toBe('openai');
    expect(latestSnapshot.pageSummary?.enabled).toBe(true);
    expect(latestSnapshot.subtitleTranslation?.targetLanguage).toBe('ja');

    vi.runAllTimers();
    await Promise.resolve();

    expect(controllerSaveSnapshotMock).toHaveBeenCalledWith({
      reason: 'auto',
      draft: expect.objectContaining({
        experimentalAi: expect.objectContaining({ provider: 'openai' }),
        pageSummary: { enabled: true },
        subtitleTranslation: expect.objectContaining({ targetLanguage: 'ja' })
      })
    });
  });

  it('maps schema-native capture source fields through autosave', async () => {
    const container = document.getElementById('root') as HTMLElement;
    mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, 'Capture Sources').click();

    const userNameInput = Array.from(
      container.querySelectorAll<HTMLInputElement>('input.schema-input')
    ).find((input) => input.placeholder === 'USER');
    expect(userNameInput).toBeTruthy();
    userNameInput!.value = 'Researcher';
    userNameInput!.dispatchEvent(new Event('input', { bubbles: true }));

    const pureModeSwitch = Array.from(
      container.querySelectorAll<HTMLInputElement>('input.schema-switch-input')
    ).find((input) => !input.disabled);
    expect(pureModeSwitch).toBeTruthy();
    pureModeSwitch!.checked = true;
    pureModeSwitch!.dispatchEvent(new Event('change', { bubbles: true }));

    const latestSnapshot = controllerSetSnapshotMock.mock.calls.at(-1)?.[0] as StoredOptions;
    expect(latestSnapshot.aiChat?.userName).toBe('Researcher');
    expect(latestSnapshot.aiChat?.includeTimestamps).toBe(false);
    expect(latestSnapshot.deepResearch?.pureMode).toBe(true);

    vi.runAllTimers();
    await Promise.resolve();

    expect(controllerSaveSnapshotMock).toHaveBeenCalledWith({
      reason: 'auto',
      draft: expect.objectContaining({
        aiChat: expect.objectContaining({
          userName: 'Researcher',
          includeTimestamps: false
        }),
        deepResearch: { pureMode: true }
      })
    });
  });

  it('collects mounted widget drafts before snapshot save', async () => {
    templatesCollectDraftRef.current = {
      templates: {
        ...buildOptions().templates,
        article: 'Collected/Article.md'
      }
    };

    const container = document.getElementById('root') as HTMLElement;
    mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, 'Output & Metadata').click();
    getButtonByText(container, 'Trigger Template Dirty').click();

    const latestSnapshot = controllerSetSnapshotMock.mock.calls.at(-1)?.[0] as StoredOptions;
    expect(latestSnapshot.templates?.article).toBe('Collected/Article.md');

    vi.runAllTimers();
    await Promise.resolve();

    expect(controllerSaveSnapshotMock).toHaveBeenCalledWith({
      reason: 'auto',
      draft: expect.objectContaining({
        templates: expect.objectContaining({
          article: 'Collected/Article.md'
        })
      })
    });
  });

  it('flushes widget drafts before opening a resource modal', async () => {
    templatesCollectDraftRef.current = {
      templates: {
        ...buildOptions().templates,
        article: 'Collected/BeforeResource.md'
      }
    };

    const container = document.getElementById('root') as HTMLElement;
    mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages: null,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, 'Output & Metadata').click();
    getButtonByText(container, 'Trigger Template Dirty').click();
    getButtonByText(container, 'Support').click();

    const latestSnapshot = controllerSetSnapshotMock.mock.calls.at(-1)?.[0] as StoredOptions;
    expect(latestSnapshot.templates?.article).toBe('Collected/BeforeResource.md');
    expect(container.querySelector('.schema-modal-overlay')).toBeTruthy();
  });

  it('renders resource content from schema messages instead of legacy modal hosts', async () => {
    document.body.innerHTML = `
      <div id="root"></div>
      <div id="supportModal">LEGACY SUPPORT BODY</div>
      <div id="contactModal">LEGACY CONTACT BODY</div>
      <div id="changelogModal">LEGACY CHANGELOG BODY</div>
    `;

    const messages = buildMessagesOverride({
      schemaResourceSupportTitle: '__support_title__',
      schemaResourceSupportDescription: '__support_description__',
      schemaResourceContactTitle: '__contact_title__',
      schemaResourceContactDescription: '__contact_description__',
      schemaResourceChangelogTitle: '__changelog_title__'
    });

    const container = document.getElementById('root') as HTMLElement;
    mountProductionSchemaShell({
      container,
      controller: {
        readForm: controllerReadFormMock,
        saveSnapshot: controllerSaveSnapshotMock,
        setSnapshot: controllerSetSnapshotMock
      } as never,
      storage: {
        sync: {
          watchKey: watchKeyMock
        }
      } as never,
      optionsRepository: {} as never,
      messagingRepository: {} as never,
      yamlRepository: {} as never,
      messages,
      language: 'en',
      onChangeLanguage: vi.fn(() => Promise.resolve('en')),
      onCopyConfig: vi.fn(() => Promise.resolve(undefined)),
      onImportConfig: vi.fn(() => Promise.resolve(undefined)),
      onSave: vi.fn(() => Promise.resolve(undefined)),
      onRunDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      onFixConfiguration: vi.fn(() => Promise.resolve(undefined)),
      onReloadDiagnostics: vi.fn(() => Promise.resolve(undefined)),
      widgetFactories: buildTestWidgetFactories()
    });

    await settleLazyWidgets();

    getButtonByText(container, '__support_title__').click();
    expect(container.textContent).toContain('__support_description__');
    expect(container.textContent).not.toContain('LEGACY SUPPORT BODY');

    (container.querySelector('.schema-modal-close') as HTMLButtonElement).click();
    getButtonByText(container, '__contact_title__').click();
    expect(container.innerHTML).toContain('__contact_description__');
    expect(container.textContent).not.toContain('LEGACY CONTACT BODY');

    (container.querySelector('.schema-modal-close') as HTMLButtonElement).click();
    getButtonByText(container, '__changelog_title__').click();
    expect(container.textContent).toContain('__changelog_title__');
    expect(container.textContent).not.toContain('LEGACY CHANGELOG BODY');
  });
});
