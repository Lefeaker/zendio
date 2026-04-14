import http from 'node:http';
import { spawn } from 'node:child_process';
import { access, createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCleanCliEnv } from './utils/cleanCliEnv.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'build/dist');
const buildLockDir = path.resolve(rootDir, 'build/.playwright-build.lock');
const host = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4173');

const releaseBuildLock = await acquireBuildLock();
try {
  await runBuild();
} finally {
  await releaseBuildLock();
}
await assertDistExists();

const server = http.createServer(async (request, response) => {
  try {
    const filePath = await resolveRequestFile(request.url ?? '/');
    const stats = await stat(filePath);
    const contentType = getContentType(filePath);

    response.writeHead(200, {
      'Content-Type': String(contentType),
      'Content-Length': stats.size,
      'Cache-Control': 'no-store'
    });

    createReadStream(filePath).pipe(response);
  } catch (error) {
    const notFound = error?.code === 'ENOENT';
    response.writeHead(notFound ? 404 : 500, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(notFound ? 'Not Found' : 'Internal Server Error');

    if (!notFound) {
      console.error('[playwright-web-server] Failed to serve request:', error);
    }
  }
});

server.listen(port, host, () => {
  console.log(`[playwright-web-server] Serving ${distDir} at http://${host}:${port}`);
});

const shutdown = (signal) => {
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 1000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build:dev'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: createCleanCliEnv()
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`[playwright-web-server] build:dev interrupted by ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`[playwright-web-server] build:dev failed with code ${code}`));
        return;
      }

      resolve();
    });

    child.on('error', reject);
  });
}

async function acquireBuildLock(timeoutMs = 180_000) {
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(buildLockDir);
      return async () => {
        await rm(buildLockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `[playwright-web-server] Timed out waiting for build lock: ${buildLockDir}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function assertDistExists() {
  return new Promise((resolve, reject) => {
    access(distDir, (error) => {
      if (error) {
        reject(new Error(`[playwright-web-server] Missing dist directory: ${distDir}`));
        return;
      }

      resolve();
    });
  });
}

async function resolveRequestFile(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const relativePath = decodeURIComponent(
    url.pathname === '/' ? '/options/index.html' : url.pathname
  );
  const normalizedPath = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');
  const candidate = path.resolve(distDir, normalizedPath);

  if (!candidate.startsWith(distDir)) {
    throw new Error(`Refusing to serve path outside dist: ${relativePath}`);
  }

  return candidate;
}

function getContentType(filePath) {
  switch (path.extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
