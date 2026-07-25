import { describe, expect, it } from 'vitest';

import { createSessionDraftMutationQueue } from '../../../src/background/services/sessionDraftMutationQueue';

class Deferred<T> {
  readonly promise: Promise<T>;
  private settle: ((value: T) => void) | undefined;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.settle = resolve;
    });
  }

  resolve(value: T): void {
    const settle = this.settle;
    if (!settle) {
      throw new Error('Deferred promise has already been resolved.');
    }
    this.settle = undefined;
    settle(value);
  }
}

describe('sessionDraftMutationQueue', () => {
  it('runs independently scheduled operations in FIFO order and returns each result', async () => {
    const queue = createSessionDraftMutationQueue();
    const firstGate = new Deferred<void>();
    const events: string[] = [];

    const first = queue.run(async () => {
      events.push('first:start');
      await firstGate.promise;
      events.push('first:end');
      return { id: 'first' };
    });
    const second = queue.run(() => {
      events.push('second');
      return Promise.resolve(2);
    });
    const third = queue.run(() => {
      events.push('third');
      return Promise.resolve('third-result');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    firstGate.resolve(undefined);

    await expect(first).resolves.toEqual({ id: 'first' });
    await expect(second).resolves.toBe(2);
    await expect(third).resolves.toBe('third-result');
    expect(events).toEqual(['first:start', 'first:end', 'second', 'third']);
  });

  it('returns an operation rejection without poisoning the next queued operation', async () => {
    const queue = createSessionDraftMutationQueue();
    const failureGate = new Deferred<void>();
    const failure = new Error('storage failed');
    const events: string[] = [];

    const rejected = queue.run(async () => {
      events.push('failed:start');
      await failureGate.promise;
      events.push('failed:reject');
      throw failure;
    });
    const recovered = queue.run(() => {
      events.push('recovered');
      return Promise.resolve('saved');
    });

    await Promise.resolve();
    expect(events).toEqual(['failed:start']);

    const rejectionAssertion = expect(rejected).rejects.toBe(failure);
    failureGate.resolve(undefined);

    await rejectionAssertion;
    await expect(recovered).resolves.toBe('saved');
    expect(events).toEqual(['failed:start', 'failed:reject', 'recovered']);
  });

  it('continues when an operation throws before returning a promise', async () => {
    const queue = createSessionDraftMutationQueue();
    const failure = new Error('validation failed');
    const events: string[] = [];

    const rejected = queue.run<never>(() => {
      events.push('failed');
      throw failure;
    });
    const recovered = queue.run(() => {
      events.push('recovered');
      return Promise.resolve('continued');
    });

    await expect(rejected).rejects.toBe(failure);
    await expect(recovered).resolves.toBe('continued');
    expect(events).toEqual(['failed', 'recovered']);
  });
});
