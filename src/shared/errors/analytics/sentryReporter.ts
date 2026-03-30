import { getService } from '../../di';
import { TOKENS } from '../../di/tokens';
import { ErrorSeverity, type AppError, type ErrorReporter } from '../types';
import { sanitizeErrorForAnalytics } from './dataSanitizer';

export interface SentryReporterConfig {
  dsn: string;
  enabled: boolean;
  environment?: string;
  release?: string;
}

interface ParsedDsn {
  endpoint: string;
  projectId: string;
}

interface SentryEventPayload {
  event_id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'fatal';
  platform: 'javascript';
  environment?: string;
  release?: string;
  message: {
    formatted: string;
  };
  tags: Record<string, string>;
  extra?: Record<string, unknown>;
  exception: {
    values: Array<{
      type: string;
      value: string;
    }>;
  };
}

interface ManifestVersionReader {
  runtime: {
    getManifest?: () => { version?: string } | undefined;
  };
}

function parseDsn(dsn: string): ParsedDsn {
  const url = new URL(dsn);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const projectId = pathSegments.at(-1);
  if (!projectId) {
    throw new Error('Invalid Sentry DSN: missing project id');
  }

  const basePath = pathSegments.slice(0, -1).join('/');
  const endpointPath = basePath
    ? `/${basePath}/api/${projectId}/envelope/`
    : `/api/${projectId}/envelope/`;

  return {
    endpoint: `${url.protocol}//${url.host}${endpointPath}`,
    projectId
  };
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`
    .padEnd(32, '0')
    .slice(0, 32);
}

function mapSeverity(severity: AppError['severity']): SentryEventPayload['level'] {
  switch (severity) {
    case ErrorSeverity.INFO:
      return 'info';
    case ErrorSeverity.WARNING:
      return 'warning';
    case ErrorSeverity.CRITICAL:
      return 'fatal';
    case ErrorSeverity.ERROR:
    default:
      return 'error';
  }
}

function resolveExtensionVersion(): string | undefined {
  try {
    const platform = getService<ManifestVersionReader>(TOKENS.platformServices);
    return platform.runtime.getManifest?.()?.version;
  } catch {
    return undefined;
  }
}

export class SentryErrorReporter implements ErrorReporter {
  private readonly parsedDsn: ParsedDsn;
  private readonly extensionVersion: string | undefined;

  constructor(private readonly config: SentryReporterConfig) {
    this.parsedDsn = parseDsn(config.dsn);
    this.extensionVersion = resolveExtensionVersion();
  }

  async report(error: AppError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const sanitized = sanitizeErrorForAnalytics(error);
      const event = this.buildEventPayload(sanitized);
      const envelope = this.buildEnvelope(event);

      const response = await fetch(this.parsedDsn.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: envelope
      });

      if (!response.ok) {
        throw new Error(`Sentry request failed: ${response.status} ${response.statusText}`);
      }
    } catch (reportingError) {
      console.warn('[Sentry Reporter] Failed to report error:', reportingError);
    }
  }

  private buildEventPayload(error: AppError): SentryEventPayload {
    const timestamp = new Date(error.timestamp ?? Date.now()).toISOString();
    const tags: Record<string, string> = {
      error_code: error.code,
      error_domain: error.domain,
      recoverable: String(error.recoverable),
      project_id: this.parsedDsn.projectId
    };

    if (this.extensionVersion) {
      tags.extension_version = this.extensionVersion;
    }

    const extra: Record<string, unknown> = {};
    if (error.context) {
      extra.context = error.context;
    }
    if (error.userMessage) {
      extra.userMessage = error.userMessage;
    }
    if (error.cause) {
      extra.cause = error.cause;
    }

    return {
      event_id: createEventId(),
      timestamp,
      level: mapSeverity(error.severity),
      platform: 'javascript',
      ...(this.config.environment ? { environment: this.config.environment } : {}),
      ...(this.config.release ? { release: this.config.release } : {}),
      message: {
        formatted: error.message
      },
      tags,
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
      exception: {
        values: [
          {
            type: error.code,
            value: error.message
          }
        ]
      }
    };
  }

  private buildEnvelope(event: SentryEventPayload): string {
    const envelopeHeader = {
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      dsn: this.config.dsn
    };
    const itemHeader = {
      type: 'event'
    };

    return `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(event)}`;
  }
}

export function createSentryErrorReporter(config: SentryReporterConfig): SentryErrorReporter {
  return new SentryErrorReporter(config);
}
