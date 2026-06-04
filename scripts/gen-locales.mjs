import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const tsxBin = path.join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
);

const result = spawnSync(tsxBin, ['tools/generate-i18n-catalog.ts'], {
  cwd: ROOT,
  stdio: 'inherit'
});

if (result.error) {
  console.error('[gen-locales] Failed to invoke catalog generator');
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
