import { describe, expect, it, vi } from 'vitest';
import { createProductionStitchActionTaskOwner } from '../../../src/options/app/productionStitchActionTaskOwner';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('productionStitchActionTaskOwner', () => {
  it('runs same-key tasks in dispatch order after success', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const first = deferred<void>();
    const second = deferred<void>();
    const secondStarted = deferred<void>();
    const events: string[] = [];

    owner.run({
      key: 'theme',
      capture: () => {
        events.push('capture:first');
        return 'dark';
      },
      task: () => {
        events.push('start:first');
        return first.promise;
      },
      rollback: vi.fn(),
      onSuccess: () => events.push('success:first')
    });
    owner.run({
      key: 'theme',
      capture: () => {
        events.push('capture:second');
        return 'light';
      },
      task: () => {
        events.push('start:second');
        secondStarted.resolve();
        return second.promise;
      },
      rollback: vi.fn(),
      onSuccess: () => events.push('success:second')
    });

    expect(events).toEqual(['capture:first', 'start:first']);
    first.resolve();
    await secondStarted.promise;
    expect(events).toEqual([
      'capture:first',
      'start:first',
      'success:first',
      'capture:second',
      'start:second'
    ]);
    second.resolve();
    await owner.waitForIdle();

    expect(events.at(-1)).toBe('success:second');
  });

  it('rolls back a rejected head before capturing and starting its successor', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const first = deferred<void>();
    const second = deferred<void>();
    const secondStarted = deferred<void>();
    const secondCapture = vi.fn();
    let theme = 'dark';

    owner.run({
      key: 'theme',
      capture: () => theme,
      task: () => {
        theme = 'light';
        return first.promise;
      },
      rollback: (snapshot) => {
        theme = snapshot;
      }
    });
    owner.run({
      key: 'theme',
      capture: () => {
        secondCapture(theme);
        return theme;
      },
      task: () => {
        theme = 'system';
        secondStarted.resolve();
        return second.promise;
      },
      rollback: (snapshot) => {
        theme = snapshot;
      }
    });

    expect(secondCapture).not.toHaveBeenCalled();
    first.reject(new Error('first failed'));
    await secondStarted.promise;
    expect(secondCapture).toHaveBeenCalledWith('dark');
    expect(theme).toBe('system');
    second.reject(new Error('second failed'));
    await owner.waitForIdle();

    expect(theme).toBe('dark');
  });

  it('runs different task keys concurrently', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const theme = deferred<void>();
    const usage = deferred<void>();
    const starts: string[] = [];

    owner.run({
      key: 'theme',
      capture: () => null,
      task: () => {
        starts.push('theme');
        return theme.promise;
      },
      rollback: vi.fn()
    });
    owner.run({
      key: 'usage',
      capture: () => null,
      task: () => {
        starts.push('usage');
        return usage.promise;
      },
      rollback: vi.fn()
    });

    expect(starts).toEqual(['theme', 'usage']);
    theme.resolve();
    usage.resolve();
    await owner.waitForIdle();
  });

  it('waits for running and queued tasks', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const first = deferred<void>();
    const second = deferred<void>();
    const secondStarted = deferred<void>();
    let idle = false;

    owner.run({ key: 'theme', capture: () => null, task: () => first.promise, rollback: vi.fn() });
    owner.run({
      key: 'theme',
      capture: () => null,
      task: () => {
        secondStarted.resolve();
        return second.promise;
      },
      rollback: vi.fn()
    });
    const waiting = owner.waitForIdle().then(() => {
      idle = true;
    });

    await Promise.resolve();
    expect(idle).toBe(false);
    first.resolve();
    await secondStarted.promise;
    expect(idle).toBe(false);
    second.resolve();
    await waiting;
    expect(idle).toBe(true);
  });

  it('suppresses running callbacks and prevents queued starts after disposal', async () => {
    const owner = createProductionStitchActionTaskOwner();
    const running = deferred<void>();
    const onSuccess = vi.fn();
    const queuedCapture = vi.fn(() => null);
    const queuedTask = vi.fn(() => Promise.resolve());
    owner.run({
      key: 'theme',
      capture: () => null,
      task: () => running.promise,
      rollback: vi.fn(),
      onSuccess
    });
    owner.run({
      key: 'theme',
      capture: queuedCapture,
      task: queuedTask,
      rollback: vi.fn()
    });
    owner.dispose();
    running.resolve();
    await owner.waitForIdle();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(queuedCapture).not.toHaveBeenCalled();
    expect(queuedTask).not.toHaveBeenCalled();
  });
});
