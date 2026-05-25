/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsMocks,
  asOptionsController,
  createController,
  createMessaging,
  createRepository,
  createStorage,
  findButton,
  findCheckboxInText,
  findInputByValue,
  flushPromises,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { StorageService } from '@platform/interfaces/storage';
import type { CompleteOptions } from './productionStitchShell.helpers';

describe('mountProductionStitchShell actions', () => {
  beforeEach(setupProductionStitchShellTest);

  it('runs real maintenance actions for copy, diagnostics, and reload', async () => {
    const reloaded = mergeOptions({ aiChat: { userName: 'Reloaded' } }) as CompleteOptions;
    const loadRaw = vi.fn(() => Promise.resolve(reloaded));
    const controller = {
      ...createController(),
      loadRaw
    };
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    mountProductionStitchShell({
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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

  it('runs the full production diagnostics report instead of a simplified JSON dump', () => {
    const controller = createController();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
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
      controller: asOptionsController(controller),
      initialOptions: { aiChat: { userName: 'Before' } },
      messages: null,
      language: 'en'
    });

    findButton('导入并保存').click();
    await flushPromises();

    expect(vi.mocked(controller.applyImportedConfig)).toHaveBeenCalledWith(
      expect.objectContaining({
        aiChat: expect.objectContaining({ userName: 'Imported' }) as unknown
      })
    );
  });

  it('repairs configuration using the existing production repair rules', async () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
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
        rest: expect.objectContaining({ baseUrl: 'https://localhost:27124' }) as unknown
      }) as unknown
    });
  });
});
