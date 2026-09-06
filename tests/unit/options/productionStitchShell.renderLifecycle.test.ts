/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import * as productionStitchShellContextModule from '@options/app/productionStitchShellContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asOptionsController,
  createController,
  createMessaging,
  findButton,
  findCardByTitle,
  findInputByValue,
  findYamlRowByField,
  flushPromises,
  installSmoothMainScrollSimulation,
  queryRequired,
  requireElement,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';
import { createProductionStitchRenderLifecycle } from '@options/app/productionStitchRenderLifecycle';
import { createOptionsController, type OptionsController } from '@options/app/optionsController';
import { bindProductionStitchAuthoritativeRebase } from '@options/app/productionStitchAuthoritativeRebase';
import { createProductionStitchInvalidationBridge } from '@options/app/productionStitchShellRenderDelegates';
import * as sectionInvalidationModule from '@ui/stitch-runtime/render/sectionInvalidation';
import type { SectionInvalidationScope } from '@ui/stitch-runtime/render/sectionInvalidation';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { previewContent } from '@options/stitch/content';
import { getFooterMeta, getFooterView, getSettingsView } from '@options/stitch/schema/registry';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { StoredOptions } from '@shared/types';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';

function withLegacyRootDir<TRest extends NonNullable<StoredOptions['rest']>>(
  rest: TRest,
  rootDir: string
): TRest & { rootDir: string } {
  return Object.assign(rest, { rootDir });
}

function observeSectionOwnerCreation(): Promise<void> {
  let created: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    created = resolve;
  });
  const create = sectionInvalidationModule.createSectionInvalidationOwner;
  const spy = vi.spyOn(sectionInvalidationModule, 'createSectionInvalidationOwner');
  spy.mockImplementationOnce((options) => {
    spy.mockRestore();
    const owner = create(options);
    created();
    return owner;
  });
  return ready;
}

