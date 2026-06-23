import { DEFAULT_RUNTIME_MESSAGES, formatUserVisibleMessage, type Messages } from '@i18n';
import type {
  UserVisibleMessageDescriptor,
  UserVisibleMessageValues
} from '@shared/i18n/userVisibleMessageDescriptor';

export type DiagnosticSeverity = 'ok' | 'warning' | 'error' | 'info';
export type DiagnosticMessageKey = Extract<keyof Messages, string>;
export type DiagnosticMessage = UserVisibleMessageDescriptor<DiagnosticMessageKey>;

export interface DiagnosticLine {
  severity?: DiagnosticSeverity;
  message?: DiagnosticMessage;
  rawText?: string;
}

export interface DiagnosticSection {
  icon: string;
  title: DiagnosticMessage;
  lines: DiagnosticLine[];
  rawBlock?: string;
}

export interface DiagnosticReport {
  sections: DiagnosticSection[];
  footer?: DiagnosticMessage;
}

const SEVERITY_PREFIX: Record<DiagnosticSeverity, string> = {
  ok: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️'
};

const INLINE_STATUS_PREFIX = /^(✅|⚠️|❌|ℹ️)\s/u;

export function createDiagnosticMessage<Key extends DiagnosticMessageKey>(
  key: Key,
  values?: UserVisibleMessageValues
): UserVisibleMessageDescriptor<Key> {
  return values && Object.keys(values).length > 0 ? { key, values } : { key };
}

export function createDiagnosticLine(
  severity: DiagnosticSeverity,
  key: DiagnosticMessageKey,
  values?: UserVisibleMessageValues
): DiagnosticLine {
  return {
    severity,
    message: createDiagnosticMessage(key, values)
  };
}

export function resolveDiagnosticsMessages(messages?: Partial<Messages> | null): Messages {
  if (messages) {
    const mergedMessages: Messages = { ...DEFAULT_RUNTIME_MESSAGES, ...messages };
    return mergedMessages;
  }

  return DEFAULT_RUNTIME_MESSAGES;
}

export function formatDiagnosticMessage(message: DiagnosticMessage, messages: Messages): string {
  return formatUserVisibleMessage(message, messages, DEFAULT_RUNTIME_MESSAGES[message.key] ?? '');
}

export function renderDiagnosticLine(line: DiagnosticLine, messages: Messages): string {
  if (line.rawText !== undefined) {
    return line.rawText;
  }

  if (!line.message) {
    return '';
  }

  const text = formatDiagnosticMessage(line.message, messages);
  if (!line.severity || INLINE_STATUS_PREFIX.test(text)) {
    return text;
  }

  return `${SEVERITY_PREFIX[line.severity]} ${text}`;
}

function renderDiagnosticSection(section: DiagnosticSection, messages: Messages): string {
  let output = `\n${section.icon} ${formatDiagnosticMessage(section.title, messages)}:\n`;

  if (section.rawBlock !== undefined) {
    output += `${section.rawBlock}\n`;
  }

  for (const line of section.lines) {
    output += `${renderDiagnosticLine(line, messages)}\n`;
  }

  return output;
}

export function renderDiagnosticReport(report: DiagnosticReport, messages: Messages): string {
  let output = '';

  for (const section of report.sections) {
    output += renderDiagnosticSection(section, messages);
  }

  if (report.footer) {
    output += `\n${formatDiagnosticMessage(report.footer, messages)}\n`;
  }

  return output;
}
