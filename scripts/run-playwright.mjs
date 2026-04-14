import { spawn } from 'node:child_process';
import net from 'node:net';
import { createCleanCliEnv } from './utils/cleanCliEnv.mjs';

const args = process.argv.slice(2);
const selectedPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? await reservePlaywrightPort();
const env = createCleanCliEnv({
  PLAYWRIGHT_WEB_SERVER_PORT: selectedPort
});

const child = spawn('npx', ['playwright', ...args], {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[run-playwright] Failed to launch Playwright:', error);
  process.exit(1);
});

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
