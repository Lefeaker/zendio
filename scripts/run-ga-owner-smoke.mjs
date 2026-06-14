#!/usr/bin/env node
// @ts-check

import { randomUUID } from 'node:crypto';

const SUPPORTED_MODES = /** @type {const} */ (['proxy', 'directDebug']);
const SUPPORTED_EVENTS = /** @type {const} */ (['runtime_harness_open']);
const PUBLIC_ENV_FORBIDDEN_PATTERN =
  /(api[_-]?key|api[_-]?secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|secret|token|password)/i;
const GOOGLE_ANALYTICS_HOST_PARTS = ['google-analytics', 'com'];
const GOOGLE_MEASUREMENT_PROTOCOL_PATH_PARTS = [
  ['mp', 'collect'],
  ['debug', 'mp', 'collect']
];
const FORBIDDEN_SECRET_ENV_NAMES = Object.freeze([
  'GA4_API_SECRET',
  'ZENDIO_GA_API_SECRET',
  'AIIINOB_GA_API_SECRET',
  'ZENDIO_GA_SECRET',
  'AIIINOB_GA_SECRET'
]);
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 0;
const OWNER_ONLY_CHECKS = Object.freeze([
  'Real GA property delivery is owner-only and not proven by this local smoke command.',
  'GA DebugView visibility is owner-only and not proven by this local smoke command.',
  'Server-side GA4 api_secret injection is owner-only and not proven unless proxy/server evidence is supplied by the owner.'
]);

/**
 * @typedef {'proxy' | 'directDebug'} OwnerSmokeMode
 * @typedef {'runtime_harness_open'} OwnerSmokeEventName
 */

/**
 * @typedef {{
 *   eventName: OwnerSmokeEventName;
 *   paramNames: readonly string[];
 *   params: Record<string, string>;
 * }} SupportedEventDefinition
 */

/**
 * @typedef {{
 *   mode: OwnerSmokeMode;
 *   eventName: OwnerSmokeEventName;
 *   showRedactedResponseSummary: boolean;
 *   help: boolean;
 * }} OwnerSmokeCliOptions
 */

/**
 * @typedef {{
 *   measurementId: string;
 *   proxyEndpoint: string;
 *   configuredTransportMode?: string;
 *   timeoutMs: number;
 *   retries: number;
 * }} OwnerSmokePublicConfig
 */

/**
 * @typedef {{
 *   client_id: string;
 *   measurement_id: string;
 *   events: Array<{
 *     name: OwnerSmokeEventName;
 *     params: Record<string, string | number | boolean>;
 *   }>;
 *   timestamp_micros: number;
 *   validation_behavior?: 'ENFORCE_RECOMMENDATIONS';
 * }} OwnerSmokePayload
 */

/**
 * @typedef {{
 *   ok: boolean;
 *   statusCode: number;
 *   bodyText?: string;
 *   errorCode?: string;
 *   message?: string;
 *   summary?: Record<string, unknown>;
 * }} OwnerSmokeRunResult
 */

const SUPPORTED_EVENT_DEFINITIONS = /** @type {Readonly<Record<OwnerSmokeEventName, SupportedEventDefinition>>} */ (
  Object.freeze({
    runtime_harness_open: {
      eventName: 'runtime_harness_open',
      paramNames: ['source'],
      params: Object.freeze({
        source: 'runtime-observability-harness'
      })
    }
  })
);

export function normalizeAnalyticsTransportMode(value, fallback = 'disabled') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim();
  return /** @type {readonly string[]} */ (['disabled', 'proxy', 'directDebug']).includes(normalized)
    ? normalized
    : 'disabled';
}

export function normalizeMeasurementId(value, fallback = 'G-XXXXXXXXXX') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    normalized.includes('://') ||
    normalized.includes('?') ||
    normalized.includes('#') ||
    PUBLIC_ENV_FORBIDDEN_PATTERN.test(normalized)
  ) {
    return fallback;
  }

  return normalized;
}

export function isValidMeasurementId(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  return /^G-[A-Z0-9-]{4,48}$/i.test(normalized) && !/X{4,}/i.test(normalized);
}

export function normalizeProxyEndpoint(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 512 ||
    PUBLIC_ENV_FORBIDDEN_PATTERN.test(normalized)
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

function isGoogleMeasurementProtocolEndpoint(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return isGoogleMeasurementProtocolEndpointUrl(new URL(value.trim()));
  } catch {
    return false;
  }
}

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

