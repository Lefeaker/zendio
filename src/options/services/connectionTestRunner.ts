import type { ConnectionTestResult } from '../../shared/types/connection';
import type { Messages } from '@i18n';
import { isAppError, normalizeToAppError } from '../../shared/errors';
import { formatUserVisibleMessage } from '../../i18n/userVisibleMessageFormatter';

export interface ConnectionTestRunnerConfig {
  exec: () => Promise<ConnectionTestResult>;
  getMessages: () => Promise<Messages>;
  onBeforeRun?: () => void | Promise<void>;
  onAfterRun?: (result: ConnectionTestResult | undefined, error?: Error) => void | Promise<void>;
  renderResult?: (host: HTMLDivElement, type: ConnectionResultType, text: string) => void;
  resetResult?: (host: HTMLDivElement) => void;
}

export interface ConnectionTestElements {
  button: HTMLButtonElement;
  result: HTMLDivElement;
}

export type ButtonState = 'idle' | 'running' | 'done';

const BUTTON_STATE_CLASSES: Record<ButtonState, string> = {
  idle: '',
  running: 'loading',
  done: 'completed'
};

const RESULT_TYPE_CLASSES = {
  info: 'aobx-connection-result rounded-md border border-accent/70 bg-accent/18 p-3 text-sm text-base-content flex gap-2 leading-relaxed items-start',
  success:
    'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-success)_65%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-success)_18%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-success)_80%,black)] flex gap-2 leading-relaxed items-start',
  error:
    'aobx-connection-result rounded-md border border-[color:color-mix(in_srgb,var(--aobx-status-error)_70%,var(--aobx-border))] bg-[color:color-mix(in_srgb,var(--aobx-status-error)_22%,transparent)] p-3 text-sm text-[color:color-mix(in_srgb,var(--aobx-status-error)_80%,black)] flex gap-2 leading-relaxed items-start'
} as const;

export type ConnectionResultType = keyof typeof RESULT_TYPE_CLASSES;

export async function runConnectionTest(
  config: ConnectionTestRunnerConfig,
  elements: ConnectionTestElements
): Promise<void> {
  const { exec, getMessages, onBeforeRun, onAfterRun } = config;
  const { button, result } = elements;
  const renderResult = config.renderResult ?? defaultRenderResult;

  const msgs = await getMessages();

  setButtonState(button, 'running');

  renderResult(result, 'info', msgs.connectionTesting);

  let testResult: ConnectionTestResult | undefined;
  let testError: Error | undefined;

  try {
    await onBeforeRun?.();

    testResult = await exec();

    const resultType = testResult.success ? 'success' : 'error';
    const resultText = renderConnectionResult(testResult, msgs);
    renderResult(result, resultType, resultText);
  } catch (error) {
    testError = error instanceof Error ? error : new Error(String(error));

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
    setButtonState(button, 'idle');

    if (testResult || testError) {
      await onAfterRun?.(testResult, testError);
    }
  }
}

function setButtonState(button: HTMLButtonElement, state: ButtonState): void {
  button.dataset.state = state;

  button.disabled = state === 'running';

  Object.values(BUTTON_STATE_CLASSES).forEach((className) => {
    if (className) {
      button.classList.remove(className);
    }
  });

  const stateClass = BUTTON_STATE_CLASSES[state];
  if (stateClass) {
    button.classList.add(stateClass);
  }
}

function defaultRenderResult(
  result: HTMLDivElement,
  type: ConnectionResultType,
  text: string
): void {
  result.hidden = false;
  result.className = RESULT_TYPE_CLASSES[type];
  result.textContent = text;
}

export function renderConnectionResult(response: ConnectionTestResult, msgs: Messages): string {
  if (response.channels?.length) {
    return renderChannelSummary(response, msgs);
  }

  if (response.success) {
    const resolvedMessage = resolveMessageDescriptor(
      response.messageDescriptor,
      response.message,
      msgs
    );
    const customMessage = resolvedMessage.trim();
    const hasAdditionalPayload =
      typeof response.status !== 'undefined' || typeof response.response !== 'undefined';
    if (customMessage && hasAdditionalPayload) {
      return customMessage;
    }
    if (response.messageDescriptor && customMessage) {
      return customMessage;
    }
    return msgs.connectionSuccessShort;
  }

  const reason = extractFailureReason(response, msgs);
  return composeFailureOutput(reason, response.status, msgs);
}

export function hideResult(result: HTMLDivElement): void {
  result.hidden = true;
  result.textContent = '';
  result.className = RESULT_TYPE_CLASSES.info;
}

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

  if (!result.getAttribute('aria-live')) {
    result.setAttribute('aria-live', 'polite');
  }
}

function extractFailureReason(response: ConnectionTestResult, msgs: Messages): string {
  const descriptorText = resolveMessageDescriptor(
    response.errorDescriptor,
    undefined,
    msgs,
    response.error
  ).trim();
  if (descriptorText) {
    return descriptorText;
  }

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
  const patterns = [/^connection failed[:：]?\s*/i];
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
    /failed to fetch|networkerror|timeout|refused|reset|unreachable|api_key_missing|no_usable_address|network_error/i.test(
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

function renderChannelSummary(response: ConnectionTestResult, msgs: Messages): string {
  const header = resolveResultHeader(response, msgs);
  const channelTemplate = msgs.connectionChannelLine || '{channel}: {message}';
  const lines = response.channels?.map((channel) => {
    const label = resolveChannelLabel(channel, msgs);
    const message = resolveChannelMessage(channel, msgs);
    return channelTemplate.replace('{channel}', label).replace('{message}', message);
  });

  return [header, ...(lines ?? [])].filter((line) => line && line.trim().length > 0).join('\n');
}

function resolveResultHeader(response: ConnectionTestResult, msgs: Messages): string {
  const resolved = response.messageDescriptor
    ? resolveMessageDescriptor(response.messageDescriptor, undefined, msgs).trim()
    : '';
  if (resolved) {
    return resolved;
  }

  return response.success ? msgs.connectionSuccessShort : msgs.connectionFailed;
}

function resolveChannelLabel(
  channel: NonNullable<ConnectionTestResult['channels']>[number],
  msgs: Messages
): string {
  const resolved = channel.labelDescriptor
    ? resolveMessageDescriptor(channel.labelDescriptor, undefined, msgs).trim()
    : '';
  if (channel.channel === 'localFolder') {
    return resolved || msgs.connectionChannelLocalFolderLabel || channel.channel;
  }

  const restLabel = resolved || msgs.connectionChannelRestLabel || 'rest';
  return `${restLabel} (${channel.channel.toUpperCase()})`;
}

function resolveChannelMessage(
  channel: NonNullable<ConnectionTestResult['channels']>[number],
  msgs: Messages
): string {
  if (channel.messageDescriptor) {
    const resolved = resolveMessageDescriptor(channel.messageDescriptor, undefined, msgs).trim();
    if (resolved) {
      return resolved;
    }
  }

  if (channel.error?.trim()) {
    return channel.error.trim();
  }

  if (channel.channel === 'localFolder' && !channel.configured) {
    return msgs.connectionLocalFolderSkipped || msgs.connectionFailed;
  }

  if (!channel.configured) {
    return msgs.connectionFailed;
  }

  return channel.success ? msgs.connectionSuccessShort : msgs.connectionFailed;
}

function resolveMessageDescriptor(
  descriptor: ConnectionTestResult['messageDescriptor'],
  legacy: string | undefined,
  msgs: Messages,
  fallback?: string
): string {
  return formatUserVisibleMessage(descriptor, msgs, fallback ?? legacy ?? '');
}
