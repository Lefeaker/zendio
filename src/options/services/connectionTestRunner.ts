import type { ConnectionTestResult } from '../../shared/types/connection';
import type { Messages } from '@i18n';
import { isAppError, normalizeToAppError } from '../../shared/errors';

export interface ConnectionTestRunnerConfig {
  /** 执行连接测试的函数 */
  exec: () => Promise<ConnectionTestResult>;
  /** 获取本地化消息的函数 */
  getMessages: () => Promise<Messages>;
  /** 测试前钩子 */
  onBeforeRun?: () => void | Promise<void>;
  /** 测试后钩子 */
  onAfterRun?: (result: ConnectionTestResult | undefined, error?: Error) => void | Promise<void>;
  /** 自定义结果渲染器 */
  renderResult?: (host: HTMLDivElement, type: ConnectionResultType, text: string) => void;
  /** 自定义结果重置逻辑 */
  resetResult?: (host: HTMLDivElement) => void;
}

export interface ConnectionTestElements {
  /** 测试按钮 */
  button: HTMLButtonElement;
  /** 结果显示容器 */
  result: HTMLDivElement;
}

/** 按钮状态类型 */
export type ButtonState = 'idle' | 'running' | 'done';

/** 按钮状态到 CSS 类的映射 */
const BUTTON_STATE_CLASSES: Record<ButtonState, string> = {
  idle: '',
  running: 'loading',
  done: 'completed'
};

/** 结果类型到 CSS 类的映射 */
const RESULT_TYPE_CLASSES = {
  info: 'aobx-connection-result rounded-md border border-accent/70 bg-accent/18 p-3 text-sm text-base-content flex gap-2 leading-relaxed items-start',
  success:
    'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-success)_65%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-success)_18%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-success)_80%,black)] flex gap-2 leading-relaxed items-start',
  error:
    'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-error)_70%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-error)_22%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-error)_80%,black)] flex gap-2 leading-relaxed items-start'
} as const;

export type ConnectionResultType = keyof typeof RESULT_TYPE_CLASSES;

/**
 * 运行连接测试并管理 UI 状态
 */
export async function runConnectionTest(
  config: ConnectionTestRunnerConfig,
  elements: ConnectionTestElements
): Promise<void> {
  const { exec, getMessages, onBeforeRun, onAfterRun } = config;
  const { button, result } = elements;
  const renderResult = config.renderResult ?? defaultRenderResult;

  const msgs = await getMessages();

  // 设置按钮为运行状态
  setButtonState(button, 'running');

  // 显示测试中状态
  renderResult(result, 'info', msgs.connectionTesting);

  let testResult: ConnectionTestResult | undefined;
  let testError: Error | undefined;

  try {
    // 执行测试前钩子
    await onBeforeRun?.();

    // 执行连接测试
    testResult = await exec();

    // 渲染测试结果
    const resultType = testResult.success ? 'success' : 'error';
    const resultText = renderConnectionResult(testResult, msgs);
    renderResult(result, resultType, resultText);
  } catch (error) {
    testError = error instanceof Error ? error : new Error(String(error));

    // 标准化错误处理
    const appError = isAppError(error)
      ? error
      : normalizeToAppError(error, {
          code: 'OPTIONS_CONNECTION_UNKNOWN_ERROR',
          domain: 'options',
          defaultMessage: msgs.connectionFailed,
          recoverable: false,
          context: { source: 'connection-test' }
        });

    const detail = appError.userMessage ?? appError.message;
    const effectiveReason =
      detail === msgs.connectionFailed && testError?.message ? testError.message : detail;
    renderResult(result, 'error', formatFailureMessage(effectiveReason, undefined, msgs));
  } finally {
    // 恢复按钮状态
    setButtonState(button, 'idle');

    // 执行测试后钩子
    if (testResult || testError) {
      await onAfterRun?.(testResult, testError);
    }
  }
}

/**
 * 设置按钮状态
 */