function canonicalizeEndpointHostname(hostname) {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

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

function isGoogleAnalyticsHost(hostname) {
  const googleAnalyticsHost = GOOGLE_ANALYTICS_HOST_PARTS.join('.');
  return hostname === googleAnalyticsHost || hostname.endsWith(`.${googleAnalyticsHost}`);
}

export function parseOwnerSmokeArgs(argv) {
  /** @type {OwnerSmokeCliOptions} */
  const options = {
    mode: 'proxy',
    eventName: 'runtime_harness_open',
    showRedactedResponseSummary: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--show-redacted-response-summary') {
      options.showRedactedResponseSummary = true;
      continue;
    }
    if (argument === '--mode') {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error('--mode requires a value');
      }
      options.mode = /** @type {OwnerSmokeMode} */ (nextValue);
      index += 1;
      continue;
    }
    if (argument.startsWith('--mode=')) {
      options.mode = /** @type {OwnerSmokeMode} */ (argument.slice('--mode='.length));
      continue;
    }
    if (argument === '--event') {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error('--event requires a value');
      }
      options.eventName = /** @type {OwnerSmokeEventName} */ (nextValue);
      index += 1;
      continue;
    }
    if (argument.startsWith('--event=')) {
      options.eventName = /** @type {OwnerSmokeEventName} */ (argument.slice('--event='.length));
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!SUPPORTED_MODES.includes(options.mode)) {
    throw new Error(`Unsupported --mode "${options.mode}". Supported values: ${SUPPORTED_MODES.join(', ')}`);
  }

  if (!SUPPORTED_EVENTS.includes(options.eventName)) {
    throw new Error(
      `Unsupported --event "${options.eventName}". Supported values: ${SUPPORTED_EVENTS.join(', ')}`
    );
  }

  return options;
}

