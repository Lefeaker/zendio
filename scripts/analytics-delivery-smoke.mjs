#!/usr/bin/env node
// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTrackedAnalyticsSourceContract } from './setup-error-analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const DEFAULT_DELIVERY_SMOKE_EVENT_NAME = 'options_action_completed';

export const ALLOWED_DELIVERY_SMOKE_EVENT_NAMES = /** @type {const} */ ([
  'options_action_completed',
  'options_section_viewed',
  'privacy_consent_changed',
  'support_link_clicked'
]);

const ALLOWED_TRANSPORT_MODES = new Set(['proxy', 'directDebug']);
const GOOGLE_ANALYTICS_HOST_PARTS = ['google-analytics', 'com'];
const GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS = [
  ['mp', 'collect'],
  ['debug', 'mp', 'collect']
];
const FORBIDDEN_SECRET_ENV_NAMES = [
  'GA4_API_SECRET',
  'ZENDIO_GA_API_SECRET',
  'AIIINOB_GA_API_SECRET',
  'ZENDIO_GA_SECRET',
  'AIIINOB_GA_SECRET'
];
const FORBIDDEN_PUBLIC_CONFIG_PATTERN =
  /(api[_-]?key|api[_-]?secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|secret|token|password)/i;

const HELP_TEXT = `Owner-run analytics delivery smoke

Usage:
  node scripts/analytics-delivery-smoke.mjs [--dry-run] [--require-env] [--event-name <name>]

Options:
  --dry-run       Validate config and print a redacted summary without sending.
  --require-env   Fail instead of skip when the public GA env is incomplete.
  --event-name    One of: ${ALLOWED_DELIVERY_SMOKE_EVENT_NAMES.join(', ')}
  --help          Show this help text.
`;

/**
 * @typedef {{
 *   dryRun: boolean;
 *   requireEnv: boolean;
 *   eventName: string;
 *   help: boolean;
 *   error?: string;
 * }} DeliverySmokeArgs
 */

/**
 * @typedef {{
 *   measurementId?: string;
 *   transportMode?: string;
 *   proxyEndpoint?: string;
 *   forbiddenSecretEnvNames: string[];
 * }} PublicAnalyticsEnvSnapshot
 */

/**
 * @typedef {{
 *   status: 'ready';
 *   measurementId: string;
 *   transportMode: 'proxy' | 'directDebug';
 *   proxyEndpoint: string;
 * } | {
 *   status: 'skipped' | 'failed';
 *   message: string;
 * }} DeliverySmokeEnvironmentResult
 */

/**
 * @param {string[]} argv
 * @returns {DeliverySmokeArgs}
 */
export function parseAnalyticsDeliverySmokeArgs(argv) {
  /** @type {DeliverySmokeArgs} */
  const parsed = {
    dryRun: false,
    requireEnv: false,
    eventName: DEFAULT_DELIVERY_SMOKE_EVENT_NAME,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--require-env') {
      parsed.requireEnv = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (token === '--event-name') {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        return { ...parsed, error: '--event-name requires a value' };
      }
      parsed.eventName = nextValue;
      index += 1;
      continue;
    }
    if (token.startsWith('--event-name=')) {
      parsed.eventName = token.slice('--event-name='.length);
      continue;
    }
    return { ...parsed, error: `Unknown option: ${token}` };
  }

  return parsed;
}

/**
 * @param {string} [eventName]
 * @returns {{ eventName: string; params: Record<string, string | boolean> }}
 */
