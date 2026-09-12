import { spawn } from 'node:child_process';
import net from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCleanCliEnv } from './utils/cleanCliEnv.mjs';

export const PLAYWRIGHT_CLI_PATH = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url)
);

export async function runPlaywright(
  rawArgs = process.argv.slice(2),
  {
    spawnOperation = spawn,
    reservePortOperation = reservePlaywrightPort,
    exitOperation = (code) => process.exit(code),
    signalOperation = (signal) => process.kill(process.pid, signal),
    errorOperation = (...values) => console.error(...values)
  } = {}
) {
  if (!isAbsolute(process.execPath) || !isAbsolute(PLAYWRIGHT_CLI_PATH)) {
    throw new Error(
      '[run-playwright] Absolute Node and repository-local Playwright paths required.'
    );
  }

  const args = withDefaultConfigForExplicitE2eTests(rawArgs);
  const selectedPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? (await reservePortOperation());
  const env = createCleanCliEnv({
    PLAYWRIGHT_WEB_SERVER_PORT: selectedPort
  });
  const child = spawnOperation(process.execPath, [PLAYWRIGHT_CLI_PATH, ...args], {
    stdio: 'inherit',
    env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      signalOperation(signal);
      return;
    }

    exitOperation(code ?? 1);
  });

  child.on('error', (error) => {
    errorOperation('[run-playwright] Failed to launch Playwright:', error);
    exitOperation(1);
  });

  return child;
}

function withDefaultConfigForExplicitE2eTests(args) {
  if (hasConfigArg(args) || !targetsE2eTestFile(args)) {
    return args;
  }

  return [...args, '--config=playwright.reader.config.ts'];
}

function hasConfigArg(args) {
  return args.some((arg) => arg === '--config' || arg.startsWith('--config='));
}

function targetsE2eTestFile(args) {
  return args.some((arg) => {
    if (arg.startsWith('-')) {
      return false;
    }

    return arg.replaceAll('\\', '/').includes('tests/e2e/');
  });
}

function reservePlaywrightPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('[run-playwright] Failed to reserve a TCP port.')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(port));
      });
    });
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runPlaywright();
}
