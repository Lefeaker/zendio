/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '../../../src/shared/types/options';
import type { OptionsController } from '../../../src/options/app/optionsController';
import type { IOptionsRepository } from '../../../src/shared/repositories';
import { getRestDefaults } from '../../utils/restDefaults';

type DiagnosticsController = Pick<OptionsController, 'getSnapshot' | 'loadRaw' | 'saveSnapshot'>;
const REST_DEFAULTS = getRestDefaults();
const LOCAL_HTTPS_URL = `https://localhost:${REST_DEFAULTS.httpsPort}`;
const LOCAL_HTTP_URL = `http://localhost:${REST_DEFAULTS.httpPort}`;
const LOCAL_HTTP_CONFLICT_URL = `http://localhost:${REST_DEFAULTS.httpsPort}`;
const LOCAL_CONFLICT_PORT = String(REST_DEFAULTS.httpsPort);

const getSnapshotMock = vi.hoisted(() =>
  vi.fn<(...args: []) => ReturnType<DiagnosticsController['getSnapshot']>>(() => null)
);
const loadRawMock = vi.hoisted(() =>
  vi.fn<(...args: []) => ReturnType<DiagnosticsController['loadRaw']>>(() => Promise.resolve({}))
);
const saveSnapshotMock = vi.hoisted(() =>
  vi.fn<
    (
      ...args: Parameters<DiagnosticsController['saveSnapshot']>
    ) => ReturnType<DiagnosticsController['saveSnapshot']>
  >(() => Promise.resolve({} as StoredOptions))
);
const repoGetMock = vi.hoisted(() =>
  vi.fn<(...args: Parameters<IOptionsRepository['get']>) => ReturnType<IOptionsRepository['get']>>(
    () => Promise.resolve({} as CompleteOptions)
  )
);
const repoSetMock = vi.hoisted(() =>
  vi.fn<(...args: Parameters<IOptionsRepository['set']>) => ReturnType<IOptionsRepository['set']>>(
    () => Promise.resolve(undefined)
  )
);
const getOptionsControllerMock = vi.hoisted(() =>
  vi.fn<(...args: []) => DiagnosticsController | null>(() => ({
    getSnapshot: getSnapshotMock,
    loadRaw: loadRawMock,
    saveSnapshot: saveSnapshotMock
  }))
);
const getOptionsMessagesMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ portConflictDetected: 'Port conflict: {ports}' }))
);

vi.mock('../../../src/options/app/optionsControllerContext', () => ({
  getOptionsController: getOptionsControllerMock
}));
vi.mock('@options/app/i18nContext', () => ({ getOptionsMessages: getOptionsMessagesMock }));
vi.mock('@shared/di/serviceRegistry', () => ({
  resolveRepository: () => ({ get: repoGetMock, set: repoSetMock })
}));

