/** Process-local request controls; never serialized into runtime messages or drafts. */
export interface RequestDeadlineOptions {
  signal?: AbortSignal;
  deadlineAt?: number;
}

export class RequestInterruptedError extends Error {
  readonly failureCategory: 'timeout' | 'connection';

  constructor(readonly timedOut: boolean) {
    super(timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED');
    this.name = 'RequestInterruptedError';
    this.failureCategory = timedOut ? 'timeout' : 'connection';
  }
}

export interface ActiveRequest {
  signal: AbortSignal;
  check(): void;
}

/** Abort the transport and bound waiting even if a transport ignores AbortSignal. */
export async function withRequestDeadline<T>(
  timeoutMs: number,
  options: RequestDeadlineOptions,
  action: (request: ActiveRequest) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const deadlineAt = Math.min(Date.now() + timeoutMs, options.deadlineAt ?? Infinity);
  const abort = (timedOut: boolean) => controller.abort(new RequestInterruptedError(timedOut));
  const cancel = () => abort(false);
  const request: ActiveRequest = {
    signal: controller.signal,
    check() {
      if (Date.now() >= deadlineAt && !controller.signal.aborted) abort(true);
      controller.signal.throwIfAborted();
    }
  };
  let onAbort = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => abort(true), Math.max(0, deadlineAt - Date.now()));
  try {
    return await Promise.race([
      interrupted,
      Promise.resolve()
        .then(() => {
          request.check();
          return action(request);
        })
        .then((result) => {
          request.check();
          return result;
        })
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
