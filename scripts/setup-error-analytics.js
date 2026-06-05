#!/usr/bin/env node
// @ts-check

/**
 * Read-only analytics setup validator.
 *
 * This script verifies that the repo is wired for proxy-first analytics and
 * that the current shell environment contains only public build config.
 *
 * It does not write files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

let failures = 0;
let warnings = 0;

function paint(color, message) {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function ok(message) {
  paint('green', `OK  ${message}`);
}

function info(message) {
  paint('blue', `INFO ${message}`);
}

function warn(message) {
  warnings += 1;
  paint('yellow', `WARN ${message}`);
}

function fail(message) {
  failures += 1;
  paint('red', `FAIL ${message}`);
}

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

function exists(filePath) {
  return fs.existsSync(path.join(rootDir, filePath));
}

function validateRequiredFiles() {
  info('Checking required analytics files');

  const requiredFiles = [
    'src/shared/analytics/analyticsEnvironment.ts',
    'src/shared/analytics/analyticsTransport.ts',
    'src/shared/errors/analytics/analyticsConfig.ts',
    'src/shared/errors/analytics/googleAnalyticsReporter.ts',
    'src/options/app/productionStitchPersistence.ts',
    'src/ui/domains/privacy/PrivacySettingsView.ts',
    'scripts/build.mjs'
  ];

  for (const file of requiredFiles) {
    if (exists(file)) {
      ok(`${file} exists`);
    } else {
      fail(`${file} is missing`);
    }
  }
}

function validateTrackedConfig() {
  info('Checking tracked analytics config');

  const config = read('src/shared/errors/analytics/analyticsConfig.ts');
  const reporter = read('src/shared/errors/analytics/googleAnalyticsReporter.ts');
  const environment = read('src/shared/analytics/analyticsEnvironment.ts');

  if (/\bAPI_SECRET\b/.test(config) || /\bapiSecret\b/.test(config)) {
    fail('tracked analytics config still contains a client-side secret field');
  } else {
    ok('tracked analytics config has no client-side secret field');
  }

  if (config.includes('PUBLIC_BUILD_ANALYTICS_CONFIG.measurementId')) {
    ok('tracked analytics config reads build-time measurementId');
  } else {
    fail('tracked analytics config is not reading build-time measurementId');
  }

  if (config.includes("PUBLIC_BUILD_ANALYTICS_CONFIG.transportMode ?? 'disabled'")) {
    ok('tracked analytics config defaults transport mode safely');
  } else {
    fail('tracked analytics config is not defaulting transport mode safely');
  }

  if (config.includes('PUBLIC_BUILD_ANALYTICS_CONFIG.proxyEndpoint')) {
    ok('tracked analytics config supports proxy endpoint injection');
  } else {
    fail('tracked analytics config is not wired for proxy endpoint injection');
  }

  if (environment.includes("'disabled' | 'proxy' | 'directDebug'")) {
    ok('analytics environment exposes the expected transport modes');
  } else {
    fail('analytics environment transport modes drifted');
  }

  if (reporter.includes("sendAnalyticsTransportEvent(\n        'extension_error'")) {
    ok('error reporter still uses shared analytics transport');
  } else {
    fail('error reporter no longer uses the shared analytics transport');
  }
}

function validateBuildInjection() {
  info('Checking build-time public config injection');

  const buildScript = read('scripts/build.mjs');
  const expectedDefines = [
    '__AIIINOB_GA_MEASUREMENT_ID__',
    '__AIIINOB_GA_TRANSPORT_MODE__',
    '__AIIINOB_GA_PROXY_ENDPOINT__'
  ];

  for (const defineName of expectedDefines) {
    if (buildScript.includes(defineName)) {
      ok(`build injects ${defineName}`);
    } else {
      fail(`build no longer injects ${defineName}`);
    }
  }
}

function validatePrivacyWiring() {
  info('Checking privacy and consent wiring');

  const persistence = read('src/options/app/productionStitchPersistence.ts');
  const finalAnalyticsEvent = read('src/options/app/productionStitchFinalAnalyticsEvent.ts');
  const privacyView = read('src/ui/domains/privacy/PrivacySettingsView.ts');

  if (persistence.includes("createTrackUsageEventMessage('privacy_consent_changed'")) {
    ok('privacy consent change event is wired');
  } else {
    fail('privacy consent change event wiring is missing');
  }

  if (
    persistence.includes('prepareAnalyticsDataClearedEvent') &&
    finalAnalyticsEvent.includes("'analytics_data_cleared'") &&
    finalAnalyticsEvent.includes('sendAnalyticsTransportEvent')
  ) {
    ok('analytics data cleared event is wired');
  } else {
    fail('analytics data cleared event wiring is missing');
  }

  if (privacyView.includes('toggleDebugMode') && privacyView.includes('saveSettings')) {
    ok('privacy settings view still exposes the expected consent actions');
  } else {
    fail('privacy settings view no longer exposes the expected consent actions');
  }
}

function validateEnvironmentVariables() {
  info('Checking current shell environment');

  const measurementId = (process.env.AIIINOB_GA_MEASUREMENT_ID || '').trim();
  const transportMode = (process.env.AIIINOB_GA_TRANSPORT_MODE || '').trim();
  const proxyEndpoint = (process.env.AIIINOB_GA_PROXY_ENDPOINT || '').trim();
  const secretLikePattern = /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|token|password|secret)/i;

  if (!transportMode) {
    warn('AIIINOB_GA_TRANSPORT_MODE is unset; builds will default to disabled');
  } else if (!['disabled', 'proxy', 'directDebug'].includes(transportMode)) {
    fail(`AIIINOB_GA_TRANSPORT_MODE is invalid: ${transportMode}`);
  } else {
    ok(`transport mode is ${transportMode}`);
  }

  if (!measurementId) {
    warn('AIIINOB_GA_MEASUREMENT_ID is unset');
  } else if (!/^G-[A-Z0-9-]{4,48}$/i.test(measurementId) || /X{4,}/i.test(measurementId)) {
    fail(`measurementId format is invalid: ${measurementId}`);
  } else {
    ok(`measurementId format looks valid: ${measurementId}`);
  }

  if (proxyEndpoint) {
    try {
      const url = new URL(proxyEndpoint);
      const isHttps = url.protocol === 'https:';
      const isLocalHttp =
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
      if (!isHttps && !isLocalHttp) {
        fail(`proxy endpoint must be https or localhost http: ${proxyEndpoint}`);
      } else if (secretLikePattern.test(proxyEndpoint)) {
        fail('proxy endpoint looks like it embeds a secret-like value');
      } else {
        ok(`proxy endpoint format looks valid: ${proxyEndpoint}`);
      }
    } catch {
      fail(`proxy endpoint is not a valid URL: ${proxyEndpoint}`);
    }
  } else if (transportMode === 'proxy') {
    fail('proxy transport requires AIIINOB_GA_PROXY_ENDPOINT');
  } else {
    warn('AIIINOB_GA_PROXY_ENDPOINT is unset');
  }

  if (transportMode === 'directDebug' && proxyEndpoint) {
    warn('proxy endpoint is ignored when transport mode is directDebug');
  }
}

function printSummary() {
  console.log('');
  if (failures > 0) {
    fail(`Validation finished with ${failures} failure(s) and ${warnings} warning(s)`);
    process.exitCode = 1;
    return;
  }

  ok(`Validation finished with 0 failures and ${warnings} warning(s)`);
  info('The repo remains proxy-first and client-side public-config-only.');
}

validateRequiredFiles();
validateTrackedConfig();
validateBuildInjection();
validatePrivacyWiring();
validateEnvironmentVariables();
printSummary();
