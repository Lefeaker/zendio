import { readFileSync } from 'node:fs';
import { constants, runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const buildSource = readFileSync(new URL('../../../scripts/build.mjs', import.meta.url), 'utf8');
function readLoaderSource(): string {
  const source = buildSource.match(
    /const CONTENT_LOADER_SOURCE = `([\s\S]*?)`\.trimStart\(\);/
  )?.[1];
  if (!source) throw new Error('Content loader build definition is missing.');
  return source;
}
const loaderSource = readLoaderSource();
const runtimeKey = '__AIIINOB_CONTENT_RUNTIME_PROMISE__';

type RuntimeApi = { runtime: { getURL(path: string): string } };
interface LoaderContext {
  chrome?: RuntimeApi;
  browser?: RuntimeApi;
  console: { error: ReturnType<typeof vi.fn> };
  [runtimeKey]?: Promise<object>;
}

function runLoader(context: LoaderContext): Promise<object> {
  runInNewContext(loaderSource, context, {
    importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER
  });
  const pending = context[runtimeKey];
  if (!pending) throw new Error('Content loader did not retain its pending initialization.');
  return pending;
}

const browsers: Array<'chrome' | 'browser'> = ['chrome', 'browser'];
describe('generated content runtime loader', () => {
  it.each(browsers)(
    'resolves %s runtime through its extension URL and loads once',
    async (browser) => {
      const getURL = vi
        .fn<(path: string) => string>()
        .mockReturnValue('data:text/javascript,export const ready=true');
      const context: LoaderContext = {
        [browser]: { runtime: { getURL } },
        console: { error: vi.fn() }
      };
      const first = runLoader(context);
      const repeated = runLoader(context);
      await expect(first).resolves.toMatchObject({ ready: true });
      expect(repeated).toBe(first);
      expect(getURL).toHaveBeenCalledExactlyOnceWith('content/runtime.js');
    }
  );

  it('clears a failed import so the next user trigger can initialize again', async () => {
    const getURL = vi
      .fn<(path: string) => string>()
      .mockReturnValueOnce('data:text/javascript,throw new Error("fixture-loader-failure")')
      .mockReturnValue('data:text/javascript,export const ready=true');
    const context: LoaderContext = {
      browser: { runtime: { getURL } },
      console: { error: vi.fn() }
    };
    await expect(runLoader(context)).rejects.toThrow('fixture-loader-failure');
    expect(context[runtimeKey]).toBeUndefined();
    await expect(runLoader(context)).resolves.toMatchObject({ ready: true });
    expect(getURL).toHaveBeenCalledTimes(2);
  });
});
