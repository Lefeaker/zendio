import { spawn } from 'node:child_process';
import { createCleanCliEnv } from './utils/cleanCliEnv.mjs';

const args = process.argv.slice(2);
const env = createCleanCliEnv();

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
