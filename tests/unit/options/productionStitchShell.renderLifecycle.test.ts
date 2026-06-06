/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { mergeOptions } from '@shared/config/optionsMerger';

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

  it('setMessages keeps the rendered version subtitle and cleanup clears the root', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'zh-CN'
    });

    mounted.setMessages({ extensionSubtitle: 'Production Shell' } as never, 'en');

    expect(document.querySelector('.brand-copy span')?.textContent).toMatch(/^v\d+\.\d+\.\d+/);

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
        aiChat: { userName: 'Bob' },
        video: { promptButtonLabel: 'Clip this video', promptShortcut: 'Alt+Shift+V' }
      },
      messages: null,
      language: 'en',
      messagingRepository: createMessaging({ success: true, message: 'ok' })
    } as never);

    const userNameInput = findInputByValue('Bob');

    userNameInput.value = 'Alice';
    userNameInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(vi.mocked(controller.scheduleAutoSave)).toHaveBeenCalledTimes(1);
    expect(mounted.collectDraft().aiChat.userName).toBe('Alice');
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

  it('renders Video Prompt & Entry switches in body rows instead of the card header', () => {
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
    expect(header?.textContent).not.toContain('在视频网站显示笔记按钮');
    expect(header?.textContent).not.toContain('编辑批注时自动暂停视频播放');

    const rows = Array.from(card.querySelectorAll<HTMLElement>('.row'));
    const promptRow = rows.find((row) => row.textContent?.includes('在视频网站显示笔记按钮'));
    const autoPauseRow = rows.find((row) =>
      row.textContent?.includes('编辑批注时自动暂停视频播放')
    );
    expect(promptRow?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(
      true
    );
    expect(autoPauseRow?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(
      true
    );
    expect(card.textContent).toContain('灰色圆点表示该时间戳尚未保存截图');
    expect(card.textContent).toContain('绿色圆点表示该时间戳已有截图');
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

    findButton('Onboarding').click();

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

      const addVaultButton = findButton('添加仓库');
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
      findButton('删除').click();
      await flushPromises();
      expect(document.querySelector<HTMLElement>('.main')?.scrollTop).toBe(520);

      const finalMain = queryRequired<HTMLElement>('.main');
      finalMain.style.scrollBehavior = 'auto';
      finalMain.scrollTop = 520;
      finalMain.style.removeProperty('scroll-behavior');
      findButton('测试连接').click();
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

    const authorRow = requireElement(findYamlRowByField('author'), 'author YAML row');
    const authorArticleToggle = queryRequired<HTMLInputElement>(
      'input[type="checkbox"]',
      authorRow
    );
    authorArticleToggle.checked = true;
    authorArticleToggle.dispatchEvent(new Event('change', { bubbles: true }));

    findButton('测试连接').click();
    await flushPromises();

    expect(mounted.collectDraft().yamlConfig?.contentTypes?.article?.fields?.[0]).toEqual(
      expect.objectContaining({ name: 'author', enabled: true })
    );
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
    expect(text).toContain('在视频网站显示笔记按钮');
    expect(text).toContain('编辑批注时自动暂停视频播放');

    const videoCard = findCardByTitle('Video Prompt & Entry');
    const videoRows = Array.from(videoCard.querySelectorAll<HTMLElement>('.row'));
    const videoSwitch = videoRows
      .find((row) => row.textContent?.includes('在视频网站显示笔记按钮'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const commentEditorAutoPauseSwitch = videoRows
      .find((row) => row.textContent?.includes('编辑批注时自动暂停视频播放'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(
      videoCard.querySelectorAll<HTMLInputElement>('.card-header input[type="checkbox"]')
    ).toHaveLength(0);
    expect([videoSwitch, commentEditorAutoPauseSwitch].filter(Boolean)).toHaveLength(2);
    if (videoSwitch) {
      videoSwitch.checked = false;
      videoSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (commentEditorAutoPauseSwitch) {
      commentEditorAutoPauseSwitch.checked = true;
      commentEditorAutoPauseSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const draft = mounted.collectDraft();
    expect(draft.video.floatingPromptEnabled).toBe(false);
    expect(draft.video.commentEditorAutoPause).toBe(true);
    expect(draft.aiChat.includeTimestamps).toBe(true);
    expect(draft.deepResearch.pureMode).toBe(true);
    expect(draft.video.promptPosition).toEqual({ x: 99, y: 77 });
  });

  it('updates fragment modifier chips without remounting the options shell', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: {
        fragmentClipper: {
          selectionModifierEnabled: true,
          selectionModifierKeys: ['alt']
        }
      },
      messages: null,
      language: 'en'
    });

    const main = queryRequired<HTMLElement>('.main');
    const altChip = requireElement(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.modifier-key-inline .chip')).find(
        (button) => button.textContent?.trim() === 'Alt'
      ),
      'Alt modifier chip'
    );

    altChip.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(altChip.getAttribute('aria-pressed')).toBe('false');
    expect(mounted.collectDraft().fragmentClipper.selectionModifierEnabled).toBe(false);
    expect(mounted.collectDraft().fragmentClipper.selectionModifierKeys).toEqual([]);
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

  it('locks default YAML custom field delete and rename controls in production', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en'
    });

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
    const messagingRepository = createMessaging();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en',
      messagingRepository: messagingRepository as never
    });

    findButton('隐私政策').click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Privacy Policy');
    document.querySelector<HTMLElement>('.resource-modal-overlay')?.click();

    findButton('Plugin Setup').click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Plugin Setup Guide');

    findButton('跳到 Storage').click();

    expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    expect(
      document.querySelector('[data-nav-panel="storage"]')?.classList.contains('is-active')
    ).toBe(true);
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'options_action_completed',
      params: {
        action: 'resource_open',
        outcome: 'completed',
        section: 'privacy'
      }
    });
    expect(messagingRepository.send).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
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
});
