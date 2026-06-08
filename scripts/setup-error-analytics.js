#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ANALYTICS_CONFIG_PATH = path.join(
  REPO_ROOT,
  'src/shared/errors/analytics/analyticsConfig.ts'
);
const PLACEHOLDER_MEASUREMENT_ID = 'G-XXXXXXXXXX';
const PUBLIC_ENV_MARKERS = [
  '__AIIINOB_GA_MEASUREMENT_ID__',
  '__AIIINOB_GA_RELAY_ENDPOINT__',
  '__AIIINOB_GA_TRANSPORT_MODE__'
];
const ALLOWED_TRANSPORT_MODES = new Set(['disabled', 'relay', 'directDebug']);
const FORBIDDEN_SECRET_PATTERNS = [/api[_-]?secret/i, /measurement\s+protocol\s+secret/i];

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--measurement-id' && next) {
      args.measurementId = next;
      index += 1;
      continue;
    }

    if (arg === '--relay-endpoint' && next) {
      args.relayEndpoint = next;
      index += 1;
      continue;
    }

    if (arg === '--transport-mode' && next) {
      args.transportMode = next;
      index += 1;
      continue;
    }

    if (arg === '--help') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readAnalyticsConfig() {
  return fs.readFileSync(ANALYTICS_CONFIG_PATH, 'utf8');
}

function isValidMeasurementId(value) {
  return typeof value === 'string' && /^G-[A-Z0-9]+$/i.test(value) && !/X{4,}/i.test(value);
}

function isValidRelayEndpoint(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'https:' || endpoint.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidTransportMode(value) {
  return typeof value === 'string' && ALLOWED_TRANSPORT_MODES.has(value);
}

function printUsage() {
  console.log('Validate public telemetry setup for relay-first analytics.');
  console.log('');
  console.log('Usage:');
  console.log(
    '  node scripts/setup-error-analytics.js --measurement-id G-1234567890 --relay-endpoint https://relay.example/collect --transport-mode relay'
  );
  console.log('');
  console.log('This helper validates only public extension-side config guidance.');
  console.log('It never asks for or stores a GA secret.');
}

function createCheckResult(ok, message) {
  return { ok, message };
}

function validateTrackedConfig(configText) {
  const checks = [];

  checks.push(
    createCheckResult(
      configText.includes(PLACEHOLDER_MEASUREMENT_ID),
      `tracked config keeps placeholder measurement ID ${PLACEHOLDER_MEASUREMENT_ID}`
    )
  );

  PUBLIC_ENV_MARKERS.forEach((marker) => {
    checks.push(
      createCheckResult(configText.includes(marker), `tracked config references ${marker}`)
    );
  });

  FORBIDDEN_SECRET_PATTERNS.forEach((pattern) => {
    checks.push(
      createCheckResult(!pattern.test(configText), `tracked config does not contain ${pattern}`)
    );
  });

  return checks;
}

function validateCliInputs(args) {
  const checks = [];

  if (args.measurementId !== undefined) {
    checks.push(
      createCheckResult(
        isValidMeasurementId(args.measurementId),
        'public measurement ID is non-placeholder and matches GA format'
      )
    );
  } else {
    checks.push(
      createCheckResult(true, 'no measurement ID supplied; skipped public ID validation')
    );
  }

  if (args.relayEndpoint !== undefined) {
    checks.push(
      createCheckResult(
        isValidRelayEndpoint(args.relayEndpoint),
        'relay endpoint is a valid public HTTP(S) URL'
      )
    );
  } else {
    checks.push(
      createCheckResult(true, 'no relay endpoint supplied; skipped relay endpoint validation')
    );
  }

  if (args.transportMode !== undefined) {
    checks.push(
      createCheckResult(
        isValidTransportMode(args.transportMode),
        'transport mode is one of disabled | relay | directDebug'
      )
    );
    if (args.transportMode === 'directDebug') {
      checks.push(
        createCheckResult(true, 'directDebug is dev-only and must not be documented as production')
      );
    }
  } else {
    checks.push(createCheckResult(true, 'no transport mode supplied; skipped mode validation'));
  }

  return checks;
}

function printResults(results) {
  results.forEach(({ ok, message }) => {
    console.log(`${ok ? '[ok]' : '[fail]'} ${message}`);
  });
}

function printGuidance() {
  console.log('');
  console.log('Relay-first telemetry reminders:');
  console.log('- Keep the GA secret on the owner-controlled relay only.');
  console.log('- Keep tracked analyticsConfig.ts public, placeholder-only, and commit-safe.');
  console.log('- Production transport should be relay, not directDebug.');
  console.log(
    '- For debug acceptance, use relay validationMessages and treat [] as the success signal.'
  );
  console.log('- A 2xx collect response alone is not proof that the payload is valid.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const trackedConfig = readAnalyticsConfig();
  const results = [...validateTrackedConfig(trackedConfig), ...validateCliInputs(args)];
  printResults(results);
  printGuidance();

  if (results.some(({ ok }) => !ok)) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fail] setup check aborted: ${message}`);
  process.exitCode = 1;
}
