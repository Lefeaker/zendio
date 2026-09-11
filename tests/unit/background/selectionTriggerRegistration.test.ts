import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RegisteredContentScript,
  ScriptingService
} from '../../../src/platform/interfaces/scripting';
import { createContextMenuRuntimeState } from '../../../src/background/listeners/contextMenusTypes';
import { refreshSelectionTriggerInjection } from '../../../src/background/listeners/contextMenuInjection';

type Policy = {
  fragmentClipper: {
    selectionTriggerMode: 'disabled' | 'direct' | 'modifier';
    selectionModifierKeys: Array<'shift'>;
  };
};
const getOptions = vi.hoisted(() => vi.fn<() => Promise<Policy>>());
vi.mock('../../../src/background/store', () => ({ getOptions }));
const id = 'zendio-selection-trigger';
function policy(
  mode: Policy['fragmentClipper']['selectionTriggerMode'] = 'modifier',
  keys: Array<'shift'> = ['shift']
): Policy {
  return { fragmentClipper: { selectionTriggerMode: mode, selectionModifierKeys: keys } };
}
function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Deferred not initialized');
      complete(value);
    }
  };
}
function fixture() {
  const scripts = new Map<string, RegisteredContentScript>();
  const register = vi.fn(
    (values: Parameters<NonNullable<ScriptingService['registerContentScripts']>>[0]) => {
      for (const value of values) scripts.set(value.id, structuredClone(value));
      return Promise.resolve();
    }
  );
  const unregister = vi.fn(({ ids }: { ids: string[] }) => {
    for (const key of ids) scripts.delete(key);
    return Promise.resolve();
  });
  const scripting: ScriptingService = {
    executeScript: () => Promise.resolve([]),
    getRegisteredContentScripts: ({ ids }) =>
      Promise.resolve(
        ids.flatMap((key) => {
          const value = scripts.get(key);
          return value ? [value] : [];
        })
      ),
    registerContentScripts: register,
    unregisterContentScripts: unregister
  };
  return { scripts, scripting, register, unregister, state: createContextMenuRuntimeState() };
}

beforeEach(() => {
  getOptions.mockReset().mockResolvedValue(policy());
});

describe('selection trigger document-ready registration', () => {
  it('registers the existing loader once and removes only its own script when disabled', async () => {
    const f = fixture();
    f.scripts.set('unrelated-script', { id: 'unrelated-script' });
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    expect(f.register).toHaveBeenCalledTimes(1);
    expect(f.scripts.get(id)).toMatchObject({
      runAt: 'document_end',
      allFrames: true,
      js: ['content/index.js'],
      persistAcrossSessions: true
    });
    getOptions.mockResolvedValue(policy('disabled', []));
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    expect(f.scripts.has(id)).toBe(false);
    expect(f.scripts.has('unrelated-script')).toBe(true);
    expect(f.state.selectionTriggerInjectionEnabled).toBe(false);
  });

  it('cannot reinstate an old enabled policy when its settings read arrives late', async () => {
    const f = fixture();
    const late = deferred<Policy>();
    getOptions.mockReturnValueOnce(late.promise).mockResolvedValueOnce(policy('disabled', []));
    const old = refreshSelectionTriggerInjection(f.state, f.scripting);
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    late.resolve(policy());
    await old;
    expect(f.register).not.toHaveBeenCalled();
    expect(f.state.selectionTriggerInjectionEnabled).toBe(false);
  });

  it('finishes a pending native registration before applying a newer disable operation', async () => {
    const f = fixture();
    const pending = deferred<void>();
    const register = f.register.getMockImplementation();
    if (!register) throw new Error('Native registration fixture missing');
    f.register.mockImplementationOnce(async (values) => {
      await register(values);
      await pending.promise;
    });
    const enabling = refreshSelectionTriggerInjection(f.state, f.scripting);
    await vi.waitFor(() => expect(f.register).toHaveBeenCalledTimes(1));
    getOptions.mockResolvedValue(policy('disabled', []));
    const disabling = refreshSelectionTriggerInjection(f.state, f.scripting);
    pending.resolve();
    await Promise.all([enabling, disabling]);
    expect(f.scripts.has(id)).toBe(false);
    expect(f.unregister).toHaveBeenCalledWith({ ids: [id] });
  });

  it('leaves unsupported adapters on the existing injection path', async () => {
    const state = createContextMenuRuntimeState();
    await refreshSelectionTriggerInjection(state, { executeScript: () => Promise.resolve([]) });
    expect(state.selectionTriggerInjectionEnabled).toBe(true);
  });

  it('requires a modifier key but permits direct mode without one', async () => {
    const f = fixture();
    getOptions.mockResolvedValue(policy('modifier', []));
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    expect(f.scripts.has(id)).toBe(false);
    getOptions.mockResolvedValue(policy('direct', []));
    await refreshSelectionTriggerInjection(f.state, f.scripting);
    expect(f.scripts.has(id)).toBe(true);
  });
});