export function buildSyntheticSmokeEvent(eventName = DEFAULT_DELIVERY_SMOKE_EVENT_NAME) {
  switch (eventName) {
    case 'options_action_completed':
      return {
        eventName,
        params: {
          action: 'owner_smoke',
          outcome: 'completed',
          section: 'privacy'
        }
      };
    case 'options_section_viewed':
      return {
        eventName,
        params: {
          section: 'privacy'
        }
      };
    case 'privacy_consent_changed':
      return {
        eventName,
        params: {
          field: 'analytics',
          enabled: true
        }
      };
    case 'support_link_clicked':
      return {
        eventName,
        params: {
          target: 'ko-fi'
        }
      };
    default:
      throw new Error(
        `Unsupported --event-name. Allowed values: ${ALLOWED_DELIVERY_SMOKE_EVENT_NAMES.join(', ')}`
      );
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {PublicAnalyticsEnvSnapshot}
 */
export function collectPublicAnalyticsEnv(env = process.env) {
  return {
    measurementId: resolveEnvAlias(env, 'ZENDIO_GA_MEASUREMENT_ID', 'AIIINOB_GA_MEASUREMENT_ID'),
    transportMode: resolveEnvAlias(env, 'ZENDIO_GA_TRANSPORT_MODE', 'AIIINOB_GA_TRANSPORT_MODE'),
    proxyEndpoint: resolveEnvAlias(env, 'ZENDIO_GA_PROXY_ENDPOINT', 'AIIINOB_GA_PROXY_ENDPOINT'),
    forbiddenSecretEnvNames: FORBIDDEN_SECRET_ENV_NAMES.filter((name) => {
      const value = env[name];
      return typeof value === 'string' && value.trim().length > 0;
    })
  };
}

/**
 * @param {PublicAnalyticsEnvSnapshot} snapshot
 * @param {{ requireEnv: boolean }} options
 * @returns {DeliverySmokeEnvironmentResult}
 */
export function validateDeliverySmokeEnvironment(snapshot, options) {
  if (snapshot.forbiddenSecretEnvNames.length > 0) {
    return {
      status: 'failed',
      message: `Forbidden server-only GA secret env vars are set: ${snapshot.forbiddenSecretEnvNames.join(', ')}`
    };
  }

  if (!snapshot.transportMode) {
    return options.requireEnv
      ? {
          status: 'failed',
          message:
            'Missing ZENDIO_GA_TRANSPORT_MODE/AIIINOB_GA_TRANSPORT_MODE while --require-env is enabled'
        }
      : {
          status: 'skipped',
          message:
            'Skipped analytics delivery smoke: public GA env is incomplete (transport mode is unset)'
        };
  }

  if (!ALLOWED_TRANSPORT_MODES.has(snapshot.transportMode)) {
    if (snapshot.transportMode === 'disabled') {
      return {
        status: 'failed',
        message:
          'Analytics delivery smoke requires ZENDIO_GA_TRANSPORT_MODE/AIIINOB_GA_TRANSPORT_MODE to be proxy or directDebug'
      };
    }

    return {
      status: 'failed',
      message:
        'Analytics delivery smoke requires ZENDIO_GA_TRANSPORT_MODE/AIIINOB_GA_TRANSPORT_MODE to be proxy or directDebug'
    };
  }

  if (!snapshot.measurementId) {
    return options.requireEnv
      ? {
          status: 'failed',
          message:
            'Missing ZENDIO_GA_MEASUREMENT_ID/AIIINOB_GA_MEASUREMENT_ID while --require-env is enabled'
        }
      : {
          status: 'skipped',
          message:
            'Skipped analytics delivery smoke: public GA env is incomplete (measurement id is unset)'
        };
  }

  if (!isValidMeasurementId(snapshot.measurementId)) {
    return {
      status: 'failed',
      message: 'Public GA measurement id is invalid for delivery smoke'
    };
  }

  if (!snapshot.proxyEndpoint) {
    return options.requireEnv
      ? {
          status: 'failed',
          message:
            'Missing ZENDIO_GA_PROXY_ENDPOINT/AIIINOB_GA_PROXY_ENDPOINT while --require-env is enabled'
        }
      : {
          status: 'skipped',
          message:
            'Skipped analytics delivery smoke: public GA env is incomplete (proxy endpoint is unset)'
        };
  }

  const proxyEndpoint = normalizeOwnerProxyEndpoint(snapshot.proxyEndpoint);
  if (!proxyEndpoint) {
    return {
      status: 'failed',
      message: 'Proxy endpoint is invalid or not owner-controlled for delivery smoke'
    };
  }

  return {
    status: 'ready',
    measurementId: snapshot.measurementId,
    transportMode: /** @type {'proxy' | 'directDebug'} */ (snapshot.transportMode),
    proxyEndpoint
  };
}

/**
 * @param {{ eventName: string; transportMode: string; responseStatus?: number; debugResponse?: unknown }} input
 * @returns {{ eventName: string; transportMode: string; responseStatus?: number; validationMessageCount: number }}
 */
export function buildRedactedSummary(input) {
  return {
    eventName: input.eventName,
    transportMode: input.transportMode,
    ...(typeof input.responseStatus === 'number' ? { responseStatus: input.responseStatus } : {}),
    validationMessageCount: countValidationMessages(input.debugResponse)
  };
}

/**
 * @param {{
 *   eventName: string;
 *   measurementId: string;
 *   transportMode: 'proxy' | 'directDebug';
 *   extensionVersion?: string;
 *   now?: () => number;
 * }} options
 * @returns {Record<string, unknown>}
 */
export function buildAnalyticsDeliverySmokePayload(options) {
  const syntheticEvent = buildSyntheticSmokeEvent(options.eventName);
  const now = options.now?.() ?? Date.now();
  const payload = {
    client_id: `owner-smoke-${now.toString(36)}`,
    measurement_id: options.measurementId,
    events: [
      {
        name: syntheticEvent.eventName,
        params: {
          engagement_time_msec: 1,
          extension_version: options.extensionVersion ?? resolvePackageVersion(),
          session_id: `owner-smoke-session-${Math.floor(now / 1000).toString(36)}`,
          ...syntheticEvent.params
        }
      }
    ],
    timestamp_micros: now * 1000
  };

  if (options.transportMode === 'directDebug') {
    return {
      ...payload,
      validation_behavior: 'ENFORCE_RECOMMENDATIONS'
    };
  }

  return payload;
}

/**
 * @param {{
 *   argv?: string[];
 *   env?: NodeJS.ProcessEnv;
 *   fetchImpl?: typeof fetch;
 *   now?: () => number;
 *   stdout?: (...args: unknown[]) => void;
 *   stderr?: (...args: unknown[]) => void;
 * }} [options]
 * @returns {Promise<{
 *   status: 'help' | 'dry-run' | 'skipped' | 'sent' | 'failed';
 *   exitCode: number;
 *   responseStatus?: number;
 *   summary?: ReturnType<typeof buildRedactedSummary>;
 * }>}
 */
export async function runAnalyticsDeliverySmoke(options = {}) {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const args = parseAnalyticsDeliverySmokeArgs(options.argv ?? process.argv.slice(2));

  if (args.error) {
    stderr(args.error);
    return { status: 'failed', exitCode: 1 };
  }

  if (args.help) {
    stdout(HELP_TEXT);
    return { status: 'help', exitCode: 0 };
  }

  try {
    buildSyntheticSmokeEvent(args.eventName);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return { status: 'failed', exitCode: 1 };
  }

  const trackedContract = collectTrackedAnalyticsSourceContract(rootDir);
  if (
    trackedContract.runtimeCallsGoogleEndpointsDirectly ||
    !trackedContract.proxyBackedTransports ||
    trackedContract.transportModes.join(',') !== 'disabled,proxy,directDebug'
  ) {
    stderr(
      'Tracked analytics transport contract drifted from the proxy-first delivery smoke assumptions'
    );
    return { status: 'failed', exitCode: 1 };
  }

  const environment = validateDeliverySmokeEnvironment(collectPublicAnalyticsEnv(options.env), {
    requireEnv: args.requireEnv
  });

  if (environment.status === 'skipped') {
    stdout(environment.message);
    return { status: 'skipped', exitCode: 0 };
  }

  if (environment.status === 'failed') {
    stderr(environment.message);
    return { status: 'failed', exitCode: 1 };
  }

  const summary = buildRedactedSummary({
    eventName: args.eventName,
    transportMode: environment.transportMode
  });

  if (args.dryRun) {
    stdout('Dry run analytics delivery smoke summary:', JSON.stringify(summary));
    return { status: 'dry-run', exitCode: 0, summary };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    stderr('Fetch is unavailable for analytics delivery smoke');
    return { status: 'failed', exitCode: 1 };
  }

  const payload = buildAnalyticsDeliverySmokePayload({
    eventName: args.eventName,
    measurementId: environment.measurementId,
    transportMode: environment.transportMode,
    now: options.now
  });

  try {
    const response = await fetchImpl(environment.proxyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseStatus = response.status || (response.ok ? 200 : 0);
    const responseBody = await readResponseBody(response);
    const debugResponse = parseResponseBody(responseBody);
    const responseSummary = buildRedactedSummary({
      eventName: args.eventName,
      transportMode: environment.transportMode,
      responseStatus,
      debugResponse
    });

    if (!response.ok) {
      stderr('Analytics delivery smoke failed:', JSON.stringify(responseSummary));
      return {
        status: 'failed',
        exitCode: 1,
        responseStatus,
        summary: responseSummary
      };
    }

    stdout('Analytics delivery smoke sent:', JSON.stringify(responseSummary));
    return {
      status: 'sent',
      exitCode: 0,
      responseStatus,
      summary: responseSummary
    };
  } catch {
    const networkSummary = buildRedactedSummary({
      eventName: args.eventName,
      transportMode: environment.transportMode
    });
    stderr(
      'Analytics delivery smoke failed before proxy response:',
      JSON.stringify(networkSummary)
    );
    return {
      status: 'failed',
      exitCode: 1,
      summary: networkSummary
    };
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} primaryName
 * @param {string} secondaryName
 * @returns {string | undefined}
 */
function resolveEnvAlias(env, primaryName, secondaryName) {
  const rawValue = env[primaryName] || env[secondaryName];
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidMeasurementId(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return /^G-[A-Z0-9-]{4,48}$/i.test(normalized) && !/X{4,}/i.test(normalized);
}

/**
 * @param {string} value
 * @returns {string | undefined}
 */
function normalizeOwnerProxyEndpoint(value) {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    FORBIDDEN_PUBLIC_CONFIG_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    const isHttps = url.protocol === 'https:';
    const isLocalHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());

    if (!isHttps && !isLocalHttp) {
      return undefined;
    }

    if (isGoogleMeasurementProtocolEndpointUrl(url)) {
      return undefined;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isGoogleMeasurementProtocolEndpointUrl(url) {
  const hostname = canonicalizeEndpointHostname(url.hostname);
  if (!isGoogleAnalyticsHost(hostname)) {
    return false;
  }

  const pathParts = canonicalizeEndpointPathParts(url.pathname);
  if (!pathParts) {
    return true;
  }

  return (
    pathParts.length > 0 &&
    GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS.some(
      (parts) => pathParts.join('/') === parts.join('/')
    )
  );
}

/**
 * @param {string} hostname
 * @returns {string}
 */
function canonicalizeEndpointHostname(hostname) {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

/**
 * @param {string} pathname
 * @returns {string[] | undefined}
 */
function canonicalizeEndpointPathParts(pathname) {
  const parts = pathname
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  try {
    return parts.map((part) => decodeURIComponent(part).toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * @param {string} hostname
 * @returns {boolean}
 */
function isGoogleAnalyticsHost(hostname) {
  const googleAnalyticsHost = GOOGLE_ANALYTICS_HOST_PARTS.join('.');
  return hostname === googleAnalyticsHost || hostname.endsWith(`.${googleAnalyticsHost}`);
}

/**
 * @param {{ clone?: () => { text: () => Promise<string> } }} response
 * @returns {Promise<string | undefined>}
 */
async function readResponseBody(response) {
  try {
    const text = await response.clone?.().text();
    return text && text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {string | undefined} value
 * @returns {unknown}
 */
function parseResponseBody(value) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * @param {unknown} responseBody
 * @returns {number}
 */
function countValidationMessages(responseBody) {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return 0;
  }

  const validationMessages = /** @type {{ validationMessages?: unknown }} */ (responseBody)
    .validationMessages;
  return Array.isArray(validationMessages) ? validationMessages.length : 0;
}

function resolvePackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const result = await runAnalyticsDeliverySmoke();
  process.exitCode = result.exitCode;
}