export function resolveOwnerSmokePublicConfig(env, mode) {
  const forbiddenSecretEnvNames = FORBIDDEN_SECRET_ENV_NAMES.filter((name) => {
    const value = env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (forbiddenSecretEnvNames.length > 0) {
    throw new Error(
      `Server-only GA secret env vars are present in the local shell: ${forbiddenSecretEnvNames.join(', ')}`
    );
  }

  const rawMeasurementId = resolveEnvValue(env, 'ZENDIO_GA_MEASUREMENT_ID', 'AIIINOB_GA_MEASUREMENT_ID');
  const rawTransportMode = resolveEnvValue(
    env,
    'ZENDIO_GA_TRANSPORT_MODE',
    'AIIINOB_GA_TRANSPORT_MODE'
  );
  const rawProxyEndpoint = resolveEnvValue(
    env,
    'ZENDIO_GA_PROXY_ENDPOINT',
    'AIIINOB_GA_PROXY_ENDPOINT'
  );
  const timeoutMs = parsePositiveIntegerEnv(
    env,
    DEFAULT_TIMEOUT_MS,
    'ZENDIO_GA_OWNER_SMOKE_TIMEOUT_MS',
    'AIIINOB_GA_OWNER_SMOKE_TIMEOUT_MS'
  );
  const retries = parseNonNegativeIntegerEnv(
    env,
    DEFAULT_RETRIES,
    'ZENDIO_GA_OWNER_SMOKE_RETRIES',
    'AIIINOB_GA_OWNER_SMOKE_RETRIES'
  );

  const normalizedMeasurementId = normalizeMeasurementId(rawMeasurementId, undefined);
  if (!normalizedMeasurementId || !isValidMeasurementId(normalizedMeasurementId)) {
    throw new Error(
      'A valid public measurementId is required via ZENDIO_GA_MEASUREMENT_ID/AIIINOB_GA_MEASUREMENT_ID.'
    );
  }

  if (rawTransportMode) {
    const normalizedTransportMode = normalizeAnalyticsTransportMode(rawTransportMode, undefined);
    if (normalizedTransportMode !== rawTransportMode.trim()) {
      throw new Error(
        'ZENDIO_GA_TRANSPORT_MODE/AIIINOB_GA_TRANSPORT_MODE is invalid. Expected disabled, proxy, or directDebug.'
      );
    }
  }

  const normalizedProxyEndpoint = normalizeProxyEndpoint(rawProxyEndpoint);
  if (isGoogleMeasurementProtocolEndpoint(rawProxyEndpoint)) {
    throw new Error(
      'Google Measurement Protocol endpoint is not allowed as an owner proxy endpoint.'
    );
  }
  if (!normalizedProxyEndpoint) {
    throw new Error(
      `${mode} mode requires a valid public proxy endpoint via ZENDIO_GA_PROXY_ENDPOINT/AIIINOB_GA_PROXY_ENDPOINT.`
    );
  }

  return {
    measurementId: normalizedMeasurementId,
    proxyEndpoint: normalizedProxyEndpoint,
    ...(rawTransportMode ? { configuredTransportMode: rawTransportMode.trim() } : {}),
    timeoutMs,
    retries
  };
}

export function buildOwnerSmokePayload(mode, eventName, measurementId, now = Date.now()) {
  const eventDefinition = SUPPORTED_EVENT_DEFINITIONS[eventName];
  const sessionId = Math.floor(now / 1000);

  /** @type {OwnerSmokePayload} */
  const payload = {
    client_id: `owner-smoke-${randomUUID()}`,
    measurement_id: measurementId,
    events: [
      {
        name: eventDefinition.eventName,
        params: {
          engagement_time_msec: 1,
          session_id: sessionId,
          ...eventDefinition.params
        }
      }
    ],
    timestamp_micros: now * 1000
  };

  if (mode === 'directDebug') {
    payload.validation_behavior = 'ENFORCE_RECOMMENDATIONS';
  }

  return payload;
}

export async function runOwnerSmoke(options, env = process.env, fetchImpl = globalThis.fetch) {
  const publicConfig = resolveOwnerSmokePublicConfig(env, options.mode);
  const payload = buildOwnerSmokePayload(
    options.mode,
    options.eventName,
    publicConfig.measurementId
  );
  const response = await postWithRetries(
    publicConfig.proxyEndpoint,
    payload,
    publicConfig.timeoutMs,
    publicConfig.retries,
    fetchImpl
  );

  const baseSummary = {
    mode: options.mode,
    eventName: options.eventName,
    measurementId: redactMeasurementId(publicConfig.measurementId),
    proxyEndpoint: redactUrlForLogs(publicConfig.proxyEndpoint),
    eventParamNames: [...SUPPORTED_EVENT_DEFINITIONS[options.eventName].paramNames],
    configuredTransportMode: publicConfig.configuredTransportMode ?? '(unset)',
    ownerOnlyChecks: [...OWNER_ONLY_CHECKS]
  };

  if (response.ok) {
    return {
      ok: true,
      statusCode: 0,
      summary: {
        ...baseSummary,
        responseStatus: response.statusCode,
        responseSummary: buildResponseSummary(
          response.bodyText,
          options.showRedactedResponseSummary
        ),
        ...(options.mode === 'directDebug'
          ? { validationSummary: summarizeValidationMessages(response.bodyText) }
          : {})
      }
    };
  }

  return {
    ok: false,
    statusCode: response.statusCode,
    errorCode: response.errorCode,
    message: response.message,
    bodyText: response.bodyText,
    summary: {
      ...baseSummary,
      responseStatus: response.statusCode,
      responseSummary: buildResponseSummary(
        response.bodyText,
        options.showRedactedResponseSummary
      ),
      ...(options.mode === 'directDebug'
        ? { validationSummary: summarizeValidationMessages(response.bodyText) }
        : {})
    }
  };
}

/**
 * @param {string} endpoint
 * @param {OwnerSmokePayload} payload
 * @param {number} timeoutMs
 * @param {number} retries
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<OwnerSmokeRunResult>}
 */
async function postWithRetries(endpoint, payload, timeoutMs, retries, fetchImpl) {
  const requestBody = JSON.stringify(payload);
  let attempt = 0;

  while (attempt <= retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: requestBody,
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);
      const bodyText = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          statusCode: response.status,
          bodyText,
          errorCode: 'non_2xx_response',
          message: `Proxy responded with ${response.status}.`
        };
      }

      return {
        ok: true,
        statusCode: response.status,
        bodyText
      };
    } catch (error) {
      clearTimeout(timeoutHandle);
      const message = error instanceof Error ? error.message : String(error);
      if (attempt > retries) {
        return {
          ok: false,
          statusCode: 2,
          errorCode: 'network_failure',
          message: `Network request failed: ${message}`
        };
      }
    }
  }

  return {
    ok: false,
    statusCode: 2,
    errorCode: 'network_failure',
    message: 'Network request failed.'
  };
}

