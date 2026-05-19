import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const CWS_API_ROOT = 'https://chromewebstore.googleapis.com';

const REQUIRED_ENV = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_EXTENSION_ID',
  'CWS_PUBLISHER_ID'
];

export function readChromeWebStoreConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    clientId: env.CWS_CLIENT_ID,
    clientSecret: env.CWS_CLIENT_SECRET,
    refreshToken: env.CWS_REFRESH_TOKEN,
    itemId: env.CWS_EXTENSION_ID,
    publisherId: env.CWS_PUBLISHER_ID
  };
}

export function createChromeWebStoreUrls(config) {
  const publisherId = encodeURIComponent(config.publisherId);
  const itemId = encodeURIComponent(config.itemId);

  return {
    upload: `${CWS_API_ROOT}/upload/v2/publishers/${publisherId}/items/${itemId}:upload`,
    publish: `${CWS_API_ROOT}/v2/publishers/${publisherId}/items/${itemId}:publish`
  };
}

async function readJsonResponse(response, actionName) {
  const body = await response.text();
  let parsed = {};

  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { rawBody: body };
    }
  }

  if (!response.ok) {
    const details =
      typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed) : String(parsed);
    throw new Error(`${actionName} failed with HTTP ${response.status}: ${details}`);
  }

  return parsed;
}

async function requestAccessToken(config, fetchImpl) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
    scope: CWS_SCOPE
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const payload = await readJsonResponse(response, 'Chrome Web Store token exchange');

  if (!payload.access_token) {
    throw new Error('Chrome Web Store token exchange did not return access_token');
  }

  return payload.access_token;
}

async function uploadPackage(config, accessToken, zipPath, dependencies) {
  const { fetchImpl, readFileImpl } = dependencies;
  const urls = createChromeWebStoreUrls(config);
  const zipBytes = await readFileImpl(zipPath);

  const response = await fetchImpl(urls.upload, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/zip'
    },
    body: zipBytes
  });

  return readJsonResponse(response, 'Chrome Web Store upload');
}

async function publishItem(config, accessToken, fetchImpl) {
  const urls = createChromeWebStoreUrls(config);
  const response = await fetchImpl(urls.publish, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  return readJsonResponse(response, 'Chrome Web Store publish');
}

export async function publishChromeWebStorePackage(options) {
  const {
    zipPath,
    env = process.env,
    fetchImpl = fetch,
    readFileImpl = readFile,
    logger = console
  } = options;

  if (!zipPath) {
    throw new Error(
      'Publish mode requires --zip <path>. Refusing to auto-select release artifacts.'
    );
  }

  const config = readChromeWebStoreConfig(env);
  logger.log(`Publishing Chrome Web Store item ${config.itemId} from ${zipPath}`);

  const accessToken = await requestAccessToken(config, fetchImpl);
  const upload = await uploadPackage(config, accessToken, zipPath, { fetchImpl, readFileImpl });
  logger.log('Chrome Web Store upload request accepted.');

  const publish = await publishItem(config, accessToken, fetchImpl);
  logger.log('Chrome Web Store publish request submitted.');

  return { upload, publish };
}

export async function dryRunChromeWebStoreRelease(options) {
  const { zipPath, env = process.env, accessImpl = access, logger = console } = options;

  if (!zipPath) {
    throw new Error('Dry-run requires --zip <path> so the release artifact is explicit.');
  }

  const config = readChromeWebStoreConfig(env);
  const urls = createChromeWebStoreUrls(config);

  await accessImpl(zipPath);

  const result = {
    mode: 'dry-run',
    itemId: config.itemId,
    publisherId: config.publisherId,
    zipPath,
    tokenUrl: TOKEN_URL,
    uploadUrl: urls.upload,
    publishUrl: urls.publish
  };

  logger.log(`Chrome Web Store dry-run passed for item ${config.itemId} from ${zipPath}`);
  logger.log(`Upload URL: ${urls.upload}`);
  logger.log(`Publish URL: ${urls.publish}`);

  return result;
}

export async function resolveReleaseOptionsFromArgs(argv, cwd = process.cwd()) {
  const publish = argv.includes('--publish');
  const dryRun = argv.includes('--dry-run') || !publish;
  const zipFlagIndex = argv.indexOf('--zip');
  let zipPath;

  if (zipFlagIndex >= 0) {
    const rawZipPath = argv[zipFlagIndex + 1];
    if (!rawZipPath) {
      throw new Error('Missing value for --zip');
    }
    zipPath = resolve(cwd, rawZipPath);
  }

  if (!zipPath) {
    const mode = publish ? 'Publish mode' : 'Dry-run';
    throw new Error(`${mode} requires --zip <path>. Refusing to auto-select release artifacts.`);
  }

  return {
    mode: dryRun ? 'dry-run' : 'publish',
    zipPath
  };
}

async function main() {
  try {
    const options = await resolveReleaseOptionsFromArgs(process.argv.slice(2));
    if (options.mode === 'dry-run') {
      await dryRunChromeWebStoreRelease({ zipPath: options.zipPath });
      return;
    }

    await publishChromeWebStorePackage({ zipPath: options.zipPath });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
