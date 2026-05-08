/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import type { OptionsController } from '@options/app/optionsController';
import type { CompleteOptions } from '@shared/types/options';
import type { StorageService } from '@platform/interfaces/storage';

const analyticsMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(() => Promise.resolve()),
  getConfig: vi.fn(() => ({ debugMode: false })),
  getUserConsent: vi.fn(() => Promise.resolve({ analytics: false, errorReporting: false })),
  refreshFromStorage: vi.fn(() => Promise.resolve()),
  setAnalyticsConsent: vi.fn(() => Promise.resolve()),
  updateConfig: vi.fn(() => Promise.resolve())
}));

vi.mock('@shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: () => ({
    clearAllData: analyticsMocks.clearAllData,
    getConfig: analyticsMocks.getConfig,
    getUserConsent: analyticsMocks.getUserConsent,
    refreshFromStorage: analyticsMocks.refreshFromStorage,
    updateConfig: analyticsMocks.updateConfig
  }),
  setAnalyticsConsent: analyticsMocks.setAnalyticsConsent
}));

function createController() {
  return {
    scheduleAutoSave: vi.fn(),
    dispose: vi.fn(),
    loadInitialState: vi.fn(),
    loadRaw: vi.fn(),
    applyToForm: vi.fn(),
    saveSnapshot: vi.fn(),
    saveRaw: vi.fn(),
    applyImportedConfig: vi.fn(),
    readForm: vi.fn(),
    cancelAutoSave: vi.fn(),
    getSnapshot: vi.fn(),
    setSnapshot: vi.fn()
  };
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

function findInputByValue(value: string): HTMLInputElement {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (candidate) => candidate.value === value
  );
  if (!input) {
    throw new Error(`Missing input with value: ${value}`);
  }
  return input;
}

function findYamlRowByField(value: string): HTMLElement | null {
  const fieldInput = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
    (candidate) => candidate.value === value
  );
  return fieldInput?.closest<HTMLElement>('[data-row-id]') ?? null;
}

function input(value: string, nextValue: string, eventName = 'input'): HTMLInputElement {
  const target = findInputByValue(value);
  target.value = nextValue;
  target.dispatchEvent(new Event(eventName, { bubbles: true }));
  return target;
}

function createStorage() {
  const localStore = new Map<string, unknown>();
  const syncStore = new Map<string, unknown>();
  const createArea = (store: Map<string, unknown>) => ({
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getMany: vi.fn((keys: string[]) =>
      Promise.resolve(
        keys.reduce<Record<string, unknown>>((result, key) => {
          result[key] = store.get(key);
          return result;
        }, {})
      )
    ),
    setMany: vi.fn((entries: Record<string, unknown>) => {
      Object.entries(entries).forEach(([key, value]) => store.set(key, value));
      return Promise.resolve();
    }),
    remove: vi.fn((key: string | string[]) => {
      (Array.isArray(key) ? key : [key]).forEach((entry) => store.delete(entry));
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      store.clear();
      return Promise.resolve();
    }),
    watchKey: vi.fn(() => () => {}),
    watchAll: vi.fn(() => () => {})
  });
  return {
    local: createArea(localStore),
    sync: createArea(syncStore)
  };
}

function createRepository() {
  return {
    get: vi.fn(() => Promise.resolve(mergeOptions(null) as CompleteOptions)),
    set: vi.fn(() => Promise.resolve()),
    onChange: vi.fn(() => () => {})
  };
}

function createMessaging(result: unknown = undefined) {
  return {
    send: vi.fn(() => Promise.resolve(result)),
    onMessage: vi.fn(() => () => {})
  };
}

