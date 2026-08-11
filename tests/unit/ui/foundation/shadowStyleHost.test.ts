/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  ManagedShadowStyleHost,
  type ManagedStyleEntry
} from '../../../../src/ui/foundation/style-host';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createRoot({ connected = false }: { connected?: boolean } = {}) {
  const host = document.createElement('div');
  if (connected) {
    document.body.append(host);
  }
  return { host, root: host.attachShadow({ mode: 'open' }) };
}

const entry = (key: string, cssText: string): ManagedStyleEntry => ({ key, cssText, sheet: null });

describe('ManagedShadowStyleHost', () => {
  it('styles a valid detached pre-mount root and removes its fallback on disposal', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();

    const attachment = styleHost.attach(root, [entry('base', '.base { color: red; }')]);

    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });
    expect(root.querySelector('style[data-aiob-style-bridge="base"]')?.textContent).toContain(
      'color: red'
    );

    attachment.dispose();
    attachment.dispose();
    expect(root.querySelector('style[data-aiob-style-bridge="base"]')).toBeNull();
    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
  });

  it('settles ready immediately when disposed even if the loader never settles', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const never = new Promise<readonly ManagedStyleEntry[]>(() => undefined);
    const attachment = styleHost.attach(root, () => never);

    attachment.dispose();

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    expect(styleHost.getRegistrationCount()).toBe(0);
    expect(styleHost.getPendingCount()).toBe(0);
  });

  it('rejects late injection when a disposed detached root is mounted afterward', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { host, root } = createRoot();
    const pending = deferred<readonly ManagedStyleEntry[]>();
    const provider = vi.fn(() => pending.promise);
    const attachment = styleHost.attach(root, provider);

    attachment.dispose();
    document.body.append(host);
    pending.resolve([entry('base', '.late { color: red; }')]);
    await pending.promise;
    await Promise.resolve();

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    expect(styleHost.getRegistrationCount()).toBe(0);
    expect(styleHost.getPendingCount()).toBe(0);
    host.remove();
  });

  it('rejects late work for a formerly connected root without injecting styles', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { host, root } = createRoot({ connected: true });
    const pending = deferred<readonly ManagedStyleEntry[]>();
    const attachment = styleHost.attach(root, () => pending.promise);

    host.remove();
    pending.resolve([entry('base', '.late { color: red; }')]);

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_HOST_DISCONNECTED'
    });
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    expect(styleHost.getPendingCount()).toBe(0);
  });

  it('invalidates superseded async work and applies only the newest refresh', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const first = deferred<readonly ManagedStyleEntry[]>();
    const second = deferred<readonly ManagedStyleEntry[]>();
    const provider = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const attachment = styleHost.attach(root, provider);
    const refresh = attachment.refresh();

    first.resolve([entry('base', '.stale { color: red; }')]);
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_SUPERSEDED'
    });
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();

    second.resolve([entry('base', '.fresh { color: blue; }')]);
    await expect(refresh).resolves.toEqual({ status: 'ready' });
    expect(root.querySelector('[data-aiob-style-bridge]')?.textContent).toContain('color: blue');
    attachment.dispose();
  });

  it('prevents a slow older attachment from overwriting a newer handle', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const firstOlderEntries = deferred<readonly ManagedStyleEntry[]>();
    const secondOlderEntries = deferred<readonly ManagedStyleEntry[]>();
    const firstOlder = styleHost.attach(root, () => firstOlderEntries.promise);
    const secondOlder = styleHost.attach(root, () => secondOlderEntries.promise);
    const newer = styleHost.attach(root, [entry('base', '.newer { color: blue; }')]);

    expect(root.querySelector('[data-aiob-style-bridge]')?.textContent).toContain('color: blue');
    firstOlderEntries.resolve([entry('base', '.older { color: red; }')]);

    await expect(firstOlder.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_SUPERSEDED'
    });
    await expect(newer.ready).resolves.toEqual({ status: 'ready' });
    expect(root.querySelector('[data-aiob-style-bridge]')?.textContent).toContain('color: blue');
    newer.dispose();
    secondOlderEntries.resolve([entry('base', '.resurrected { color: green; }')]);
    await expect(secondOlder.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_SUPERSEDED'
    });
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    expect(styleHost.getRegistrationCount()).toBe(0);
  });

  it('preserves cascade order after clear and protects a newer owner from stale disposal', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const first = styleHost.attach(root, [
      entry('base', '.base { color: red; }'),
      entry('secondary', '.secondary { color: green; }')
    ]);
    await first.ready;

    root.replaceChildren(document.createElement('main'));
    await expect(first.refresh()).resolves.toEqual({ status: 'ready' });
    expect(
      Array.from(root.querySelectorAll<HTMLStyleElement>('style[data-aiob-style-bridge]')).map(
        (style) => style.dataset.aiobStyleBridge
      )
    ).toEqual(['base', 'secondary']);

    const newer = styleHost.attach(root, [entry('base', '.base { color: blue; }')]);
    await newer.ready;
    first.dispose();
    expect(root.querySelector('style[data-aiob-style-bridge="base"]')?.textContent).toContain(
      'color: blue'
    );
    newer.dispose();
    expect(root.querySelector('style[data-aiob-style-bridge="base"]')).toBeNull();
  });

  it('retries adopted stylesheet cleanup without discarding ownership', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const external = new CSSStyleSheet();
    const managed = new CSSStyleSheet();
    let adopted = [external];
    let blockRemoval = false;
    Object.defineProperty(root, 'adoptedStyleSheets', {
      configurable: true,
      get: () => adopted,
      set: (next: CSSStyleSheet[]) => {
        if (blockRemoval && !next.includes(managed)) throw new Error('blocked removal');
        adopted = next;
      }
    });
    const attachment = styleHost.attach(root, [{ key: 'base', cssText: '', sheet: managed }]);
    await attachment.ready;

    blockRemoval = true;
    attachment.dispose();
    expect(root.adoptedStyleSheets).toContain(managed);
    expect(styleHost.getRegistrationCount()).toBe(1);

    blockRemoval = false;
    attachment.dispose();
    expect(root.adoptedStyleSheets).toEqual([external]);
    expect(styleHost.getRegistrationCount()).toBe(0);
  });

  it('removes owned adopted styles without disturbing external sheets', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const external = new CSSStyleSheet();
    const managed = new CSSStyleSheet();
    Object.defineProperty(root, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: [external]
    });

    const attachment = styleHost.attach(root, [{ key: 'base', cssText: '', sheet: managed }]);

    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });
    expect(root.adoptedStyleSheets).toEqual([external, managed]);
    attachment.dispose();
    expect(root.adoptedStyleSheets).toEqual([external]);
  });

  it('unregisters a load failure and deliberately re-registers on refresh', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const provider = vi
      .fn<() => Promise<readonly ManagedStyleEntry[]>>()
      .mockRejectedValueOnce(new Error('secret raw css and user data'))
      .mockResolvedValueOnce([entry('base', '.retry {}')]);
    const attachment = styleHost.attach(root, provider);

    const result = await attachment.ready;

    expect(result).toEqual({ status: 'failed', code: 'STYLE_ASSET_LOAD_FAILED' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(styleHost.getRegistrationCount()).toBe(0);
    expect(styleHost.getPendingCount()).toBe(0);

    await expect(attachment.refresh()).resolves.toEqual({ status: 'ready' });
    expect(styleHost.getRegistrationCount()).toBe(1);
    attachment.dispose();
  });

  it('makes an unregistered failed handle terminal when the host is destroyed', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const provider = vi.fn(() => Promise.reject(new Error('load failed')));
    const attachment = styleHost.attach(root, provider);
    await attachment.ready;
    expect(styleHost.getRegistrationCount()).toBe(0);

    styleHost.destroy();

    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('deterministically disposes active attachments during host teardown', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const { root } = createRoot();
    const attachment = styleHost.attach(root, [entry('base', '.base {}')]);
    await attachment.ready;

    styleHost.destroy();

    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    expect(styleHost.getRegistrationCount()).toBe(0);
    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
  });

  it('leaves no registration or late injection after 100 connected pending cycles', async () => {
    const styleHost = new ManagedShadowStyleHost();
    const provider = vi.fn<() => Promise<readonly ManagedStyleEntry[]>>();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const pending = deferred<readonly ManagedStyleEntry[]>();
      provider.mockImplementationOnce(() => pending.promise);
      const { host, root } = createRoot({ connected: true });
      const attachment = styleHost.attach(root, provider);
      attachment.dispose();
      host.remove();
      pending.resolve([entry('base', '.late {}')]);
      await pending.promise;
      await Promise.resolve();
      await expect(attachment.ready).resolves.toEqual({
        status: 'failed',
        code: 'STYLE_ATTACHMENT_DISPOSED'
      });
      await expect(attachment.refresh()).resolves.toEqual({
        status: 'failed',
        code: 'STYLE_ATTACHMENT_DISPOSED'
      });
      expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    }

    expect(provider).toHaveBeenCalledTimes(100);
    expect(styleHost.getRegistrationCount()).toBe(0);
    expect(styleHost.getPendingCount()).toBe(0);
  });
});
