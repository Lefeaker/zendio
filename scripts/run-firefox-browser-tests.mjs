import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { firefox } from '@playwright/test';

const repoRoot = process.cwd();
const firefoxExecutable = firefox.executablePath();

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(firefoxExecutable)) {
  run('npx', ['playwright', 'install', 'firefox']);
}

run(
  'npx',
  [
    'playwright',
    'test',
    'tests/visual/yaml-config.interaction.spec.ts',
    '--project=firefox-desktop'
  ],
  {
    ...process.env,
    PLAYWRIGHT_INCLUDE_FIREFOX: '1'
  }
);