function setButtonState(button: HTMLButtonElement, state: ButtonState): void {
  // 更新 dataset.state
  button.dataset.state = state;

  // 更新 disabled 状态
  button.disabled = state === 'running';

  // 更新 CSS 类
  // 移除所有状态类
  Object.values(BUTTON_STATE_CLASSES).forEach((className) => {
    if (className) {
      button.classList.remove(className);
    }
  });

  // 添加当前状态类
  const stateClass = BUTTON_STATE_CLASSES[state];
  if (stateClass) {
    button.classList.add(stateClass);
  }
}

/**
 * 默认的结果渲染器
 */
function defaultRenderResult(
  result: HTMLDivElement,
  type: ConnectionResultType,
  text: string
): void {
  result.hidden = false;
  result.className = RESULT_TYPE_CLASSES[type];
  result.textContent = text;
}

/**
 * 渲染连接测试结果为统一格式的文本
 */
export function renderConnectionResult(response: ConnectionTestResult, msgs: Messages): string {
  if (response.success) {
    const customMessage = (response.message ?? '').trim();
    const hasAdditionalPayload =
      typeof response.status !== 'undefined' || typeof response.response !== 'undefined';
    if (customMessage && hasAdditionalPayload) {
      return customMessage;
    }
    return msgs.connectionSuccessShort;
  }

  const reason = extractFailureReason(response, msgs);
  return composeFailureOutput(reason, response.status, msgs);
}

/**
 * 隐藏测试结果
 */
export function hideResult(result: HTMLDivElement): void {
  result.hidden = true;
  result.textContent = '';
  result.className = RESULT_TYPE_CLASSES.info;
}

/**
 * 初始化连接测试元素的默认状态
 */
export function initializeConnectionTestElements(
  elements: ConnectionTestElements,
  resetResult?: (host: HTMLDivElement) => void
): void {
  const { button, result } = elements;

  setButtonState(button, 'idle');
  if (resetResult) {
    resetResult(result);
  } else {
    hideResult(result);
  }

  // 确保结果容器有 aria-live 属性
  if (!result.getAttribute('aria-live')) {
    result.setAttribute('aria-live', 'polite');
  }
}

function extractFailureReason(response: ConnectionTestResult, msgs: Messages): string {
  const raw = (response.error ?? response.message ?? '').trim();
  if (!raw) {
    return msgsFallbackFailure(msgs);
  }

  const firstLine = raw.split(/\n+/)[0]?.trim() ?? raw;
  return stripFailurePrefix(firstLine) || msgsFallbackFailure(msgs);
}

function formatFailureMessage(reason: string, status: number | undefined, msgs: Messages): string {
  const normalized = stripFailurePrefix(reason.trim());
  return composeFailureOutput(normalized || msgsFallbackFailure(msgs), status, msgs);
}

function composeFailureOutput(reason: string, status: number | undefined, msgs: Messages): string {
  const lines = [`${msgs.connectionFailed}: ${reason}`];
  const hints = buildFailureHints(reason, status, msgs);
  if (hints) {
    lines.push(`${msgs.connectionFailureHintsTitle}${hints}`);
  }
  return lines.join('\n');
}

function stripFailurePrefix(text: string): string {
  const trimmed = text.trim();
  const patterns = [/^连接失败[:：]?\s*/i, /^connection failed[:：]?\s*/i];
  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, '').trim();
    }
  }
  return trimmed;
}

function buildFailureHints(reason: string, status: number | undefined, msgs: Messages): string {
  const hints = new Set<string>();
  const lower = reason.toLowerCase();

  if (status === 401 || /401|unauthorized|api key/i.test(lower)) {
    hints.add(msgs.connectionFailureHintCheckApiKey);
  }

  if (status === 404 || /404|not found|vault/i.test(lower)) {
    hints.add(msgs.connectionFailureHintCheckVault);
  }

  if (
    /failed to fetch|networkerror|timeout|refused|reset|unreachable|无法连接|未配置可用的地址|未配置 api key/i.test(
      lower
    )
  ) {
    hints.add(msgs.connectionFailureHintCheckService);
  }

  if (hints.size === 0) {
    hints.add(msgs.connectionFailureHintGeneric);
  }

  return Array.from(hints).join('；');
}

function msgsFallbackFailure(msgs: Messages): string {
  return msgs.connectionFailed;
}