describe('mountProductionStitchShell renderLifecycle', () => {
  beforeEach(setupProductionStitchShellTest);

  it('mounts the shared Stitch shell and exposes the required lifecycle API', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { rest: { vault: 'Research Vault' } },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    expect(document.querySelector('.sidebar')).toBeTruthy();
    expect(document.querySelector('.brand-copy strong')?.textContent).toBe('Zendio');
    const brandLink = document.querySelector<HTMLAnchorElement>('.brand-title-link');
    expect(brandLink?.textContent).toBe('Zendio');
    expect(brandLink?.getAttribute('href')).toBe('https://zendio.sxnian.com/en/');
    expect(brandLink?.getAttribute('target')).toBe('_blank');
    expect(brandLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(document.querySelector('.brand-copy span')?.textContent).toMatch(/^v\d+\.\d+\.\d+/);
    const brandLogo = document.querySelector<HTMLImageElement>('.brand-mark img');
    expect(brandLogo?.getAttribute('src')).toBe('../icons/bannerlogo-128.png');
    expect(document.querySelector('[data-nav-panel="overview"]')).toBeTruthy();
    expect(document.querySelector('[data-panel-id="storage"]')).toBeTruthy();
    expect(document.querySelector('.nav-group > .nav-title')).toBeNull();
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Resources');
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Settings');
    expect(document.querySelector('.sidebar')?.textContent).not.toContain('Runtime UI');
    expect(document.querySelector('[data-footer-panel="clipper"]')).toBeNull();
    expect(typeof mounted.cleanup).toBe('function');
    expect(typeof mounted.collectDraft).toBe('function');
    expect(typeof mounted.rebaseOptions).toBe('function');
    expect(typeof mounted.refreshOptions).toBe('function');
    expect(typeof mounted.setMessages).toBe('function');
  });

  it('resolves production shell image assets through the injected resolver', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en',
      runtime: {
        getURL: (path: string) => `extension-root://${path}`,
        getBrowserTarget: () => 'chrome'
      }
    } as never);

    const brandLogo = document.querySelector<HTMLImageElement>('.brand-mark img');
    expect(brandLogo?.getAttribute('src')).toBe('extension-root://icons/bannerlogo-128.png');
  });

  it('collectDraft returns complete options and preserves refreshed fields', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { rest: { vault: 'Research Vault' } },
      messages: null,
      language: 'en'
    });

    expect(mounted.collectDraft()).toEqual(
      expect.objectContaining({
        ...mergeOptions({ rest: { vault: 'Research Vault' } }),
        rest: expect.objectContaining({ vault: 'Research Vault' }) as unknown
      })
    );

    mounted.refreshOptions({ aiChat: { userName: 'Alice' } });
    expect(mounted.collectDraft().aiChat.userName).toBe('Alice');
  });

  it('rebases an authoritative output field without replacing shell owners or losing selection', async () => {
    const ownerReady = observeSectionOwnerCreation();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: { templates: { article: 'Alice' } },
      messages: null,
      language: 'en'
    });
    await ownerReady;
    await flushPromises();

    const root = queryRequired<HTMLElement>('#optionsShellRoot');
    const main = queryRequired<HTMLElement>('.main');
    const sidebar = queryRequired<HTMLElement>('.sidebar');
    const storage = queryRequired<HTMLElement>('[data-panel-id="storage"]');
    const input = findInputByValue('Alice');
    input.focus();
    input.setSelectionRange(1, 4, 'forward');
    main.scrollTop = 377;

    const next = mounted.collectDraft();
    next.templates.article = 'Bobbie';
    mounted.rebaseOptions(next, {
      changedPaths: [['templates', 'article']],
      dirtyPathKeys: []
    });
    await flushPromises();

    const rebasedInput = findInputByValue('Bobbie');
    expect(queryRequired<HTMLElement>('#optionsShellRoot')).toBe(root);
    expect(queryRequired<HTMLElement>('.main')).toBe(main);
    expect(queryRequired<HTMLElement>('.sidebar')).toBe(sidebar);
    expect(queryRequired<HTMLElement>('[data-panel-id="storage"]')).toBe(storage);
    expect(document.activeElement).toBe(rebasedInput);
    expect(rebasedInput.selectionStart).toBe(1);
    expect(rebasedInput.selectionEnd).toBe(4);
    expect(rebasedInput.selectionDirection).toBe('forward');
    expect(main.scrollTop).toBe(377);
  });

  it('preserves invalid UI-local YAML without creating a persistence intent', async () => {
    const initial = mergeOptions({
      templates: { article: 'local-template' },
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
          }
        }
      }
    });
    const listeners: Array<(options: StoredOptions) => void> = [];
    const save = vi.fn((_patches: readonly OptionsPatch[]) => Promise.resolve(initial));
    const controller = createOptionsController({
      persistence: {
        load: () => Promise.resolve(initial),
        save,
        getCached: () => initial,
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        }
      },
      formAdapter: { read: (snapshot) => mergeOptions(snapshot), apply: () => Promise.resolve() }
    });
    await controller.loadInitialState();
    const mounted = mountProductionStitchShell({
      controller,
      initialOptions: initial,
      messages: null,
      language: 'en'
    });
    const unbind = bindProductionStitchAuthoritativeRebase(controller, mounted);
    await flushPromises();

    const widget = queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]');
    const row = requireElement(findYamlRowByField('score'), 'score YAML row');
    const invalidInput = queryRequired<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]',
      row
    );
    invalidInput.value = 'not-a-number';
    invalidInput.dispatchEvent(new Event('input', { bubbles: true }));

    const remote = structuredClone(initial);
    remote.templates.article = 'remote-template';
    listeners.forEach((listener) => listener(remote));

    expect(queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]')).toBe(widget);
    expect(invalidInput.value).toBe('not-a-number');
    expect(findInputByValue('local-template')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();

    unbind();
    mounted.cleanup();
    await controller.dispose();
  });

  it('releases a deferred remote output scope after valid YAML acknowledgement', async () => {
    const initial = mergeOptions({
      templates: { article: 'local-template' },
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
          }
        }
      }
    });
    let repositorySnapshot = structuredClone(initial);
    const listeners: Array<(options: StoredOptions) => void> = [];
    let releaseSave: (() => void) | undefined;
    const save = vi.fn(
      (_patches: readonly OptionsPatch[]) =>
        new Promise<StoredOptions>((resolve) => {
          releaseSave = () => {
            const acknowledged = structuredClone(repositorySnapshot);
            acknowledged.yamlConfig = mounted.collectDraft().yamlConfig;
            resolve(acknowledged);
          };
        })
    );
    const controller = createOptionsController({
      persistence: {
        load: () => Promise.resolve(initial),
        save,
        getCached: () => repositorySnapshot,
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        }
      },
      formAdapter: { read: (snapshot) => mergeOptions(snapshot), apply: () => Promise.resolve() }
    });
    await controller.loadInitialState();
    const mounted = mountProductionStitchShell({
      controller,
      initialOptions: initial,
      messages: null,
      language: 'en'
    });
    const unbind = bindProductionStitchAuthoritativeRebase(controller, mounted);
    await flushPromises();

    const widget = queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]');
    const row = requireElement(findYamlRowByField('score'), 'score YAML row');
    const input = queryRequired<HTMLInputElement>('input[data-yaml-field="defaultValue"]', row);
    input.value = '43';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const flush = controller.flushPendingAutoSave();

    const remote = structuredClone(initial);
    remote.templates.article = 'remote-template';
    repositorySnapshot = remote;
    listeners.forEach((listener) => listener(remote));
    expect(queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]')).toBe(widget);
    expect(findInputByValue('local-template')).toBeTruthy();

    releaseSave?.();
    await flush;
    await flushPromises();

    expect(findInputByValue('remote-template')).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    const savedPaths = save.mock.calls[0]?.[0].map((patch) => patch.path);
    expect(savedPaths).toContainEqual(['yamlConfig']);
    expect(savedPaths).not.toContainEqual(['templates', 'article']);
    expect(
      mounted.collectDraft().yamlConfig?.contentTypes?.article?.customFields?.[0]?.defaultValue
    ).toBe(43);

    unbind();
    mounted.cleanup();
    await controller.dispose();
  });

  it('rebases a same-panel remote field around a focused ordinary dirty control', async () => {
    const initial = mergeOptions({
      templates: { article: 'article-old', video: 'video-old' }
    });
    const listeners: Array<(options: StoredOptions) => void> = [];
    const controller = createOptionsController({
      persistence: {
        load: () => Promise.resolve(initial),
        save: () => Promise.resolve(initial),
        getCached: () => initial,
        subscribe: (listener) => {
          listeners.push(listener);
          return () => undefined;
        }
      },
      formAdapter: { read: (snapshot) => mergeOptions(snapshot), apply: () => Promise.resolve() }
    });
    await controller.loadInitialState();
    const mounted = mountProductionStitchShell({
      controller,
      initialOptions: initial,
      messages: null,
      language: 'en'
    });
    const unbind = bindProductionStitchAuthoritativeRebase(controller, mounted);
    await flushPromises();

    const root = queryRequired<HTMLElement>('#optionsShellRoot');
    const main = queryRequired<HTMLElement>('.main');
    const storage = queryRequired<HTMLElement>('[data-panel-id="storage"]');
    const articleInput = findInputByValue('article-old');
    articleInput.value = 'article-local-edit';
    articleInput.dispatchEvent(new Event('input', { bubbles: true }));
    articleInput.focus();
    articleInput.setSelectionRange(2, 9, 'backward');
    main.scrollTop = 463;
    const windowScroll = { x: window.scrollX, y: window.scrollY };

    const remote = structuredClone(initial);
    remote.templates.video = 'video-remote';
    listeners.forEach((listener) => listener(remote));
    await flushPromises();

    const rebasedArticle = findInputByValue('article-local-edit');
    expect(queryRequired<HTMLElement>('#optionsShellRoot')).toBe(root);
    expect(queryRequired<HTMLElement>('.main')).toBe(main);
    expect(queryRequired<HTMLElement>('[data-panel-id="storage"]')).toBe(storage);
    expect(findInputByValue('video-remote')).toBeTruthy();
    expect(document.activeElement).toBe(rebasedArticle);
    expect(rebasedArticle.selectionStart).toBe(2);
    expect(rebasedArticle.selectionEnd).toBe(9);
    expect(rebasedArticle.selectionDirection).toBe('backward');
    expect(main.scrollTop).toBe(463);
    expect({ x: window.scrollX, y: window.scrollY }).toEqual(windowScroll);

    controller.cancelAutoSave();
    unbind();
    mounted.cleanup();
    await controller.dispose();
  });

  it('setMessages recreates schema context with the new language while keeping the version subtitle', async () => {
    const ownerReady = observeSectionOwnerCreation();
    const controller = createController();
    const schemaContextSpy = vi.spyOn(
      productionStitchShellContextModule,
      'createProductionStitchSchemaContext'
    );
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'zh-CN'
    });
    await ownerReady;

    expect(
      document.querySelector<HTMLAnchorElement>('.brand-title-link')?.getAttribute('href')
    ).toBe('https://zendio.sxnian.com/');

    mounted.setMessages(
      {
        ...DEFAULT_RUNTIME_MESSAGES,
        schemaOverviewTitle: 'Overview From Messages',
        extensionSubtitle: 'Production Shell'
      },
      'en'
    );

    const recreatedContextInput = schemaContextSpy.mock.calls.at(-1)?.[0];
    if (!recreatedContextInput) {
      throw new Error('Expected schema context recreation call.');
    }
    const recreatedContext =
      productionStitchShellContextModule.createProductionStitchSchemaContext(recreatedContextInput);
    expect(recreatedContext.language).toBe('en');
    expect(recreatedContext.messages?.schemaOverviewTitle).toBe('Overview From Messages');
    expect(recreatedContext.t?.('schemaOverviewTitle', 'Fallback')).toBe('Overview From Messages');
    expect(document.querySelector('.brand-copy span')?.textContent).toMatch(/^v\d+\.\d+\.\d+/);
    expect(
      document.querySelector<HTMLAnchorElement>('.brand-title-link')?.getAttribute('href')
    ).toBe('https://zendio.sxnian.com/en/');

    mounted.cleanup();
    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');
  });

  it('cleanup detaches shell theme listeners and clears the mount root', () => {
    const controller = createController();
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as never);

    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { interfaceTheme: 'system' },
      messages: null,
      language: 'en'
    });

    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(document.getElementById('optionsShellRoot')?.innerHTML).not.toBe('');

    mounted.cleanup();

    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(document.getElementById('optionsShellRoot')?.innerHTML).toBe('');
  });

  it('tests modal render lifecycle without widget-host mutation', () => {
    const mountRoot = document.createElement('div');
    mountRoot.innerHTML =
      '<div class="resource-modal-overlay"></div><div data-modal-host="true"></div>';
    const flushDirtyWidgets = vi.fn();
    const destroyWidgets = vi.fn();
    const lifecycle = createProductionStitchRenderLifecycle({
      mountRoot,
      getAppData: () => ({ overview: { history: [] }, nav: [] }) as never,
      getCurrentLanguage: () => 'en',
      getState: () => ({ activeResource: null }) as never,
      setState: vi.fn(),
      createSchemaContext: () =>
        ({ appData: { nav: [], sidebarLinks: [], surfaceLinks: [] }, state: {} }) as never,
      dispatch: vi.fn(),
      resolveAssetUrl: (path) => path,
      schemaRenderer: { renderView: vi.fn() },
      widgetHost: {
        createWidgetFactory: vi.fn(),
        destroyWidgets,
        flushDirtyWidgets,
        mountWidget: vi.fn()
      }
    });

    lifecycle.renderActiveResourceModal();

    expect(mountRoot.querySelector('.resource-modal-overlay')).toBeNull();
    expect(flushDirtyWidgets).not.toHaveBeenCalled();
    expect(destroyWidgets).not.toHaveBeenCalled();
  });

  it('binds production option values and schedules autosave after edits', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        rest: { vault: 'Bob Vault' },
        video: { promptButtonLabel: 'Clip this video', promptShortcut: 'Alt+Shift+V' }
      },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    const vaultNameInput = findInputByValue('Bob Vault');

    vaultNameInput.value = 'Alice Vault';
    vaultNameInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(vi.mocked(controller.scheduleAutoSave)).toHaveBeenCalledTimes(1);
    expect(mounted.collectDraft().rest.vault).toBe('Alice Vault');
  });

  it('captures each real persisted switch interaction through the controller boundary', () => {
    const controller = createController();
    const scheduleAutoSave = vi.fn<OptionsController['scheduleAutoSave']>();
    controller.scheduleAutoSave = scheduleAutoSave;
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { fragmentClipper: { captureContext: false } },
      messages: null,
      language: 'en'
    });
    const captureRow = Array.from(document.querySelectorAll<HTMLElement>('.row')).find((row) =>
      row.textContent?.includes('Capture Context')
    );
    const captureSwitch = requireElement(
      captureRow?.querySelector<HTMLInputElement>('input[type="checkbox"]'),
      'capture context switch'
    );

    captureSwitch.checked = true;
    captureSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    const firstCollector = scheduleAutoSave.mock.calls[0]?.[0];
    expect(firstCollector?.()?.fragmentClipper?.captureContext).toBe(true);

    captureSwitch.checked = false;
    captureSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    const secondCollector = scheduleAutoSave.mock.calls[1]?.[0];
    expect(secondCollector?.()?.fragmentClipper?.captureContext).toBe(false);
    expect(scheduleAutoSave).toHaveBeenCalledTimes(2);
    expect(mounted.collectDraft().fragmentClipper.captureContext).toBe(false);
  });

  it('prevents mouse button presses from moving the production Options scroller', async () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    await flushPromises();

    const main = queryRequired<HTMLElement>('.main');
    main.scrollTop = 420;

    const yamlAddButton = findButton('+ Add field');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    yamlAddButton.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector<HTMLElement>('.main')?.scrollTop).toBe(420);
  });

  it('renders Video Prompt & Entry switches in one horizontal body row instead of the card header', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        video: { floatingPromptEnabled: true, commentEditorAutoPause: true }
      },
      messages: null,
      language: 'en'
    });

    const card = findCardByTitle('Video Prompt & Entry');
    const header = card.querySelector<HTMLElement>('.card-header');
    expect(header?.textContent).not.toContain('Show note button on video sites');
    expect(header?.textContent).not.toContain('Pause video while editing notes');

    const videoEntryRow = requireElement(
      card.querySelector<HTMLElement>('.video-entry-toggle-row'),
      'video entry toggle row'
    );
    expect(videoEntryRow.textContent).toContain('Show note button on video sites');
    expect(videoEntryRow.textContent).toContain('Pause video while editing notes');
    const [promptSwitch, autoPauseSwitch] = Array.from(
      videoEntryRow.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    expect([promptSwitch, autoPauseSwitch]).toHaveLength(2);
    expect(promptSwitch?.checked).toBe(true);
    expect(autoPauseSwitch?.checked).toBe(true);
    expect(card.textContent).toContain(
      'Grey dots mean no screenshot has been saved for that timestamp yet.'
    );
    expect(card.textContent).toContain('Green dots mean a screenshot is already attached.');
  });

  it('renders video screenshot attachment inputs, hydrates merged values, and preserves string writes', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        video: {
          floatingPromptEnabled: false,
          commentEditorAutoPause: false,
          screenshotAttachment: {
            locationTemplate: 'VideoShots/${noteFileName}',
            markdownUrlFormat: '![[${fileName}]]'
          }
        }
      },
      messages: null,
      language: 'en'
    });

    const card = findCardByTitle('Video Prompt & Entry');
    expect(card.textContent).toContain('Attachment path configuration');
    expect(card.textContent).toContain('Custom Attachment Location');
    expect(
      card.querySelector<HTMLAnchorElement>(
        'a[href="https://github.com/mnaoumov/obsidian-custom-attachment-location"]'
      )
    ).toBeTruthy();

    const rows = Array.from(card.querySelectorAll<HTMLElement>('.row'));
    const locationRow = rows.find((row) =>
      row.textContent?.includes('Attachment location template')
    );
    const fileNameRow = rows.find((row) =>
      row.textContent?.includes('Attachment filename template')
    );
    const markdownRow = rows.find((row) => row.textContent?.includes('Markdown URL format'));

    const locationInput = queryRequired<HTMLInputElement>(
      'input',
      requireElement(locationRow, 'Attachment location template row')
    );
    const fileNameInput = queryRequired<HTMLInputElement>(
      'input',
      requireElement(fileNameRow, 'Attachment filename template row')
    );
    const markdownInput = queryRequired<HTMLInputElement>(
      'input',
      requireElement(markdownRow, 'Markdown URL format row')
    );

    expect(locationInput.value).toBe('VideoShots/${noteFileName}');
    expect(fileNameInput.value).toBe("file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg");
    expect(markdownInput.value).toBe('![[${fileName}]]');

    locationInput.value = 'Assets/${noteFileName}';
    locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileNameInput.value = 'capture-${title}.jpg';
    fileNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    markdownInput.value = '![](${attachmentUrl})';
    markdownInput.dispatchEvent(new Event('input', { bubbles: true }));

    const videoEntryRow = requireElement(
      card.querySelector<HTMLElement>('.video-entry-toggle-row'),
      'video entry toggle row'
    );
    const videoEntrySwitches = Array.from(
      videoEntryRow.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    expect(videoEntrySwitches).toHaveLength(2);
    const promptCheckbox = requireElement(videoEntrySwitches[0], 'video prompt switch');
    const autoPauseCheckbox = requireElement(videoEntrySwitches[1], 'video auto-pause switch');
    promptCheckbox.checked = true;
    promptCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    autoPauseCheckbox.checked = true;
    autoPauseCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().video).toEqual(
      expect.objectContaining({
        floatingPromptEnabled: true,
        commentEditorAutoPause: true,
        screenshotAttachment: {
          locationTemplate: 'Assets/${noteFileName}',
          fileNameTemplate: 'capture-${title}.jpg',
          markdownUrlFormat: '![](${attachmentUrl})'
        }
      })
    );
  });

  it('opens onboarding through the production onboarding page path', () => {
    const controller = createController();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    findButton('Setup Guide').click();

    expect(openSpy).toHaveBeenCalledWith(
      '../onboarding/index.html',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('keeps the Options scroller stable when Vault List actions re-render', async () => {
    const restoreScrollDescriptor = installSmoothMainScrollSimulation();
    const controller = createController();
    const messagingRepository = createMessaging({ success: true, message: 'ok' });
    try {
      mountProductionStitchShell({
        controller: asOptionsController(controller),
        initialOptions: {
          rest: { vault: 'Research Vault' }
        },
        messages: null,
        language: 'en',
        messagingRepository
      } as never);
      const main = queryRequired<HTMLElement>('.main');
      main.style.scrollBehavior = 'auto';
      main.scrollTop = 520;
      main.style.removeProperty('scroll-behavior');

      const addVaultButton = findButton('Add Vault');
      const pointerEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      addVaultButton.dispatchEvent(pointerEvent);
      document.getElementById('optionsShellRoot')?.addEventListener(
        'click',
        () => {
          const currentMain = document.querySelector<HTMLElement>('.main');
          if (currentMain) {
            currentMain.scrollTop = 0;
          }
        },
        { capture: true, once: true }
      );

      addVaultButton.click();
      await flushPromises();
      expect(document.querySelector<HTMLElement>('.main')?.scrollTop).toBe(520);

      const currentMain = queryRequired<HTMLElement>('.main');
      currentMain.style.scrollBehavior = 'auto';
      currentMain.scrollTop = 520;
      currentMain.style.removeProperty('scroll-behavior');
      findButton('Delete').click();
      await flushPromises();
      expect(document.querySelector<HTMLElement>('.main')?.scrollTop).toBe(520);

      const finalMain = queryRequired<HTMLElement>('.main');
      finalMain.style.scrollBehavior = 'auto';
      finalMain.scrollTop = 520;
      finalMain.style.removeProperty('scroll-behavior');
      findButton('Test Connection').click();
      await flushPromises();
      expect(document.querySelector<HTMLElement>('.main')?.scrollTop).toBe(520);
    } finally {
      restoreScrollDescriptor();
    }
  });

  it('uses an immediate scroll fallback when sidebar navigation targets a panel', () => {
    const restoreScrollDescriptor = installSmoothMainScrollSimulation();
    const controller = createController();
    try {
      mountProductionStitchShell({
        controller: asOptionsController(controller),
        initialOptions: null,
        messages: null,
        language: 'en'
      });

      const main = queryRequired<HTMLElement>('.main');
      const storageSection = queryRequired<HTMLElement>('[data-panel-id="storage"]');
      Object.defineProperty(storageSection, 'offsetTop', {
        configurable: true,
        value: 640
      });

      queryRequired<HTMLButtonElement>('[data-nav-panel="storage"]').click();

      expect(main.scrollTop).toBe(628);
      expect(
        queryRequired<HTMLElement>('[data-nav-panel="storage"]').classList.contains('is-active')
      ).toBe(true);
    } finally {
      restoreScrollDescriptor();
    }
  });

  it('does not render the future experimental panel in the release options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
      initialOptions: {
        rest: withLegacyRootDir({ vault: 'Widget Vault' }, 'WidgetRoot/'),
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

  it('flushes dirty YAML only for output replacement, not unrelated theme or storage actions', async () => {
    const controller = createController();
    const collectSpy = vi.spyOn(YamlConfigEditorWidgetAdapter.prototype, 'collect');
    const destroySpy = vi.spyOn(YamlConfigEditorWidgetAdapter.prototype, 'destroy');
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
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
    collectSpy.mockClear();
    destroySpy.mockClear();

    const authorRow = requireElement(findYamlRowByField('author'), 'author YAML row');
    const authorArticleToggle = queryRequired<HTMLInputElement>(
      'input[type="checkbox"]',
      authorRow
    );
    authorArticleToggle.checked = true;
    authorArticleToggle.dispatchEvent(new Event('change', { bubbles: true }));
    const yamlWidget = queryRequired<HTMLElement>('.stitch-yaml-config-widget');

    findButton('Dark').click();
    findButton('Test Connection').click();
    await flushPromises();

    expect(document.querySelector('.stitch-yaml-config-widget')).toBe(yamlWidget);
    expect(collectSpy).not.toHaveBeenCalled();
    expect(destroySpy).not.toHaveBeenCalled();

    queryRequired<HTMLButtonElement>('[data-action-id="domain:add"]').click();

    expect(document.querySelector('.stitch-yaml-config-widget')).not.toBe(yamlWidget);
    expect(collectSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual(
      expect.objectContaining({ name: 'author', enabled: true })
    );
    collectSpy.mockRestore();
    destroySpy.mockRestore();
  });

  it('does not render fake interactive YAML summary buttons outside the structured YAML widget', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
    expect(text).toContain('Show note button on video sites');
    expect(text).toContain('Pause video while editing notes');

    const videoCard = findCardByTitle('Video Prompt & Entry');
    const videoEntryRow = requireElement(
      videoCard.querySelector<HTMLElement>('.video-entry-toggle-row'),
      'video entry toggle row'
    );
    expect(videoEntryRow.textContent).toContain('Show note button on video sites');
    expect(videoEntryRow.textContent).toContain('Pause video while editing notes');
    const videoEntrySwitches = Array.from(
      videoEntryRow.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    expect(
      videoCard.querySelectorAll<HTMLInputElement>('.card-header input[type="checkbox"]')
    ).toHaveLength(0);
    expect(videoEntrySwitches).toHaveLength(2);
    const videoSwitch = requireElement(videoEntrySwitches[0], 'video prompt switch');
    const commentEditorAutoPauseSwitch = requireElement(
      videoEntrySwitches[1],
      'video auto-pause switch'
    );
    videoSwitch.checked = false;
    videoSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    commentEditorAutoPauseSwitch.checked = true;
    commentEditorAutoPauseSwitch.dispatchEvent(new Event('change', { bubbles: true }));

    const draft = mounted.collectDraft();
    expect(draft.video.floatingPromptEnabled).toBe(false);
    expect(draft.video.commentEditorAutoPause).toBe(true);
    expect(draft.aiChat.includeTimestamps).toBe(true);
    expect(draft.deepResearch.pureMode).toBe(true);
    expect(draft.video.promptPosition).toEqual({ x: 99, y: 77 });
  });

  it('updates all selection trigger modes while keeping modifier-key edits incremental', async () => {
    const ownerReady = observeSectionOwnerCreation();
    const controller = createController();
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'Win32'
    });
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        fragmentClipper: {
          selectionTriggerMode: 'modifier',
          selectionModifierKeys: ['alt']
        }
      },
      messages: null,
      language: 'en'
    });
    await ownerReady;

    const main = queryRequired<HTMLElement>('.main');
    const altChip = queryRequired<HTMLButtonElement>(
      '.modifier-key-inline .chip[data-value="alt"]'
    );
    const shiftChip = queryRequired<HTMLButtonElement>(
      '.modifier-key-inline .chip[data-value="shift"]'
    );
    expect(document.body.textContent).toContain(
      'Alt may conflict with system, browser, or page shortcuts. If it is unstable, use Shift.'
    );

    shiftChip.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(altChip.getAttribute('aria-pressed')).toBe('false');
    expect(shiftChip.getAttribute('aria-pressed')).toBe('true');
    expect(mounted.collectDraft().fragmentClipper.selectionTriggerMode).toBe('modifier');
    expect(mounted.collectDraft().fragmentClipper.selectionModifierKeys).toEqual(['shift']);
    expect(document.body.textContent).not.toContain('快捷键冲突');

    const directSelect = queryRequired<HTMLSelectElement>('.selection-trigger-inline select');
    directSelect.value = 'direct';
    directSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().fragmentClipper.selectionTriggerMode).toBe('direct');
    expect(document.querySelectorAll('.modifier-key-inline .chip')).toHaveLength(0);

    const disabledSelect = queryRequired<HTMLSelectElement>('.selection-trigger-inline select');
    disabledSelect.value = 'disabled';
    disabledSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().fragmentClipper.selectionTriggerMode).toBe('disabled');
    expect(mounted.collectDraft().fragmentClipper.selectionModifierKeys).toEqual(['shift']);
  });

  it('renders the fragment keyboard shortcut hint for the current desktop platform only', () => {
    const controller = createController();
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'Win32'
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    expect(document.body.textContent).toContain(
      'In clipper dialog: Double-Enter to enter reader mode, Alt+Enter to clip directly'
    );
    expect(document.body.textContent).not.toContain('Cmd+Enter (Mac) or Alt+Enter (Windows)');
    expect(document.body.textContent).not.toContain('Cmd+Enter to clip directly');
  });

  it('keeps YAML widget interactions scoped away from the options shell render tree', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
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
    requireElement(widgetHost, 'YAML widget host');
    const articleFilterButton = requireElement(articleFilter, 'article YAML filter');
    const addFieldButton = requireElement(addField, 'add YAML field button');

    articleFilterButton.click();
    addFieldButton.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(document.querySelector('[data-stitch-widget="yaml-config"]')).toBe(widgetHost);
  });

  it('keeps a locally dirty YAML widget and its scroll state during an output rebase', () => {
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
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
    const widget = queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]');
    const table = queryRequired<HTMLElement>('.stitch-yaml-config-table', widget);
    const row = requireElement(findYamlRowByField('score'), 'score YAML row');
    const input = queryRequired<HTMLInputElement>('input[data-yaml-field="defaultValue"]', row);
    input.value = '43';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    table.scrollTop = 91;

    const rebased = mounted.collectDraft();
    rebased.templates.article = 'remote-template';
    mounted.rebaseOptions(rebased, {
      changedPaths: [['templates', 'article']],
      dirtyPathKeys: ['yamlConfig']
    });

    expect(queryRequired<HTMLElement>('[data-stitch-widget="yaml-config"]')).toBe(widget);
    expect(queryRequired<HTMLElement>('.stitch-yaml-config-table', widget).scrollTop).toBe(91);
    expect(
      queryRequired<HTMLInputElement>('input[data-yaml-field="defaultValue"]', row).value
    ).toBe('43');
    expect(mounted.collectDraft().templates.article).toBe('remote-template');
  });

  it('keeps disabled default YAML custom fields in production collectDraft', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    const statusRow = requireElement(findYamlRowByField('status'), 'status YAML row');
    const statusToggle = queryRequired<HTMLInputElement>('input[type="checkbox"]', statusRow);

    expect(statusToggle.checked).toBe(true);
    statusToggle.checked = false;
    statusToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({
        name: 'status',
        enabled: false,
        defaultValue: ['unread']
      })
    ]);
  });

  it('locks default YAML custom field delete and rename controls in production', async () => {
    const ownerReady = observeSectionOwnerCreation();
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    await ownerReady;

    const statusRow = requireElement(findYamlRowByField('status'), 'status YAML row');
    const nameInput = queryRequired<HTMLInputElement>('input[data-yaml-field="name"]', statusRow);
    const deleteButton = queryRequired<HTMLButtonElement>('button.yaml-delete-button', statusRow);

    expect(nameInput.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);

    nameInput.value = 'state';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    deleteButton.click();

    const draft = mounted.collectDraft();
    expect(draft.yamlConfig ?? null).toBeNull();

    mounted.refreshOptions(draft);
    expect(findYamlRowByField('status')).toBeTruthy();
    expect(findYamlRowByField('state')).toBeNull();
  });

  it('does not clone default YAML custom fields from non-owner content toggles', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    const statusRow = requireElement(findYamlRowByField('status'), 'status YAML row');
    const articleToggle = queryRequired<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="article"]',
      statusRow
    );
    const nonOwnerToggles = ['clipper', 'video', 'ai_chat'].map((contentType) =>
      queryRequired<HTMLInputElement>(
        `input.stitch-yaml-toggle[data-mode="${contentType}"]`,
        statusRow
      )
    );

    expect(articleToggle.disabled).toBe(false);
    expect(articleToggle.checked).toBe(true);
    for (const toggle of nonOwnerToggles) {
      expect(toggle.disabled).toBe(true);
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const draft = mounted.collectDraft();
    expect(draft.yamlConfig ?? null).toBeNull();
  });

  it('does not let invalid YAML widget edits pollute production collectDraft', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
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

    const row = requireElement(findYamlRowByField('score'), 'score YAML row');
    const defaultValue = queryRequired<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]',
      row
    );
    defaultValue.value = 'not-a-number';
    defaultValue.dispatchEvent(new Event('input', { bubbles: true }));

    expect(vi.mocked(controller.scheduleAutoSave)).not.toHaveBeenCalled();
    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({ name: 'score', defaultValue: 42 })
    ]);
    expect(document.body.textContent).toContain(
      'Please fix YAML configuration errors before saving.'
    );
  });

  it('opens privacy policy and data usage resources from the privacy card', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

    const privacyPolicy = findButton('Privacy Policy');
    expect(privacyPolicy.disabled).toBe(false);
    privacyPolicy.click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Privacy Policy');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Page body, clipped text, article text, AI chat content, reading highlight text'
    );

    document.querySelector<HTMLElement>('.resource-modal-overlay')?.click();

    const dataUsage = findButton('Data usage details');
    expect(dataUsage.disabled).toBe(false);
    dataUsage.click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Data Usage');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Anonymous Usage Counts'
    );
  });

  it('handles resource navigation actions by closing the modal and activating the target panel', () => {
    const controller = createController();
    const messagingRepository = createMessaging();
    const legacyAliasPreviewContent = structuredClone(previewContent);
    legacyAliasPreviewContent.sidebarLinks = [
      ...previewContent.sidebarLinks,
      {
        id: 'plugin-setup',
        label: 'Plugin Setup',
        hint: 'Local REST API setup guide',
        icon: 'extension'
      }
    ];
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en',
      previewContent: legacyAliasPreviewContent,
      getFooterMeta,
      getFooterView,
      getSettingsView,
      messagingRepository: messagingRepository as never
    });

    findButton('Privacy Policy').click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Privacy Policy');
    document.querySelector<HTMLElement>('.resource-modal-overlay')?.click();

    findButton('Plugin Setup').click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Setup Guide');

    findButton('Go To Storage').click();

    expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    expect(
      document.querySelector('[data-nav-panel="storage"]')?.classList.contains('is-active')
    ).toBe(true);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'resource_open',
        outcome: 'completed',
        section: 'privacy'
      }
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'options_section_viewed',
      params: {
        section: 'storage'
      }
    });

    const emittedEvents = (messagingRepository.send.mock.calls as unknown as Array<[unknown]>).map(
      ([message]) => (message as { event?: string } | undefined)?.event
    );
    expect(emittedEvents).not.toContain('options_resource_viewed');
  });

  it('does not expose future classifier controls in the release options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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

    const authorRow = requireElement(findYamlRowByField('author'), 'author YAML row');
    const authorArticleToggle = queryRequired<HTMLInputElement>(
      'input[type="checkbox"]',
      authorRow
    );
    authorArticleToggle.checked = true;
    authorArticleToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual(
      expect.objectContaining({
        name: 'author',
        enabled: true
      })
    );
  });

  it('replaces only the invalidated storage owner and preserves unrelated roots and widgets', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    await flushPromises();
    const main = queryRequired<HTMLElement>('.main');
    const storage = queryRequired<HTMLElement>('[data-panel-id="storage"]');
    const unrelated = new Map(
      ['overview', 'capture-sources', 'capture-behavior', 'output', 'maintenance'].map((id) => [
        id,
        queryRequired<HTMLElement>(`[data-panel-id="${id}"]`)
      ])
    );
    const yamlWidget = queryRequired<HTMLElement>('.stitch-yaml-config-widget');
    main.scrollTop = 512;

    findButton('Add Vault').click();

    expect(document.querySelector('[data-panel-id="storage"]')).not.toBe(storage);
    unrelated.forEach((root, id) => {
      expect(document.querySelector(`[data-panel-id="${id}"]`)).toBe(root);
    });
    expect(document.querySelector('.main')).toBe(main);
    expect(document.querySelector('.stitch-yaml-config-widget')).toBe(yamlWidget);
    expect(main.scrollTop).toBe(512);
  });

  it('routes a missing owned panel through the enumerated all-invariant recovery scope', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: null,
      language: 'en'
    });
    await flushPromises();
    const main = queryRequired<HTMLElement>('.main');
    const addVault = findButton('Add Vault');
    const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-id]'));
    queryRequired<HTMLElement>('[data-panel-id="storage"]').remove();

    addVault.click();

    expect(document.querySelectorAll('[data-panel-id]')).toHaveLength(6);
    expect(document.querySelector('.main')).not.toBe(main);
    expect(
      roots.every(
        (root) => document.querySelector(`[data-panel-id="${root.dataset.panelId}"]`) !== root
      )
    ).toBe(true);
  });
});

