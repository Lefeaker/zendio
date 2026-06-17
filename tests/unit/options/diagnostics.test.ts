/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessagesForLanguage, type Messages } from '@i18n';
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
const HAN_REGEX = /\p{Script=Han}/u;

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
const getOptionsMessagesMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock('../../../src/options/app/optionsControllerContext', () => ({
  getOptionsController: getOptionsControllerMock
}));
vi.mock('@options/app/i18nContext', () => ({ getOptionsMessages: getOptionsMessagesMock }));
vi.mock('@shared/di/serviceRegistry', () => ({
  resolveRepository: () => ({ get: repoGetMock, set: repoSetMock })
}));

async function createDiagnosticsMessages(
  overrides: Partial<Messages> = {},
  language = 'en'
): Promise<Messages> {
  return {
    ...(await getMessagesForLanguage(language)),
    ...overrides
  };
}

describe('diagnostics', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    getSnapshotMock.mockReset();
    loadRawMock.mockReset();
    saveSnapshotMock.mockReset();
    repoGetMock.mockReset();
    repoSetMock.mockReset();
    getOptionsControllerMock.mockReset();
    getOptionsMessagesMock.mockReset();
    saveSnapshotMock.mockResolvedValue({} as StoredOptions);
    repoGetMock.mockResolvedValue({} as CompleteOptions);
    repoSetMock.mockResolvedValue(undefined);
    getOptionsControllerMock.mockReturnValue({
      getSnapshot: getSnapshotMock,
      loadRaw: loadRawMock,
      saveSnapshot: saveSnapshotMock
    });
    getOptionsMessagesMock.mockResolvedValue(await createDiagnosticsMessages());
    vi.useRealTimers();
    document.body.innerHTML =
      '<div id="diagSection" style="display:none"></div><pre id="diagOutput"></pre>';
  });

  it('renders diagnostic output from controller snapshots', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsRunning: 'Running diagnostics sentinel...',
        diagnosticsRestUrlsMissing: 'HTTP/HTTPS URL sentinel',
        diagnosticsReadingUnknownExportMode: 'Unknown export mode sentinel: {mode}'
      })
    );
    const snapshot: StoredOptions = {
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
      video: { floatingPromptEnabled: false, promptButtonLabel: '', promptShortcut: '' }
    };
    Reflect.set(snapshot, 'readingSession', {
      exportMode: 'weird',
      highlightTheme: 'strange'
    });
    getSnapshotMock.mockReturnValue(snapshot);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput');
    expect(output?.textContent).toContain('Running diagnostics sentinel...');
    expect(output?.textContent).toContain('HTTP/HTTPS URL sentinel');
    expect(output?.textContent).toContain('Unknown export mode sentinel: weird');
    expect(output?.textContent).not.toMatch(HAN_REGEX);
    expect(document.getElementById('diagSection')?.style.display).toBe('block');
  });

  it('fixes configuration and persists via controller or repository', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsRepairSwitchedToHttps: 'Switched to HTTPS sentinel {port}',
        diagnosticsRepairAddedFragmentTemplate: 'Added fragment template sentinel',
        diagnosticsRepairUpdatedArticleTemplate: 'Updated article template sentinel',
        diagnosticsRepairSaved: 'Repair saved sentinel',
        diagnosticsRepairReloadHint: 'Reload hint sentinel'
      })
    );
    getSnapshotMock.mockReturnValue({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: LOCAL_HTTP_CONFLICT_URL, apiKey: 'key' },
      templates: { article: 'Clippings/{title}.md', fragment: '', ai: '' }
    } as unknown as StoredOptions);
    const { fixConfiguration } = await import('@options/components/diagnostics');
    await fixConfiguration();
    expect(saveSnapshotMock).toHaveBeenCalled();
    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('Switched to HTTPS sentinel 27124');
    expect(output).toContain('Added fragment template sentinel');
    expect(output).toContain('Updated article template sentinel');
    expect(output).toContain('Repair saved sentinel');
    expect(output).toContain('Reload hint sentinel');
    expect(output).not.toMatch(HAN_REGEX);
  });

  it('loads raw options when controller snapshot is empty and reports port conflicts', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsDomainMappingCount: 'Domain mapping sentinel: {count}',
        portConflictDetected: 'Port conflict: {ports}'
      })
    );
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
    expect(output).toContain('Domain mapping sentinel: 1');
    expect(output).not.toMatch(HAN_REGEX);
  });

  it('keeps missing placeholders unchanged in diagnostics port-conflict formatting', async () => {
    const { buildDiagnosticsReport } = await import('@options/components/diagnostics');
    const messages = await createDiagnosticsMessages({
      portConflictDetected: 'Port conflict: {ports} / {missing}'
    });

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
      messages
    );

    expect(report).toContain(`Port conflict: ${LOCAL_CONFLICT_PORT} / {missing}`);
  });

  it('renders zh-CN diagnostics text from the active catalog messages', async () => {
    const { buildDiagnosticsReport } = await import('@options/components/diagnostics');
    const zhMessages = await createDiagnosticsMessages(
      {
        diagnosticsDomainMappingCount: '目录映射哨兵：{count}'
      },
      'zh-CN'
    );

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
        domainMappings: { 'example.com': 'article' }
      } as unknown as StoredOptions,
      zhMessages
    );

    expect(report).toContain('目录映射哨兵：1');
  });

  it('falls back to repository get when controller is unavailable and surfaces complete diagnostic statuses', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsActiveVaultCount: 'Configured vaults sentinel: {count}',
        diagnosticsRoutingRuleCount: 'Routing rules sentinel: {count}',
        diagnosticsAiChatUserNameValue: 'User name sentinel: {userName}',
        diagnosticsFragmentContextLengthValue: 'Context length sentinel: {value}',
        diagnosticsFragmentModifierKeysValue: 'Modifier keys sentinel: {keys}',
        diagnosticsReadingExportFull: 'Full export sentinel',
        diagnosticsReadingThemeValue: 'Theme sentinel: {theme}',
        diagnosticsVideoFloatingPromptEnabled: 'Video prompt sentinel',
        diagnosticsPortConfigHealthy: 'Healthy ports sentinel'
      })
    );
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
    expect(output).toContain('Configured vaults sentinel: 1');
    expect(output).toContain('Routing rules sentinel: 1');
    expect(output).toContain('User name sentinel: Alice');
    expect(output).not.toContain('时间戳记录');
    expect(output).toContain('Context length sentinel: 120');
    expect(output).toContain('Modifier keys sentinel: alt + shift');
    expect(output).toContain('Full export sentinel');
    expect(output).toContain('Theme sentinel: purple');
    expect(output).toContain('Video prompt sentinel');
    expect(output).not.toContain('按钮文案');
    expect(output).not.toContain('快捷键');
    expect(output).toContain('Healthy ports sentinel');
    expect(output).not.toMatch(HAN_REGEX);
  });

  it('falls back to empty snapshot when repository loading throws', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsConfigNotFound: 'No config sentinel'
      })
    );
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockRejectedValueOnce(new Error('repo failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('No config sentinel');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns early for empty options and covers fragment and reading fallback branches', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsConfigNotFound: 'No config sentinel',
        diagnosticsFragmentContextLengthInvalid: 'Invalid context length sentinel',
        diagnosticsFragmentModifierDisabled: 'Modifier disabled sentinel',
        diagnosticsReadingExportHighlights: 'Highlights only sentinel',
        diagnosticsReadingThemeValue: 'Theme sentinel: {theme}'
      })
    );
    getSnapshotMock.mockReturnValueOnce(null);
    const { runDiagnostics } = await import('@options/components/diagnostics');
    await runDiagnostics();
    expect(document.getElementById('diagOutput')?.textContent).toContain('No config sentinel');

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
    expect(output).toContain('Invalid context length sentinel');
    expect(output).toContain('Modifier disabled sentinel');
    expect(output).toContain('Highlights only sentinel');
    expect(output).toContain('Theme sentinel: gradient');
    expect(output).not.toMatch(HAN_REGEX);
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
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsRepairSwitchedToHttp: 'Switched to HTTP sentinel {port}',
        diagnosticsRepairFailed: 'Repair failed sentinel: {reason}'
      })
    );
    getOptionsControllerMock.mockReturnValue(null);
    repoGetMock.mockResolvedValueOnce({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: 'https://localhost:27123', apiKey: 'key' },
      templates: { article: 'Clippings/{title}.md', fragment: '', ai: '' }
    } as unknown as CompleteOptions);
    repoSetMock.mockRejectedValueOnce(new Error('repo save failed'));
    const { fixConfiguration } = await import('../../../src/options/components/diagnostics');
    await fixConfiguration();

    const output = document.getElementById('diagOutput')?.textContent ?? '';
    expect(output).toContain('Switched to HTTP sentinel 27123');
    expect(output).toContain('Repair failed sentinel: repo save failed');
  });

  it('shows fix failure when snapshot saving rejects', async () => {
    getOptionsMessagesMock.mockResolvedValue(
      await createDiagnosticsMessages({
        diagnosticsRepairFailed: 'Repair failed sentinel: {reason}'
      })
    );
    getSnapshotMock.mockReturnValue({
      rest: { httpsUrl: '', httpUrl: '', baseUrl: 'https://localhost:27123', apiKey: 'key' },
      templates: { article: '', fragment: '', ai: '' }
    } as unknown as StoredOptions);
    saveSnapshotMock.mockRejectedValueOnce(new Error('save failed'));
    const { fixConfiguration } = await import('../../../src/options/components/diagnostics');
    await fixConfiguration();
    expect(document.getElementById('diagOutput')?.textContent).toContain(
      'Repair failed sentinel: save failed'
    );
  });
});