describe('diagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSnapshotMock.mockReset();
    loadRawMock.mockReset();
    saveSnapshotMock.mockReset();
    repoGetMock.mockReset();
    repoSetMock.mockReset();
    getOptionsControllerMock.mockReset();
    saveSnapshotMock.mockResolvedValue({} as StoredOptions);
    repoGetMock.mockResolvedValue({} as CompleteOptions);
    repoSetMock.mockResolvedValue(undefined);
    getOptionsControllerMock.mockReturnValue({
      getSnapshot: getSnapshotMock,
      loadRaw: loadRawMock,
      saveSnapshot: saveSnapshotMock
    });
    vi.useRealTimers();
    document.body.innerHTML =
      '<div id="diagSection" style="display:none"></div><pre id="diagOutput"></pre>';
  });

  it('renders diagnostic output from controller snapshots', async () => {
    getSnapshotMock.mockReturnValue({
      rest: { httpsUrl: '', httpUrl: '', apiKey: '' },
      templates: { article: '', fragment: '', ai: '' },
      vaultRouter: { vaults: [], rules: [] },
      domainMappings: {},
      aiChat: { userName: ' ', includeTimestamps: false },
      fragmentClipper: {
        useFootnoteFormat: true,
        captureContext: false,
        contextLength: 10,
        selectionModifierEnabled: true,
        selectionModifierKeys: []
      },
      readingSession: { exportMode: 'weird', highlightTheme: 'strange' },
      video: { floatingPromptEnabled: false, promptButtonLabel: '', promptShortcut: '' }
    } as unknown as StoredOptions);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput');
    expect(output?.textContent).toContain('未配置 HTTP/HTTPS URL');
    expect(output?.textContent).toContain('未知导出模式');
    expect(document.getElementById('diagSection')?.style.display).toBe('block');
  });

  it('fixes configuration and persists via controller or repository', async () => {
    getSnapshotMock.mockReturnValue({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: LOCAL_HTTP_CONFLICT_URL, apiKey: 'key' },
      templates: { article: 'Clippings/{title}.md', fragment: '', ai: '' }
    } as unknown as StoredOptions);
    const { fixConfiguration } = await import('@options/components/diagnostics');
    await fixConfiguration();
    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(document.getElementById('diagOutput')?.textContent).toContain('配置已修复并保存');
  });

  it('loads raw options when controller snapshot is empty and reports port conflicts', async () => {
    getSnapshotMock.mockReturnValue({} as StoredOptions);
    loadRawMock.mockResolvedValue({
      rest: {
        httpsUrl: LOCAL_HTTPS_URL,
        httpUrl: LOCAL_HTTP_URL,
        apiKey: 'key'
      },
      templates: {
        article: 'Articles/{title}.md',
        fragment: 'Fragments/{title}.md',
        ai: 'AI/{title}.md'
      },
      vaultRouter: {
        vaults: [
          {
            id: 'v1',
            name: 'One',
            enabled: true,
            httpsUrl: LOCAL_HTTPS_URL,
            apiKey: 'k1'
          },
          { id: 'v2', name: 'Two', enabled: true, httpUrl: LOCAL_HTTP_CONFLICT_URL, apiKey: 'k2' }
        ],
        rules: []
      },
      domainMappings: { 'example.com': 'article' }
    } as unknown as StoredOptions);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(loadRawMock).toHaveBeenCalled();
    expect(output).toContain(`Port conflict: ${LOCAL_CONFLICT_PORT}`);
    expect(output).toContain('映射条目数量: 1');
  });

  it('keeps missing placeholders unchanged in diagnostics port-conflict formatting', async () => {
    const { buildDiagnosticsReport } = await import('@options/components/diagnostics');

    const report = buildDiagnosticsReport(
      {
        rest: {
          httpsUrl: LOCAL_HTTPS_URL,
          httpUrl: LOCAL_HTTP_URL,
          apiKey: 'key'
        },
        templates: {
          article: 'Articles/{title}.md',
          fragment: 'Fragments/{title}.md',
          ai: 'AI/{title}.md'
        },
        vaultRouter: {
          vaults: [
            {
              id: 'v1',
              name: 'One',
              enabled: true,
              httpsUrl: LOCAL_HTTPS_URL,
              apiKey: 'k1'
            },
            { id: 'v2', name: 'Two', enabled: true, httpUrl: LOCAL_HTTP_CONFLICT_URL, apiKey: 'k2' }
          ],
          rules: []
        }
      } as unknown as StoredOptions,
      { portConflictDetected: 'Port conflict: {ports} / {missing}' }
    );

    expect(report).toContain(`Port conflict: ${LOCAL_CONFLICT_PORT} / {missing}`);
  });

  it('falls back to repository get when controller is unavailable and surfaces complete diagnostic statuses', async () => {
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockResolvedValueOnce({
      rest: {
        httpsUrl: LOCAL_HTTPS_URL,
        httpUrl: LOCAL_HTTP_URL,
        apiKey: 'key'
      },
      templates: {
        article: 'Articles/{title}.md',
        fragment: 'Fragments/{title}.md',
        ai: 'AI/{title}.md'
      },
      vaultRouter: {
        vaults: [
          {
            id: 'v1',
            name: 'One',
            enabled: true,
            rules: [
              {
                id: 'r1',
                vaultId: 'v1',
                type: 'domain',
                pattern: 'one.com',
                enabled: true,
                priority: 1
              }
            ]
          }
        ],
        rules: []
      },
      domainMappings: { 'example.com': 'article' },
      aiChat: { userName: 'Alice', includeTimestamps: true },
      fragmentClipper: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: 120,
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt', 'shift']
      },
      readingSession: { exportMode: 'full', highlightTheme: 'purple' },
      video: { floatingPromptEnabled: true, promptButtonLabel: 'Clip', promptShortcut: 'K' }
    } as unknown as CompleteOptions);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(repoGetMock).toHaveBeenCalledTimes(1);
    expect(output).toContain('✅ 启用的仓库数量: 1');
    expect(output).toContain('✅ 路由规则数量: 1');
    expect(output).toContain('✅ 用户名称: Alice');
    expect(output).not.toContain('时间戳记录');
    expect(output).toContain('✅ 上下文长度: 120');
    expect(output).toContain('✅ 辅助键触发: alt + shift');
    expect(output).toContain('✅ 导出全文，并保留高亮标注');
    expect(output).toContain('✅ 高亮主题: purple');
    expect(output).toContain('✅ 已启用视频笔记按钮，可在视频网站控制栏快速开启笔记模式');
    expect(output).not.toContain('按钮文案');
    expect(output).not.toContain('快捷键');
    expect(output).toContain('✅ 仓库端口配置正常');
  });

  it('falls back to empty snapshot when repository loading throws', async () => {
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockRejectedValueOnce(new Error('repo failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('❌ 未找到配置');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns early for empty options and covers fragment and reading fallback branches', async () => {
    getSnapshotMock.mockReturnValueOnce(null);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();
    expect(document.getElementById('diagOutput')?.textContent).toContain('未找到配置');

    getSnapshotMock.mockReturnValueOnce({
      rest: {
        httpsUrl: LOCAL_HTTPS_URL,
        httpUrl: LOCAL_HTTP_URL,
        apiKey: 'key'
      },
      templates: { article: 'A', fragment: 'F', ai: 'I' },
      fragmentClipper: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: -1,
        selectionModifierEnabled: false,
        selectionModifierKeys: []
      },
      readingSession: { exportMode: 'highlights', highlightTheme: 'gradient' }
    } as unknown as StoredOptions);
    await runDiagnostics();
    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('❌ 上下文长度配置异常，应为正整数');
    expect(output).toContain('ℹ️ 未启用辅助键触发操作');
    expect(output).toContain('ℹ️ 仅导出高亮片段');
    expect(output).toContain('✅ 高亮主题: gradient');
  });

  it('uses repository set and reruns diagnostics after fix callback', async () => {
    vi.useFakeTimers();
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockResolvedValue({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: 'https://localhost:27123', apiKey: 'key' },
      templates: { article: '', fragment: '', ai: '' }
    } as unknown as CompleteOptions);
    const onAfterFix = vi.fn().mockResolvedValue(undefined);
    const { fixConfiguration } = await import('@options/components/diagnostics');
    await fixConfiguration(onAfterFix);

    expect(repoSetMock).toHaveBeenCalledTimes(1);
    const payload = (repoSetMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(payload).toBeTruthy();
    const templates = payload.templates as Record<string, string>;
    expect(templates.fragment).toBeTruthy();
    expect(templates.ai).toBeTruthy();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onAfterFix).toHaveBeenCalledTimes(1);
    expect(repoGetMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('uses repository set failure path and covers https-to-http port fix', async () => {
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockResolvedValueOnce({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: 'https://localhost:27123', apiKey: 'key' },
      templates: { article: 'Clippings/{title}.md', fragment: '', ai: '' }
    } as unknown as CompleteOptions);
    repoSetMock.mockRejectedValueOnce(new Error('repo save failed'));
    const { fixConfiguration } = await import('../../../src/options/components/diagnostics');
    await fixConfiguration();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('HTTPS://...27123 改为 HTTP://...27123');
    expect(output).toContain('修复失败: repo save failed');
  });

  it('shows fix failure when snapshot saving rejects', async () => {
    getSnapshotMock.mockReturnValue({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: 'https://localhost:27123', apiKey: 'key' },
      templates: { article: '', fragment: '', ai: '' }
    } as unknown as StoredOptions);
    saveSnapshotMock.mockRejectedValueOnce(new Error('save failed'));
    const { fixConfiguration } = await import('../../../src/options/components/diagnostics');
    await fixConfiguration();
    expect(document.getElementById('diagOutput')?.textContent).toContain('修复失败: save failed');
  });
});
