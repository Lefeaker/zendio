/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runConnectionTest,
  renderConnectionResult,
  initializeConnectionTestElements,
  hideResult,
  type ConnectionTestRunnerConfig,
  type ConnectionTestElements
} from '@options/services/connectionTestRunner';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { Messages } from '../../../src/i18n';

describe('connectionTestRunner', () => {
  let mockButton: HTMLButtonElement;
  let mockResult: HTMLDivElement;
  let mockMessages: Messages;
  let elements: ConnectionTestElements;

  beforeEach(() => {
    // 创建模拟的 DOM 元素
    mockButton = document.createElement('button');
    mockResult = document.createElement('div');

    elements = {
      button: mockButton,
      result: mockResult
    };

    // 模拟消息对象
    mockMessages = {
      connectionTesting: '正在测试连接...',
      connectionFailed: '连接失败',
      connectionSuccessShort: '连接成功',
      connectionResultHeaderSuccess: '连接成功',
      connectionResultHeaderFailure: '连接失败',
      connectionChannelLine: '{channel}：{message}',
      connectionChannelLocalFolderLabel: '本地目录',
      connectionChannelRestLabel: 'REST API',
      connectionRestSuccess: '连接成功（HTTP {status}）',
      connectionRestApiKeyMissing: 'API Key 未配置',
      connectionLocalFolderSkipped: '未配置，已跳过。',
      connectionFailureHintsTitle: '处理建议：',
      connectionFailureHintCheckApiKey: '请检查 API Key 是否正确',
      connectionFailureHintCheckVault: '请确认 Vault 名称与 Obsidian 设置一致',
      connectionFailureHintCheckService: '请确认 Obsidian Local REST API 插件已启动',
      connectionFailureHintGeneric: '请尝试重新启动服务'
    } as Messages;
  });

  describe('runConnectionTest', () => {
    it('handles successful connection test', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        success: true,
        message: '连接成功',
        status: 200,
        response: 'OK'
      } as ConnectionTestResult);

      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);
      const onBeforeRun = vi.fn();
      const onAfterRun = vi.fn();

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages,
        onBeforeRun,
        onAfterRun
      };

      await runConnectionTest(config, elements);

      // 验证按钮状态变化
      expect(mockButton.dataset.state).toBe('idle');
      expect(mockButton.disabled).toBe(false);

      // 验证结果显示
      expect(mockResult.hidden).toBe(false);
      expect(mockResult.className).toBe(
        'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-success)_65%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-success)_18%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-success)_80%,black)] flex gap-2 leading-relaxed items-start'
      );
      expect(mockResult.textContent).toBe('连接成功');

      // 验证钩子被调用
      expect(onBeforeRun).toHaveBeenCalledOnce();
      expect(onAfterRun).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        undefined
      );
    });

    it('handles failed connection test', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        success: false,
        message: '连接失败',
        status: 500,
        error: 'Internal Server Error'
      } as ConnectionTestResult);

      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages
      };

      await runConnectionTest(config, elements);

      // 验证按钮状态
      expect(mockButton.dataset.state).toBe('idle');
      expect(mockButton.disabled).toBe(false);

      // 验证错误结果显示
      expect(mockResult.hidden).toBe(false);
      expect(mockResult.className).toBe(
        'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-error)_70%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-error)_22%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-error)_80%,black)] flex gap-2 leading-relaxed items-start'
      );
      expect(mockResult.textContent).toContain('连接失败: Internal Server Error');
      expect(mockResult.textContent).toContain('处理建议：请尝试重新启动服务');
    });

    it('handles exception during test execution', async () => {
      const testError = new Error('网络错误');
      const mockExec = vi.fn().mockRejectedValue(testError);
      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);
      const onAfterRun = vi.fn();

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages,
        onAfterRun
      };

      await runConnectionTest(config, elements);

      // 验证按钮状态恢复
      expect(mockButton.dataset.state).toBe('idle');
      expect(mockButton.disabled).toBe(false);

      // 验证异常结果显示
      expect(mockResult.hidden).toBe(false);
      expect(mockResult.className).toBe(
        'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-error)_70%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-error)_22%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-error)_80%,black)] flex gap-2 leading-relaxed items-start'
      );
      expect(mockResult.textContent).toContain('连接失败');
      expect(mockResult.textContent).toContain('处理建议：请尝试重新启动服务');

      // 验证错误钩子被调用
      expect(onAfterRun).toHaveBeenCalledWith(undefined, testError);
    });

    it('sets button to running state during test', async () => {
      let buttonStateWhenRunning: string | undefined;
      let buttonDisabledWhenRunning: boolean | undefined;

      const mockExec = vi.fn().mockImplementation(() => {
        // 在测试执行期间检查按钮状态
        buttonStateWhenRunning = mockButton.dataset.state;
        buttonDisabledWhenRunning = mockButton.disabled;

        return Promise.resolve({
          success: true,
          message: '成功'
        } as ConnectionTestResult);
      });

      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages
      };

      await runConnectionTest(config, elements);

      // 验证测试期间按钮状态
      expect(buttonStateWhenRunning).toBe('running');
      expect(buttonDisabledWhenRunning).toBe(true);
    });

    it('shows testing message during execution', async () => {
      let resultTextWhenRunning: string | undefined;
      let resultClassWhenRunning: string | undefined;

      const mockExec = vi.fn().mockImplementation(() => {
        // 在测试执行期间检查结果显示
        resultTextWhenRunning = mockResult.textContent;
        resultClassWhenRunning = mockResult.className;

        return Promise.resolve({
          success: true,
          message: '成功'
        } as ConnectionTestResult);
      });

      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages
      };

      await runConnectionTest(config, elements);

      // 验证测试期间显示测试中消息
      expect(resultTextWhenRunning).toBe('正在测试连接...');
      expect(resultClassWhenRunning).toBe(
        'aobx-connection-result rounded-md border border-accent/70 bg-accent/18 p-3 text-sm text-base-content flex gap-2 leading-relaxed items-start'
      );
    });

    it('supports custom result renderer', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        success: true,
        message: '连接成功'
      } as ConnectionTestResult);

      const mockGetMessages = vi.fn().mockResolvedValue(mockMessages);
      const customRenderer = vi.fn();

      const config: ConnectionTestRunnerConfig = {
        exec: mockExec,
        getMessages: mockGetMessages,
        renderResult: customRenderer
      };

      await runConnectionTest(config, elements);

      expect(customRenderer).toHaveBeenCalledWith(mockResult, 'info', '正在测试连接...');
      expect(customRenderer).toHaveBeenCalledWith(mockResult, 'success', '连接成功');
    });
  });

  describe('renderConnectionResult', () => {
    it('formats successful result with all details', () => {
      const result: ConnectionTestResult = {
        success: true,
        message: '连接成功',
        messageDescriptor: {
          key: 'connectionRestSuccess',
          values: { status: 200 },
          fallback: 'Connection successful (HTTP 200)'
        },
        status: 200,
        response: 'pong'
      };

      const formatted = renderConnectionResult(result, mockMessages);

      expect(formatted).toBe('连接成功（HTTP 200）');
    });

    it('formats failed result with error details', () => {
      const result: ConnectionTestResult = {
        success: false,
        message: '连接失败',
        messageDescriptor: {
          key: 'connectionResultHeaderFailure',
          fallback: 'Connection failed'
        },
        status: 500,
        error: 'Server Error',
        errorDescriptor: {
          key: 'connectionRestApiKeyMissing',
          fallback: 'API Key is missing'
        },
        channels: [
          {
            channel: 'localFolder',
            label: 'Local Folder',
            labelDescriptor: {
              key: 'connectionChannelLocalFolderLabel',
              fallback: 'Local Folder'
            },
            configured: false,
            success: false,
            message: 'Not configured, skipped.',
            messageDescriptor: {
              key: 'connectionLocalFolderSkipped',
              fallback: 'Not configured, skipped.'
            }
          },
          {
            channel: 'https',
            label: 'REST API',
            labelDescriptor: {
              key: 'connectionChannelRestLabel',
              fallback: 'REST API'
            },
            configured: true,
            success: false,
            message: 'API Key is missing',
            messageDescriptor: {
              key: 'connectionRestApiKeyMissing',
              fallback: 'API Key is missing'
            }
          }
        ]
      };

      const formatted = renderConnectionResult(result, mockMessages);

      expect(formatted).toBe(
        '连接失败\n本地目录：未配置，已跳过。\nREST API (HTTPS)：API Key 未配置'
      );
    });

    it('handles minimal result with only message', () => {
      const result: ConnectionTestResult = {
        success: true,
        message: '基本成功'
      };

      const formatted = renderConnectionResult(result, mockMessages);

      expect(formatted).toBe('连接成功');
    });
  });

  describe('initializeConnectionTestElements', () => {
    it('sets initial button and result states', () => {
      initializeConnectionTestElements(elements);

      expect(mockButton.dataset.state).toBe('idle');
      expect(mockButton.disabled).toBe(false);
      expect(mockResult.hidden).toBe(true);
      expect(mockResult.textContent).toBe('');
      expect(mockResult.className).toBe(
        'aobx-connection-result rounded-md border border-accent/70 bg-accent/18 p-3 text-sm text-base-content flex gap-2 leading-relaxed items-start'
      );
      expect(mockResult.getAttribute('aria-live')).toBe('polite');
    });

    it('preserves existing aria-live attribute', () => {
      mockResult.setAttribute('aria-live', 'assertive');

      initializeConnectionTestElements(elements);

      expect(mockResult.getAttribute('aria-live')).toBe('assertive');
    });

    it('uses custom reset callback when provided', () => {
      const reset = vi.fn();
      initializeConnectionTestElements(elements, reset);
      expect(reset).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('hideResult', () => {
    it('hides result and resets content', () => {
      mockResult.hidden = false;
      mockResult.textContent = '之前的内容';
      mockResult.className = 'aobx-connection-result aobx-alert aobx-alert--success';

      hideResult(mockResult);

      expect(mockResult.hidden).toBe(true);
      expect(mockResult.textContent).toBe('');
      expect(mockResult.className).toBe(
        'aobx-connection-result rounded-md border border-accent/70 bg-accent/18 p-3 text-sm text-base-content flex gap-2 leading-relaxed items-start'
      );
    });
  });
});