function resolveEnvValue(env, primaryName, legacyName) {
  return (env[primaryName] || env[legacyName] || '').trim();
}

function parsePositiveIntegerEnv(env, fallback, primaryName, legacyName) {
  const value = resolveEnvValue(env, primaryName, legacyName);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${primaryName}/${legacyName} must be a positive integer when set.`);
  }
  return parsed;
}

function parseNonNegativeIntegerEnv(env, fallback, primaryName, legacyName) {
  const value = resolveEnvValue(env, primaryName, legacyName);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${primaryName}/${legacyName} must be a non-negative integer when set.`);
  }
  return parsed;
}

function redactMeasurementId(value) {
  if (typeof value !== 'string' || value.length < 6) {
    return '(redacted)';
  }
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function redactUrlForLogs(value) {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '(invalid-url)';
  }
}

function buildResponseSummary(bodyText, showRedactedResponseSummary) {
  if (!bodyText) {
    return { available: false };
  }

  const parsed = safeJsonParse(bodyText);
  if (!showRedactedResponseSummary) {
    return {
      available: true,
      redacted: true,
      format: parsed && typeof parsed === 'object' ? 'json' : 'text',
      ...(parsed && typeof parsed === 'object'
        ? { topLevelKeys: Object.keys(parsed).sort() }
        : { bodyLength: bodyText.length })
    };
  }

  if (parsed && typeof parsed === 'object') {
    const topLevelKeys = Object.keys(parsed).sort();
    return {
      available: true,
      redacted: true,
      format: 'json',
      topLevelKeys,
      validationMessageCount: Array.isArray(parsed.validationMessages)
        ? parsed.validationMessages.length
        : 0
    };
  }

  return {
    available: true,
    redacted: true,
    format: 'text',
    bodyLength: bodyText.length
  };
}

function summarizeValidationMessages(bodyText) {
  const parsed = safeJsonParse(bodyText);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.validationMessages)) {
    return {
      available: false,
      messageCount: 0
    };
  }

  const fieldPaths = parsed.validationMessages
    .map((message) =>
      message && typeof message === 'object' && typeof message.fieldPath === 'string'
        ? message.fieldPath
        : null
    )
    .filter((value) => typeof value === 'string');
  const severities = [...new Set(
    parsed.validationMessages
      .map((message) =>
        message && typeof message === 'object' && typeof message.severity === 'string'
          ? message.severity
          : null
      )
      .filter((value) => typeof value === 'string')
  )];

  return {
    available: true,
    messageCount: parsed.validationMessages.length,
    ...(fieldPaths.length > 0 ? { fieldPaths } : {}),
    ...(severities.length > 0 ? { severities } : {})
  };
}

function safeJsonParse(value) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-ga-owner-smoke.mjs --mode <proxy|directDebug> --event <runtime_harness_open> [--show-redacted-response-summary]

Required public env:
  AIIINOB_GA_MEASUREMENT_ID or ZENDIO_GA_MEASUREMENT_ID
  AIIINOB_GA_PROXY_ENDPOINT or ZENDIO_GA_PROXY_ENDPOINT

Optional local-only env:
  AIIINOB_GA_OWNER_SMOKE_TIMEOUT_MS or ZENDIO_GA_OWNER_SMOKE_TIMEOUT_MS
  AIIINOB_GA_OWNER_SMOKE_RETRIES or ZENDIO_GA_OWNER_SMOKE_RETRIES

Forbidden local env:
  GA4_API_SECRET, AIIINOB_GA_API_SECRET, ZENDIO_GA_API_SECRET, AIIINOB_GA_SECRET, ZENDIO_GA_SECRET
`);
}

async function main() {
  try {
    const options = parseOwnerSmokeArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const result = await runOwnerSmoke(options);
    if (result.ok) {
      console.log(JSON.stringify(result.summary, null, 2));
      return;
    }

    console.error(
      JSON.stringify(
        {
          error: result.errorCode ?? 'owner_smoke_failed',
          message: result.message,
          ...(result.summary ? { summary: result.summary } : {})
        },
        null,
        2
      )
    );
    process.exitCode = result.statusCode;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          error: 'invalid_configuration',
          message: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

const isEntrypoint = (() => {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }
  try {
    return new URL(import.meta.url).pathname === new URL(`file://${scriptPath}`).pathname;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  await main();
}