function findCheckboxInText(text: string): HTMLInputElement {
  const container = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.row, .consent-inline-item, .summary-toggle-item, .subtitle-inline-item'
    )
  ).find((candidate) => candidate.textContent?.includes(text));
  const checkbox = container?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) {
    throw new Error(`Missing checkbox for: ${text}`);
  }
  return checkbox;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('mountProductionStitchShell', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    Object.values(analyticsMocks).forEach((mock) => mock.mockClear());
    analyticsMocks.getConfig.mockReturnValue({ debugMode: false });
    analyticsMocks.getUserConsent.mockResolvedValue({ analytics: false, errorReporting: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('mounts the shared Stitch shell and exposes the required lifecycle API', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { rest: { vault: 'Research Vault' } },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    expect(document.querySelector('.sidebar')).toBeTruthy();
    expect(document.querySelector('.brand-copy strong')?.textContent).toBe('All in Ob');
    expect(document.querySelector('.brand-copy span')?.textContent).toMatch(/^v\d+\.\d+\.\d+/);
    const brandLogo = document.querySelector<HTMLImageElement>('.brand-mark img');
    expect(brandLogo?.getAttribute('src')).toBe('../icons/bannerlogo-128.png');
    expect(document.querySelector('[data-nav-panel="overview"]')).toBeTruthy();
    expect(document.querySelector('[data-panel-id="storage"]')).toBeTruthy();
    expect(document.querySelector('.nav-group > .nav-title')).toBeNull();
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Runtime UI');
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Resources');
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Settings');
    expect(document.querySelector('[data-footer-panel="clipper"]')).toBeNull();
    expect(typeof mounted.cleanup).toBe('function');
    expect(typeof mounted.collectDraft).toBe('function');
    expect(typeof mounted.refreshOptions).toBe('function');
    expect(typeof mounted.setMessages).toBe('function');
  });

  it('collectDraft returns complete options and preserves refreshed fields', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { rest: { vault: 'Research Vault' } },
      messages: null,
      language: 'en'
    });

    expect(mounted.collectDraft()).toEqual(
      expect.objectContaining({
        ...mergeOptions({ rest: { vault: 'Research Vault' } }),
        rest: expect.objectContaining({ vault: 'Research Vault' })
      })
    );

    mounted.refreshOptions({ aiChat: { userName: 'Alice' } });
    expect(mounted.collectDraft().aiChat.userName).toBe('Alice');
  });

  it('setMessages keeps the rendered version subtitle and cleanup clears the root', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: null,
      messages: null,
      language: 'zh-CN'
    });

    mounted.setMessages({ extensionSubtitle: 'Production Shell' } as never, 'en');

    expect(document.querySelector('.brand-copy span')?.textContent).toMatch(/^v\d+\.\d+\.\d+/);

    mounted.cleanup();
    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');
  });

  it('renders the default vault switch as enabled and immutable', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: { vault: 'Research Vault' },
        vaultRouter: {
          defaultVaultId: 'research',
          vaults: [
            {
              id: 'research',
              name: 'Research Vault',
              vault: 'Research Vault',
              httpsUrl: 'https://localhost:27124',
              httpUrl: 'http://localhost:27123',
              apiKey: 'token',
              enabled: false,
              isDefault: true
            }
          ],
          rules: []
        }
      },
      messages: null,
      language: 'en'
    } as never);

    const defaultRow = findInputByValue('Research Vault').closest<HTMLElement>('tr');
    const toggle = defaultRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    expect(toggle?.disabled).toBe(true);
  });

  it('renders Usage Dashboard from real usage stats instead of preview fixtures', async () => {
    const controller = createController();
    const storage = createStorage();
    await storage.local.set('usageStats', {
      aiChatSaves: 7,
      fragmentSaves: 5,
      articleSaves: 3,
      lastUpdatedISO: '2026-04-25T00:00:00.000Z',
      history: [
        { date: '2026-04-24', aiChat: 1, fragment: 2, article: 3 },
        { date: '2026-04-25', aiChat: 7, fragment: 5, article: 3 }
      ]
    });

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: null,
      messages: null,
      language: 'en',
      storage: storage as unknown as StorageService
    } as never);
    await flushPromises();

    const statText = document.querySelector('.stats-grid')?.textContent ?? '';
    expect(statText).toContain('15');
    expect(statText).toContain('7');
    expect(statText).toContain('5');
    expect(statText).toContain('3');
    expect(statText).not.toContain('1284');

    const chartLabels = document.querySelectorAll('#usageXAxis text');
    expect(chartLabels.length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector('#usageWavePath')?.getAttribute('d')).toBeTruthy();
  });

  it('persists theme changes through the Stitch segmented control', () => {
    const controller = createController();
    const repository = createRepository();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: null,
      messages: null,
      language: 'en',
      optionsRepository: repository
    });

    const main = document.querySelector<HTMLElement>('.main');
    const lightButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'Light');
    lightButton?.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(document.body.dataset.previewTheme).toBe('light');
    expect(window.localStorage.getItem('aob-theme')).toBe('light');
    expect(repository.set).toHaveBeenLastCalledWith({ interfaceTheme: 'light' });

    const darkButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'Dark');
    darkButton?.click();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.previewTheme).toBe('dark');
    expect(document.body.dataset.previewTheme).toBe('dark');
    expect(window.localStorage.getItem('aob-theme')).toBe('dark');
    expect(repository.set).toHaveBeenLastCalledWith({ interfaceTheme: 'dark' });
  });

  it('adds a system theme preference and resolves it immediately from media changes', () => {
    const controller = createController();
    const repository = createRepository();
    const mediaListeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        mediaListeners.add(callback);
      }),
      removeEventListener: vi.fn()
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as never);

    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { interfaceTheme: 'system' },
      messages: null,
      language: 'en',
      optionsRepository: repository
    });

    const systemButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'System');
    expect(systemButton).toBeTruthy();
    expect(document.documentElement.dataset.previewTheme).toBe('dark');
    expect(mounted.collectDraft().interfaceTheme).toBe('system');

    media.matches = false;
    mediaListeners.forEach((callback) => callback());

    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(mounted.collectDraft().interfaceTheme).toBe('system');
    expect(window.localStorage.getItem('aob-theme')).toBe('system');
  });

  it('binds production option values and schedules autosave after edits', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        aiChat: { userName: 'Bob' },
        video: { promptButtonLabel: 'Clip this video', promptShortcut: 'Alt+Shift+V' }
      },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    const userNameInput = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
      (input) => input.value === 'Bob'
    );
    expect(userNameInput).toBeTruthy();

    userNameInput!.value = 'Alice';
    userNameInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(vi.mocked(controller.scheduleAutoSave)).toHaveBeenCalledTimes(1);
    expect(mounted.collectDraft().aiChat.userName).toBe('Alice');
  });

  it('updates the reading highlight theme without remounting the options page', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { readingSession: { highlightTheme: 'gradient' } },
      messages: null,
      language: 'en'
    });

    const main = document.querySelector<HTMLElement>('.main');
    const purpleButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'Purple');
    expect(main).toBeTruthy();
    expect(purpleButton).toBeTruthy();

    purpleButton!.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(mounted.collectDraft().readingSession.highlightTheme).toBe('purple');
    expect(purpleButton?.getAttribute('aria-pressed')).toBe('true');
    expect(
      document.querySelector('.inline-highlight')?.classList.contains('highlight-purple')
    ).toBe(true);
  });

  it('writes routing table edits back into vaultRouter before autosave collection', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: { vault: 'Research Vault' },
        vaultRouter: {
          defaultVaultId: 'research',
          vaults: [
            {
              id: 'research',
              name: 'Research Vault',
              vault: 'Research Vault',
              httpsUrl: 'https://localhost:27124',
              httpUrl: 'http://localhost:27123',
              apiKey: 'token',
              enabled: true,
              isDefault: true
            }
          ],
          rules: [
            {
              id: 'rule-1',
              vaultId: 'research',
              type: 'domain',
              pattern: 'old.example',
              enabled: true,
              priority: 10
            }
          ]
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    input('old.example', 'new.example', 'change');

    const collected = mounted.collectDraft();
    expect(collected.vaultRouter?.rules?.[0]).toEqual(
      expect.objectContaining({
        vaultId: 'research',
        type: 'domain',
        pattern: 'new.example',
        enabled: true,
        priority: 10
      })
    );
    expect(vi.mocked(controller.scheduleAutoSave)).toHaveBeenCalled();
  });

  it('persists storage root and vault table edits through collectDraft', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          httpsUrl: 'https://localhost:27124',
          httpUrl: 'http://localhost:27123',
          apiKey: 'token',
          rootDir: 'Inbox/'
        }
      },
      messages: null,
      language: 'en'
    });

    input('Inbox/', 'Clips/Articles/');
    input('Research Vault', 'Notes Vault');

    const collected = mounted.collectDraft();
    expect(collected.rest.rootDir).toBe('Clips/Articles/');
    expect(collected.rest.vault).toBe('Notes Vault');
    expect(collected.vaultRouter?.vaults?.[0]).toEqual(
      expect.objectContaining({
        name: 'Notes Vault',
        vault: 'Notes Vault'
      })
    );
  });

  it('persists domain mapping edits and delete actions', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        domainMappings: {
          'old.example': 'old-folder'
        }
      },
      messages: null,
      language: 'en'
    });

    input('old.example', 'new.example');
    input('old-folder', 'new-folder');

    expect(mounted.collectDraft().domainMappings).toEqual({
      'new.example': 'new-folder'
    });

    findButton('删除').click();
    expect(mounted.collectDraft().domainMappings).toEqual({});
  });

  it('does not render the future experimental panel in the release options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        pageSummary: { enabled: true },
        readingOverlaySummary: { enabled: true },
        subtitleTranslation: { enabled: true, targetLanguage: 'en' }
      },
      messages: null,
      language: 'en'
    });

    expect(document.querySelector('[data-nav-panel="experimental"]')).toBeFalsy();
    expect(document.body.textContent).not.toContain('敬请期待');
    expect(document.body.textContent).not.toContain('Coming soon');
    expect(document.body.textContent).not.toContain('启用视频字幕翻译');
    expect(document.body.textContent).not.toContain('实验功能预留项');

    const collected = mounted.collectDraft();
    expect(collected.pageSummary.enabled).toBe(false);
    expect(collected.readingOverlaySummary.enabled).toBe(false);
    expect(collected.subtitleTranslation).toEqual({ enabled: false, targetLanguage: 'en' });
    expect(vi.mocked(controller.scheduleAutoSave)).not.toHaveBeenCalled();
  });

  it('uses schema controls as the single source for storage/domain and keeps only the structured YAML widget mounted', async () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: { vault: 'Widget Vault', rootDir: 'WidgetRoot/' },
        domainMappings: { 'widget.example': 'widget-folder' }
      },
      messages: null,
      language: 'en'
    });

    expect(document.querySelector('.rest-storage-widget')).toBeFalsy();
    expect(document.querySelector('.domain-mappings-widget')).toBeFalsy();
    await flushPromises();
    expect(document.querySelector('.stitch-yaml-config-table')).toBeTruthy();
    expect(document.querySelector('[data-role="yaml-config-view"]')).toBeFalsy();
  });

  it('flushes dirty widget edits before actions that rerender the shell', async () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        yamlConfig: {
          contentTypes: {
            article: {
              fields: [{ name: 'author', type: 'text', enabled: false }]
            }
          }
        }
      },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    await flushPromises();

    const authorRow = findYamlRowByField('author');
    const authorArticleToggle =
      authorRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(authorArticleToggle).toBeTruthy();
    authorArticleToggle!.checked = true;
    authorArticleToggle!.dispatchEvent(new Event('change', { bubbles: true }));

    findButton('测试连接').click();
    await flushPromises();

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual(
      expect.objectContaining({ name: 'author', enabled: true })
    );
  });

  it('does not render fake interactive YAML summary buttons outside the structured YAML widget', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        yamlConfig: {
          globalFields: [{ name: 'kept', type: 'text', enabled: true }]
        }
      },
      messages: null,
      language: 'en'
    });

    const summaryButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).filter((button) => ['On', 'Off'].includes(button.textContent?.trim() ?? ''));
    expect(summaryButtons).toEqual([]);

    const widgetActions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.stitch-yaml-config-widget button')
    ).map((button) => button.textContent?.trim());
    expect(widgetActions).toContain('+ Add field');
    expect(widgetActions).toContain('+ Add domain rule');
  });

  it('hides unreleased AI timestamp, Deep Research, and advanced video controls', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        aiChat: { includeTimestamps: true },
        deepResearch: { pureMode: true },
        video: {
          floatingPromptEnabled: true,
          promptButtonLabel: 'Legacy prompt',
          promptShortcut: 'Alt+V',
          promptPosition: { x: 99, y: 77 }
        }
      },
      messages: null,
      language: 'en'
    });

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('包含时间戳');
    expect(text).not.toContain('Gemini Deep Research');
    expect(text).not.toContain('Deep Research');
    expect(text).not.toContain('Advanced Video Schema');
    expect(text).not.toContain('提示文案与快捷键');
    expect(text).not.toContain('promptPosition');
    expect(text).toContain('在视频网站显示笔记按钮');

    const videoRow = Array.from(document.querySelectorAll<HTMLElement>('.row')).find((row) =>
      row.textContent?.includes('在视频网站显示笔记按钮')
    );
    const videoSwitch = videoRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(videoSwitch).toBeTruthy();
    videoSwitch!.checked = false;
    videoSwitch!.dispatchEvent(new Event('change', { bubbles: true }));

    const draft = mounted.collectDraft();
    expect(draft.video.floatingPromptEnabled).toBe(false);
    expect(draft.aiChat.includeTimestamps).toBe(true);
    expect(draft.deepResearch.pureMode).toBe(true);
    expect(draft.video.promptPosition).toEqual({ x: 99, y: 77 });
  });

  it('updates fragment modifier chips without remounting the options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        fragmentClipper: {
          selectionModifierEnabled: true,
          selectionModifierKeys: ['alt']
        }
      },
      messages: null,
      language: 'en'
    });

    const main = document.querySelector<HTMLElement>('.main');
    const altChip = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modifier-key-inline .chip')
    ).find((button) => button.textContent?.trim() === 'Alt');
    expect(main).toBeTruthy();
    expect(altChip).toBeTruthy();

    altChip!.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(altChip!.getAttribute('aria-pressed')).toBe('false');
    expect(mounted.collectDraft().fragmentClipper.selectionModifierEnabled).toBe(false);
    expect(mounted.collectDraft().fragmentClipper.selectionModifierKeys).toEqual([]);
  });

  it('keeps YAML widget interactions scoped away from the options shell render tree', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        yamlConfig: {
          contentTypes: {
            article: {
              customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
            }
          }
        }
      },
      messages: null,
      language: 'en'
    });

    const main = document.querySelector<HTMLElement>('.main');
    const widgetHost = document.querySelector<HTMLElement>('[data-stitch-widget="yaml-config"]');
    const articleFilter = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.stitch-yaml-filter-row button')
    ).find((button) => button.textContent?.trim() === 'Article');
    const addField = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.stitch-yaml-actions button')
    ).find((button) => button.textContent?.trim() === '+ Add field');
    expect(main).toBeTruthy();
    expect(widgetHost).toBeTruthy();
    expect(articleFilter).toBeTruthy();
    expect(addField).toBeTruthy();

    articleFilter!.click();
    addField!.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(document.querySelector('[data-stitch-widget="yaml-config"]')).toBe(widgetHost);
  });

  it('runs real maintenance actions for copy, diagnostics, and reload', async () => {
    const reloaded = mergeOptions({ aiChat: { userName: 'Reloaded' } }) as CompleteOptions;
    const loadRaw = vi.fn(() => Promise.resolve(reloaded));
    const controller = {
      ...createController(),
      loadRaw
    } as unknown as OptionsController;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: null,
      language: 'en'
    });

    findButton('复制配置').click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"aiChat"'));

    findButton('诊断配置').click();
    expect(document.body.textContent).toContain('domainMappings');

    findButton('重新加载').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadRaw).toHaveBeenCalledTimes(1);
    expect(findInputByValue('Reloaded')).toBeTruthy();
  });

  it('reports maintenance copy and import success or failure in the Stitch log', async () => {
    const controller = {
      ...createController(),
      applyImportedConfig: vi.fn(() => Promise.resolve())
    };
    const writeText = vi.fn(() => Promise.resolve());
    const readText = vi.fn(() =>
      Promise.resolve(
        JSON.stringify({ options: { aiChat: { userName: 'Imported' } }, analytics: null })
      )
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText }
    });

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        copyConfigSuccess: 'Copied config',
        importSuccess: 'Imported config'
      } as never,
      language: 'en'
    });

    const copyButton = findButton('复制配置');
    copyButton.click();
    expect(copyButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    expect(document.body.textContent).toContain('Copied config');
    expect(copyButton.hasAttribute('aria-busy')).toBe(false);

    const importButton = findButton('导入并保存');
    importButton.click();
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    expect(controller.applyImportedConfig).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Imported config');
    expect(importButton.hasAttribute('aria-busy')).toBe(false);

    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    copyButton.click();
    await flushPromises();
    expect(document.body.textContent).toContain('Copy failed: Error: clipboard denied');
  });

  it('reports import failure without opening a file picker when clipboard import is unavailable', async () => {
    const controller = {
      ...createController(),
      applyImportedConfig: vi.fn(() => Promise.resolve())
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        importSuccess: 'Imported config'
      } as never,
      language: 'en'
    });

    const importButton = findButton('导入并保存');
    importButton.click();
    expect(importButton.getAttribute('aria-busy')).toBe('true');
    await flushPromises();
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][data-stitch-file-import="config"]'
    );
    expect(fileInput).toBeFalsy();
    expect(controller.applyImportedConfig).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Import failed: ConfigTransferError: CLIPBOARD_READ_UNAVAILABLE'
    );
    expect(document.body.textContent).not.toContain('Imported config');
    expect(importButton.hasAttribute('aria-busy')).toBe(false);
  });

  it('uses the transfer clipboard fallback and does not report copy success when fallback fails', async () => {
    const controller = createController();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: {
        copyConfigSuccess: 'Copied config'
      } as never,
      language: 'en'
    });

    findButton('复制配置').click();
    await flushPromises();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.textContent).toContain('Copied config');

    execCommand.mockReturnValue(false);
    findButton('复制配置').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Copy failed');
    expect(document.body.textContent).not.toContain('Copied config');
  });

  it('does not let invalid YAML widget edits pollute production collectDraft', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        yamlConfig: {
          contentTypes: {
            article: {
              customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
            }
          }
        }
      },
      messages: null,
      language: 'en'
    });

    const row = findYamlRowByField('score');
    const defaultValue = row?.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    expect(defaultValue).toBeTruthy();
    defaultValue!.value = 'not-a-number';
    defaultValue!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({ name: 'score', defaultValue: 42 })
    ]);
    expect(document.body.textContent).toContain(
      'Please fix YAML configuration errors before saving.'
    );
  });

  it('runs the full production diagnostics report instead of a simplified JSON dump', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          httpsUrl: '',
          httpUrl: '',
          apiKey: ''
        },
        templates: {
          article: '',
          fragment: '',
          ai: ''
        },
        fragmentClipper: {
          contextLength: 10
        },
        video: {
          floatingPromptEnabled: false
        }
      },
      messages: null,
      language: 'en'
    });

    findButton('诊断配置').click();

    expect(document.body.textContent).toContain('未配置 API Key');
    expect(document.body.textContent).toContain('片段剪藏配置');
    expect(document.body.textContent).toContain('上下文长度较短');
    expect(document.body.textContent).toContain('视频模式');
    expect(document.body.textContent).toContain('端口检查');
  });

  it('persists privacy consent switches through the production options repository', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        privacyPreferences: {
          analytics: false,
          errorReporting: false,
          debugMode: false
        }
      },
      messages: null,
      language: 'en',
      optionsRepository
    } as never);

    const analytics = findCheckboxInText('匿名使用统计');
    expect(analytics.disabled).toBe(false);
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(optionsRepository.set).toHaveBeenCalledWith({
      privacyPreferences: {
        analytics: true,
        errorReporting: false,
        debugMode: false
      }
    });
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: true,
      errorReporting: false,
      debugMode: false
    });
  });

  it('syncs privacy switches with the analytics runtime consent and debug config', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        privacyPreferences: {
          analytics: false,
          errorReporting: false,
          debugMode: false
        }
      },
      messages: null,
      language: 'en',
      optionsRepository
    } as never);

    const analytics = findCheckboxInText('匿名使用统计');
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, false);

    const errorReporting = findCheckboxInText('错误报告');
    errorReporting.checked = true;
    errorReporting.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(analyticsMocks.setAnalyticsConsent).toHaveBeenLastCalledWith(true, true);

    const debugMode = findCheckboxInText('调试模式');
    expect(debugMode.disabled).toBe(false);
    debugMode.checked = true;
    debugMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(analyticsMocks.updateConfig).toHaveBeenCalledWith({ debugMode: true });
    expect(optionsRepository.set).toHaveBeenLastCalledWith({
      privacyPreferences: {
        analytics: true,
        errorReporting: true,
        debugMode: true
      }
    });
  });

  it('clears all analytics privacy data through the production analytics manager', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        },
        usageStats: {
          aiChatSaves: 3,
          fragmentSaves: 2,
          articleSaves: 1,
          lastUpdatedISO: '2026-04-25T00:00:00.000Z',
          history: [{ date: '2026-04-25', aiChat: 3, fragment: 2, article: 1 }]
        }
      },
      messages: null,
      language: 'en',
      optionsRepository
    } as never);

    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(analyticsMocks.clearAllData).toHaveBeenCalledTimes(1);
    expect(optionsRepository.set).toHaveBeenCalledWith({
      privacyPreferences: {
        analytics: false,
        errorReporting: false,
        debugMode: false
      }
    });
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });
  });

  it('uses localized privacy clear-all confirmation and visible status messages', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const confirmSpy = vi.mocked(window.confirm);
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        privacyPreferences: {
          analytics: true,
          errorReporting: true,
          debugMode: true
        }
      },
      messages: {
        confirmClearAllData: 'Localized clear all?',
        allDataCleared: 'Localized clear success',
        clearDataError: 'Localized clear error'
      } as never,
      language: 'en',
      optionsRepository
    } as never);

    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith('Localized clear all?');
    expect(document.body.textContent).toContain('Localized clear success');
    expect(mounted.collectDraft().privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });

    analyticsMocks.clearAllData.mockRejectedValueOnce(new Error('clear failed'));
    findButton('清空全部分析数据').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Localized clear error');
  });

  it('clears usage data through the existing reset action dependencies', async () => {
    const controller = createController();
    const optionsRepository = createRepository();
    const storage = createStorage();
    const messagingRepository = createMessaging();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        usageStats: {
          aiChatSaves: 3,
          fragmentSaves: 2,
          articleSaves: 1,
          lastUpdatedISO: '2026-04-25T00:00:00.000Z',
          history: [{ date: '2026-04-25', aiChat: 3, fragment: 2, article: 1 }]
        }
      },
      messages: null,
      language: 'en',
      optionsRepository,
      storage: storage as unknown as StorageService,
      messagingRepository,
      now: () => 1234
    } as never);

    findButton('清除使用数据').click();
    await flushPromises();

    const zeroStats = {
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    };
    expect(vi.mocked(optionsRepository.set)).toHaveBeenCalledWith({ usageStats: zeroStats });
    expect(vi.mocked(storage.local.set)).toHaveBeenCalledWith('usageStats', zeroStats);
    expect(vi.mocked(storage.local.set)).toHaveBeenCalledWith('usage_stats', zeroStats);
    expect(vi.mocked(messagingRepository.send)).toHaveBeenCalledWith({
      type: 'track',
      event: 'clear_stats',
      params: { timestamp: 1234 }
    });
  });

  it('opens privacy policy and data usage resources from the privacy card', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    const privacyPolicy = findButton('隐私政策');
    expect(privacyPolicy.disabled).toBe(false);
    privacyPolicy.click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Privacy Policy');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('页面正文与剪藏内容');

    document.querySelector<HTMLElement>('.resource-modal-overlay')?.click();

    const dataUsage = findButton('数据用途说明');
    expect(dataUsage.disabled).toBe(false);
    dataUsage.click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Data Usage');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('匿名功能使用次数');
  });

  it('handles resource navigation actions by closing the modal and activating the target panel', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    findButton('Plugin Setup').click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Plugin Setup Guide');

    findButton('跳到 Storage').click();

    expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    expect(
      document.querySelector('[data-nav-panel="storage"]')?.classList.contains('is-active')
    ).toBe(true);
  });

  it('applies output presets to templates, YAML configuration, and domain mappings', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        templates: {
          article: 'Old/{title}.md',
          fragment: 'Old/Fragment.md',
          reading: 'Old/Reading.md',
          ai: 'Old/AI.md'
        },
        domainMappings: {
          'old.example': 'old'
        },
        yamlConfig: null
      },
      messages: null,
      language: 'en'
    });

    findButton('Apply Research').click();

    const collected = mounted.collectDraft();
    expect(collected.templates.article).toBe('Research/{domain}/{yyyy}/{slug}.md');
    expect(collected.templates.reading).toBe('Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md');
    expect(collected.domainMappings).toEqual(
      expect.objectContaining({
        'arxiv.org': 'Arxiv',
        'mp.weixin.qq.com': '公众号'
      })
    );
    expect(collected.yamlConfig?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'status', enabled: true }),
        expect.objectContaining({ name: 'workspace', enabled: true })
      ])
    );
    expect(vi.mocked(controller.scheduleAutoSave)).toHaveBeenCalled();
  });

  it('runs the background REST connection tester and renders its result', async () => {
    const controller = createController();
    const messagingRepository = createMessaging({
      success: false,
      status: 401,
      message: 'API key rejected'
    });
    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          httpsUrl: 'https://localhost:27124',
          apiKey: 'bad-token'
        }
      },
      messages: null,
      language: 'en',
      messagingRepository
    } as never);

    findButton('测试连接').click();
    await flushPromises();

    expect(vi.mocked(messagingRepository.send)).toHaveBeenCalledWith({
      type: 'TEST_CONNECTION',
      rest: expect.objectContaining({
        vault: 'Research Vault',
        httpsUrl: 'https://localhost:27124',
        apiKey: 'bad-token'
      })
    });
    expect(document.body.textContent).toContain('API key rejected');
  });

  it('imports configuration from clipboard and saves it through the controller', async () => {
    const controller = createController();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(() =>
          Promise.resolve(JSON.stringify({ options: { aiChat: { userName: 'Imported' } } }))
        )
      }
    });

    mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: null,
      language: 'en'
    });

    findButton('导入并保存').click();
    await flushPromises();

    expect(vi.mocked(controller.applyImportedConfig)).toHaveBeenCalledWith(
      expect.objectContaining({
        aiChat: expect.objectContaining({ userName: 'Imported' })
      })
    );
  });

  it('repairs configuration using the existing production repair rules', async () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        rest: {
          vault: 'Research Vault',
          baseUrl: 'http://localhost:27124',
          httpsUrl: '',
          httpUrl: 'http://localhost:27123'
        },
        templates: {
          article: 'Clippings/{{title}}.md',
          fragment: '',
          ai: ''
        }
      },
      messages: null,
      language: 'en'
    });

    findButton('修复配置').click();
    await flushPromises();

    const repaired = mounted.collectDraft();
    expect(repaired.rest.baseUrl).toBe('https://localhost:27124');
    expect(repaired.rest.httpsUrl).toBeTruthy();
    expect(repaired.templates.article).toContain('Articles/');
    expect(repaired.templates.fragment).toBeTruthy();
    expect(repaired.templates.ai).toBeTruthy();
    expect(vi.mocked(controller.saveSnapshot)).toHaveBeenCalledWith({
      reason: 'manual',
      draft: expect.objectContaining({
        rest: expect.objectContaining({ baseUrl: 'https://localhost:27124' })
      })
    });
  });

  it('does not expose future classifier controls in the release options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        classifier: {
          enabled: false,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/api/chat',
          model: 'llama3.1',
          apiKey: '',
          taxonomy: {
            version: '1',
            categories: [{ id: 'research', name: 'Research' }],
            tags: [],
            rules: [],
            defaultCategory: 'research'
          }
        }
      },
      messages: null,
      language: 'en'
    });

    expect(document.body.textContent).not.toContain('启用智能分类');
    expect(document.querySelector('textarea.classifier-taxonomy')).toBeFalsy();
    expect(mounted.collectDraft().classifier).toEqual(
      expect.objectContaining({
        enabled: false,
        provider: 'ollama',
        model: 'llama3.1'
      })
    );
    expect(vi.mocked(controller.scheduleAutoSave)).not.toHaveBeenCalled();
  });

  it('keeps stored classifier taxonomy while the release options shell hides its editor', () => {
    const controller = createController();
    const existingTaxonomy = {
      version: '1',
      categories: [{ id: 'research', name: 'Research' }],
      tags: [],
      rules: [],
      defaultCategory: 'research'
    };
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        classifier: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/api/chat',
          model: 'llama3.1',
          apiKey: '',
          taxonomy: existingTaxonomy
        }
      },
      messages: null,
      language: 'en'
    });

    expect(document.querySelector('textarea.classifier-taxonomy')).toBeFalsy();
    expect(mounted.collectDraft().classifier.taxonomy).toEqual(existingTaxonomy);
  });

  it('uses the structured YAML editor instead of the JSON textarea fallback', async () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: controller as unknown as OptionsController,
      initialOptions: {
        yamlConfig: {
          contentTypes: {
            article: {
              fields: [{ name: 'author', type: 'text', enabled: false }]
            }
          }
        }
      },
      messages: null,
      language: 'en'
    });

    await flushPromises();

    expect(document.querySelector('.yaml-config-json')).toBeFalsy();
    expect(document.querySelector('.stitch-yaml-config-widget')).toBeTruthy();
    expect(document.querySelector('.stitch-yaml-config-table')).toBeTruthy();
    expect(document.querySelector('[data-role="yaml-config-view"]')).toBeFalsy();

    const authorRow = findYamlRowByField('author');
    const authorArticleToggle =
      authorRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(authorArticleToggle).toBeTruthy();
    authorArticleToggle!.checked = true;
    authorArticleToggle!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual(
      expect.objectContaining({
        name: 'author',
        enabled: true
      })
    );
  });
});
