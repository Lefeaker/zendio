import { EventEmitter } from 'node:events';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SpawnOperation = (
  executable: string,
  args: string[],
  options: { stdio: string; env: NodeJS.ProcessEnv }
) => EventEmitter;
type ReservePortOperation = () => Promise<string>;

interface RunPlaywrightModule {
  PLAYWRIGHT_CLI_PATH: string;
  runPlaywright: (
    args: string[],
    options: {
      spawnOperation: SpawnOperation;
      reservePortOperation?: () => Promise<string>;
      exitOperation: (code: number) => void;
      signalOperation: (signal: NodeJS.Signals) => void;
      errorOperation?: (message: string, error: Error) => void;
    }
  ) => Promise<EventEmitter>;
}

async function loadRunPlaywright(): Promise<RunPlaywrightModule> {
  const moduleUrl = pathToFileURL(resolve('scripts/run-playwright.mjs')).href;
  return vi.importActual<RunPlaywrightModule>(`${moduleUrl}?unit=${crypto.randomUUID()}`);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('run-playwright repository-local CLI wrapper', () => {
  it('uses the absolute current Node runtime and locked local CLI with default E2E config', async () => {
    vi.stubEnv('PLAYWRIGHT_WEB_SERVER_PORT', undefined);
    vi.stubEnv('G00_PLAYWRIGHT_SENTINEL', 'forwarded');
    const child = new EventEmitter();
    const spawnOperation = vi.fn<SpawnOperation>(() => child);
    const reservePortOperation = vi.fn<ReservePortOperation>(() => Promise.resolve('43123'));
    const exitOperation = vi.fn();
    const signalOperation = vi.fn();
    const module = await loadRunPlaywright();

    await module.runPlaywright(
      ['test', 'tests/e2e/sessionDraftConcurrency.browser.test.ts', '--project=chromium-desktop'],
      {
        spawnOperation,
        reservePortOperation,
        exitOperation,
        signalOperation
      }
    );

    expect(isAbsolute(process.execPath)).toBe(true);
    expect(module.PLAYWRIGHT_CLI_PATH).toBe(resolve('node_modules/@playwright/test/cli.js'));
    expect(isAbsolute(module.PLAYWRIGHT_CLI_PATH)).toBe(true);
    expect(reservePortOperation).toHaveBeenCalledOnce();
    const spawnCall = spawnOperation.mock.calls[0];
    expect(spawnCall?.[0]).toBe(process.execPath);
    expect(spawnCall?.[1]).toEqual([
      module.PLAYWRIGHT_CLI_PATH,
      'test',
      'tests/e2e/sessionDraftConcurrency.browser.test.ts',
      '--project=chromium-desktop',
      '--config=playwright.reader.config.ts'
    ]);
    expect(spawnCall?.[2].stdio).toBe('inherit');
    expect(spawnCall?.[2].env).toMatchObject({
      G00_PLAYWRIGHT_SENTINEL: 'forwarded',
      PLAYWRIGHT_WEB_SERVER_PORT: '43123'
    });
    expect(spawnOperation.mock.calls[0]?.[0]).not.toMatch(/(?:^|\/)npx$/u);
    expect(spawnOperation.mock.calls[0]?.[1]?.[0]).not.toBe('playwright');

    child.emit('exit', 0, null);
    expect(exitOperation).toHaveBeenCalledWith(0);
    expect(signalOperation).not.toHaveBeenCalled();
  });

  it('preserves an explicit config and caller-provided reserved port', async () => {
    vi.stubEnv('PLAYWRIGHT_WEB_SERVER_PORT', '43124');
    const child = new EventEmitter();
    const spawnOperation = vi.fn<SpawnOperation>(() => child);
    const reservePortOperation = vi.fn<ReservePortOperation>(() => Promise.resolve('unused'));
    const module = await loadRunPlaywright();

    await module.runPlaywright(
      [
        'test',
        'tests/e2e/optionsIncrementalRender.browser.test.ts',
        '--config=playwright.reader.config.ts'
      ],
      {
        spawnOperation,
        reservePortOperation,
        exitOperation: vi.fn(),
        signalOperation: vi.fn()
      }
    );

    expect(reservePortOperation).not.toHaveBeenCalled();
    expect(spawnOperation.mock.calls[0]?.[1]).toEqual([
      module.PLAYWRIGHT_CLI_PATH,
      'test',
      'tests/e2e/optionsIncrementalRender.browser.test.ts',
      '--config=playwright.reader.config.ts'
    ]);
    expect(spawnOperation.mock.calls[0]?.[2]?.env).toMatchObject({
      PLAYWRIGHT_WEB_SERVER_PORT: '43124'
    });
  });

  it('propagates signals and launch failures without masking them', async () => {
    vi.stubEnv('PLAYWRIGHT_WEB_SERVER_PORT', '43125');
    const module = await loadRunPlaywright();
    const signalChild = new EventEmitter();
    const signalOperation = vi.fn();
    const signalExitOperation = vi.fn();

    await module.runPlaywright(['test', '--config=playwright.config.ts'], {
      spawnOperation: () => signalChild,
      exitOperation: signalExitOperation,
      signalOperation
    });
    signalChild.emit('exit', null, 'SIGTERM');
    expect(signalOperation).toHaveBeenCalledWith('SIGTERM');
    expect(signalExitOperation).not.toHaveBeenCalled();

    const errorChild = new EventEmitter();
    const errorOperation = vi.fn();
    const errorExitOperation = vi.fn();
    await module.runPlaywright(['test', '--config=playwright.config.ts'], {
      spawnOperation: () => errorChild,
      exitOperation: errorExitOperation,
      signalOperation: vi.fn(),
      errorOperation
    });
    const launchError = new Error('spawn failed');
    errorChild.emit('error', launchError);
    expect(errorOperation).toHaveBeenCalledWith(
      '[run-playwright] Failed to launch Playwright:',
      launchError
    );
    expect(errorExitOperation).toHaveBeenCalledWith(1);
  });
});