describe('production invalidation owner pending lifecycle', () => {
  beforeEach(setupProductionStitchShellTest);
  let settleImport: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await settleImport?.();
    settleImport = null;
    vi.doUnmock('@ui/stitch-runtime/render/sectionInvalidation');
  });

  async function holdOwnerImport() {
    const actual = await vi.importActual<
      typeof import('@ui/stitch-runtime/render/sectionInvalidation')
    >('@ui/stitch-runtime/render/sectionInvalidation');
    let release: () => void = () => undefined;
    let rejectImport: (error: Error) => void = () => undefined;
    let entered: () => void = () => undefined;
    const requested = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve, reject) => {
      release = resolve;
      rejectImport = reject;
    });
    const create = vi.fn(actual.createSectionInvalidationOwner);
    const capture = vi.fn(actual.captureSectionDomSnapshot);
    const restore = vi.fn(actual.restoreSectionDomSnapshot);
    vi.doMock('@ui/stitch-runtime/render/sectionInvalidation', async () => {
      entered();
      await pending;
      return {
        ...actual,
        createSectionInvalidationOwner: create,
        captureSectionDomSnapshot: capture,
        restoreSectionDomSnapshot: restore
      };
    });
    settleImport = async () => {
      release();
      await import('@ui/stitch-runtime/render/sectionInvalidation').catch(() => undefined);
    };
    return {
      actual,
      capture,
      create,
      requested,
      restore,
      async resolve() {
        release();
        await import('@ui/stitch-runtime/render/sectionInvalidation');
      },
      async reject() {
        rejectImport(new Error('controlled owner import rejection'));
        await import('@ui/stitch-runtime/render/sectionInvalidation').catch(() => undefined);
      }
    };
  }

  it('replays a pending authoritative output rebase through capture/restore exactly once', async () => {
    const load = await holdOwnerImport();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: { templates: { article: 'Alice' } },
      messages: null,
      language: 'en'
    });
    await load.requested;
    const main = queryRequired<HTMLElement>('.main');
    const input = findInputByValue('Alice');
    // Focus actions preserve their entry scroll position, including their queued restoration.
    main.scrollTop = 377;
    input.focus();
    input.setSelectionRange(1, 4, 'backward');
    const next = mounted.collectDraft();
    next.templates.article = 'Bobbie';
    mounted.rebaseOptions(next, { changedPaths: [['templates', 'article']], dirtyPathKeys: [] });
    expect.soft(load.create).not.toHaveBeenCalled();
    expect.soft(input.isConnected).toBe(true);
    expect.soft(document.activeElement).toBe(input);
    expect(main.scrollTop).toBe(377);
    await load.resolve();
    const rebased = findInputByValue('Bobbie');
    expect(load.create).toHaveBeenCalledTimes(1);
    expect(load.capture).toHaveBeenCalledTimes(1);
    expect(load.restore).toHaveBeenCalledTimes(1);
    expect(load.restore).toHaveBeenCalledWith(
      queryRequired<HTMLElement>('#optionsShellRoot'),
      expect.objectContaining({ mainScrollTop: 377 })
    );
    expect(queryRequired<HTMLElement>('.main')).toBe(main);
    expect(document.activeElement).toBe(rebased);
    expect(rebased.selectionStart).toBe(1);
    expect(rebased.selectionEnd).toBe(4);
    expect(rebased.selectionDirection).toBe('backward');
    expect(main.scrollTop).toBe(377);
    mounted.cleanup();
  });

  it('constructs an empty root synchronously once and queues subsequent recovery through the owner', async () => {
    const load = await holdOwnerImport();
    const root = queryRequired<HTMLElement>('#optionsShellRoot');
    const recovery = vi.fn(() => {
      root.replaceChildren(document.createElement('main'));
    });
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { 'all-invariant-recovery': recovery },
      isActive: () => true,
      mountRoot: root
    });
    bridge.render('all-invariant-recovery');
    expect(root.firstElementChild?.tagName).toBe('MAIN');
    expect(recovery).toHaveBeenCalledTimes(1);
    await load.requested;
    root.replaceChildren();
    bridge.render('all-invariant-recovery');
    bridge.render('all-invariant-recovery');
    expect(recovery).toHaveBeenCalledTimes(1);
    await load.resolve();
    expect(recovery).toHaveBeenCalledTimes(2);
    expect(load.capture).toHaveBeenCalledTimes(1);
    expect(load.restore).toHaveBeenCalledTimes(1);
    bridge.dispose();
  });

  it('does not replay after dispose before owner resolution, even with an active host', async () => {
    const load = await holdOwnerImport();
    const output = vi.fn();
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { output },
      isActive: () => true,
      mountRoot: document.body
    });
    await load.requested;
    bridge.render('output');
    bridge.dispose();
    bridge.render('output');
    await load.resolve();
    expect(output).not.toHaveBeenCalled();
    expect(load.create).not.toHaveBeenCalled();
  });

  it('recovers once on import rejection without executing pending scopes again', async () => {
    const load = await holdOwnerImport();
    const output = vi.fn();
    const recovery = vi.fn();
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { output, 'all-invariant-recovery': recovery },
      isActive: () => true,
      mountRoot: document.body
    });
    await load.requested;
    bridge.render('output');
    bridge.render(['output', 'all-invariant-recovery']);
    await load.reject();
    expect(output).not.toHaveBeenCalled();
    expect(recovery).toHaveBeenCalledTimes(1);
    bridge.render('output');
    expect(recovery).toHaveBeenCalledTimes(2);
    expect(output).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('does not recover a disposed bridge on import rejection', async () => {
    const load = await holdOwnerImport();
    const recovery = vi.fn();
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { 'all-invariant-recovery': recovery },
      isActive: () => true,
      mountRoot: document.body
    });
    await load.requested;
    bridge.render('all-invariant-recovery');
    bridge.dispose();
    await load.reject();
    expect(recovery).not.toHaveBeenCalled();
  });

  it('reports a successful-import pending recovery throw once without retrying or losing owner error cleanup', async () => {
    const load = await holdOwnerImport();
    const failure = new Error('pending recovery render failed');
    let reported: () => void = () => undefined;
    const errorReported = new Promise<void>((resolve) => {
      reported = resolve;
    });
    const report = vi.spyOn(console, 'error').mockImplementation(() => reported());
    const storage = vi.fn();
    const recovery = vi.fn(() => {
      bridge.render('storage');
      if (recovery.mock.calls.length === 1) throw failure;
    });
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { storage, 'all-invariant-recovery': recovery },
      isActive: () => true,
      mountRoot: document.body
    });
    await load.requested;
    expect(() => bridge.render('all-invariant-recovery')).not.toThrow();
    expect(recovery).not.toHaveBeenCalled();
    await load.resolve();
    expect(recovery).toHaveBeenCalledTimes(1);
    await errorReported;
    expect(load.create).toHaveBeenCalledTimes(1);
    expect(load.create.mock.results[0]?.value.active).toBe(true);
    expect(load.capture).toHaveBeenCalledTimes(1);
    expect(load.restore).not.toHaveBeenCalled();
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(storage).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledExactlyOnceWith(
      '[ProductionStitchShell:section-invalidation]',
      failure
    );
    // The canonical owner discarded the reentrant request on failure and can accept fresh work.
    bridge.render('storage');
    expect(storage).toHaveBeenCalledTimes(1);
    expect(load.capture).toHaveBeenCalledTimes(2);
    expect(load.restore).toHaveBeenCalledTimes(1);
    expect(recovery).toHaveBeenCalledTimes(1);
    bridge.dispose();
    report.mockRestore();
  });

  it('preserves ready-owner reentrancy, validation and handler exception semantics', async () => {
    const load = await holdOwnerImport();
    const storage = vi.fn();
    const failure = new Error('output rendering failed');
    const output = vi.fn((): void => {
      bridge.render('storage');
      throw failure;
    });
    const bridge = createProductionStitchInvalidationBridge({
      handlers: { output, storage },
      isActive: () => true,
      mountRoot: document.body
    });
    await load.requested;
    expect(() => bridge.render([])).toThrow('SECTION_INVALIDATION_SCOPE_REQUIRED');
    expect(() => bridge.render('theme')).toThrow('UNKNOWN_SECTION_INVALIDATION_SCOPE:theme');
    await load.resolve();
    expect(() => bridge.render('output')).toThrow(failure);
    expect(storage).not.toHaveBeenCalled();
    output.mockImplementation(() => {
      bridge.render('storage');
      bridge.render('storage');
    });
    bridge.render('output');
    expect(output).toHaveBeenCalledTimes(2);
    expect(storage).toHaveBeenCalledTimes(1);
    expect(load.restore).toHaveBeenCalledTimes(2);
    bridge.dispose();
  });

  it.each([
    {
      scopes: ['output', 'storage', 'output', 'sidebar'],
      expected: ['output', 'storage', 'sidebar']
    },
    { scopes: ['output', 'locale-schema', 'storage'], expected: ['locale-schema'] },
    {
      scopes: ['output', 'all-invariant-recovery', 'locale-schema', 'storage'],
      expected: ['all-invariant-recovery']
    }
  ] satisfies Array<{ scopes: SectionInvalidationScope[]; expected: SectionInvalidationScope[] }>)(
    'coalesces pending scopes using the real owner: $expected',
    async ({ scopes, expected }) => {
      const load = await holdOwnerImport();
      const calls: SectionInvalidationScope[] = [];
      const handlers = Object.fromEntries(
        load.actual.SECTION_INVALIDATION_SCOPES.map((scope) => [
          scope,
          () => {
            calls.push(scope);
          }
        ])
      );
      const bridge = createProductionStitchInvalidationBridge({
        handlers,
        isActive: () => true,
        mountRoot: document.body
      });
      await load.requested;
      scopes.forEach((scope) => bridge.render(scope));
      expect.soft(calls).toEqual([]);
      await load.resolve();
      expect(calls).toEqual(expected);
      expect(load.capture).toHaveBeenCalledTimes(1);
      expect(load.restore).toHaveBeenCalledTimes(1);
      bridge.dispose();
    }
  );
});
