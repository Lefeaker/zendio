import type { ContextMenuListenerDependencies } from './contextMenusTypes';
import type { ScriptInjectionTarget } from '../../platform/interfaces/scripting';

type ContentRuntimeReadyResult =
  | { ready: true }
  | { ready: false; reason: string; message?: string };

type ContentRuntimeProbeInjectionResult = {
  result?: object | null;
};

type ContentRuntimeGlobal = typeof globalThis & {
  __AIIINOB_CONTENT_RUNTIME_PROMISE__?: PromiseLike<object>;
};

function waitForContentRuntimeReadyInPage():
  | Promise<ContentRuntimeReadyResult>
  | ContentRuntimeReadyResult {
  const timeoutMs = 3000;
  const promiseKey = '__AIIINOB_CONTENT_RUNTIME_PROMISE__';
  const hasReadyFlag = (): boolean =>
    document.documentElement?.dataset?.aiobContentRuntime === 'true';
  const runtimePromise =
    promiseKey === '__AIIINOB_CONTENT_RUNTIME_PROMISE__'
      ? (globalThis as ContentRuntimeGlobal).__AIIINOB_CONTENT_RUNTIME_PROMISE__
      : undefined;

  if (!runtimePromise || typeof runtimePromise.then !== 'function') {
    return {
      ready: false,
      reason: 'missing-runtime-promise'
    };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const clearReadyTimeout = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return Promise.race<ContentRuntimeReadyResult>([
    Promise.resolve(runtimePromise).then(
      () => {
        clearReadyTimeout();
        return hasReadyFlag()
          ? { ready: true }
          : {
              ready: false,
              reason: 'runtime-ready-flag-missing'
            };
      },
      (error) => {
        clearReadyTimeout();
        return {
          ready: false,
          reason: 'runtime-import-rejected',
          message: error instanceof Error ? error.message : String(error)
        };
      }
    ),
    new Promise<ContentRuntimeReadyResult>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          ready: false,
          reason: 'runtime-ready-timeout'
        });
      }, timeoutMs);
    })
  ]);
}

function isContentRuntimeReadyResult(
  value: object | null | undefined
): value is ContentRuntimeReadyResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const ready = 'ready' in value ? value.ready : undefined;
  const reason = 'reason' in value ? value.reason : undefined;
  if (ready === true) {
    return true;
  }
  return ready === false && typeof reason === 'string';
}

function formatContentRuntimeReadyFailure(result: ContentRuntimeReadyResult | undefined): string {
  if (!result) {
    return 'content runtime readiness check returned no result';
  }
  if (result.ready) {
    return 'content runtime is ready';
  }
  return result.message ? `${result.reason}: ${result.message}` : result.reason;
}

export async function ensureContentRuntimeReady(
  dependencies: ContextMenuListenerDependencies,
  target: ScriptInjectionTarget
): Promise<void> {
  const results = await dependencies.scripting.executeScript({
    target,
    world: 'ISOLATED',
    func: waitForContentRuntimeReadyInPage
  });

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(formatContentRuntimeReadyFailure(undefined));
  }

  const failures: Array<ContentRuntimeReadyResult | undefined> = [];
  for (const entry of results as ContentRuntimeProbeInjectionResult[]) {
    const result = entry.result;
    if (!isContentRuntimeReadyResult(result)) {
      failures.push(undefined);
      continue;
    }
    if (!result.ready) {
      failures.push(result);
    }
  }

  if (failures.length > 0) {
    throw new Error(formatContentRuntimeReadyFailure(failures[0]));
  }
}
