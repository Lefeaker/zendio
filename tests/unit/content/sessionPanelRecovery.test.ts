/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchContentRuntimeConnection } from '../../../src/content/runtime/contentRuntimeConnection';
import {
  disposeSessionPanelRecovery,
  refreshSessionPanelRecovery,
  setSessionPanelRecovery
} from '../../../src/content/shared/panels/sessionPanelRecovery';

function panel() {
  const host = document.createElement('div');
  host.id = 'aiob-reader-panel';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<span data-session-status>Ready</span>
    <textarea>Keep this note</textarea><input type="checkbox">
    <button data-action-id="reader:finish">Finish</button>
    <button data-action-id="reader:cancel">Cancel</button>`;
  document.body.append(host);
  const note = root.querySelector('textarea');
  const finish = root.querySelector<HTMLButtonElement>('[data-action-id="reader:finish"]');
  const cancel = root.querySelector<HTMLButtonElement>('[data-action-id="reader:cancel"]');
  const status = root.querySelector('[data-session-status]');
  if (!note || !finish || !cancel || !status) throw new Error('Recovery fixture is incomplete');
  return { host, root, note, finish, cancel, status };
}

afterEach(() => {
  disposeSessionPanelRecovery(document);
  document.body.innerHTML = '';
  delete document.documentElement.dataset.aiobContentRuntime;
});

describe('session panel recovery presentation', () => {
  it('makes a disconnected panel readable and exposes a labelled reload action', () => {
    const p = panel();
    let valid = true;
    const disconnect = vi.fn();
    const dispose = watchContentRuntimeConnection({
      document,
      window,
      runtime: { isContextValid: () => valid },
      disconnect
    });
    valid = false;
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.aiobContentRuntime).toBe('stale');
    expect(p.note.value).toBe('Keep this note');
    expect(p.note.readOnly).toBe(true);
    expect(p.root.querySelector('input')?.disabled).toBe(true);
    expect(p.finish.disabled).toBe(true);
    expect(p.cancel.disabled).toBe(false);
    expect(p.cancel.textContent).toMatch(/Reload/);
    setSessionPanelRecovery(document, 'reader', 'ready');
    expect(p.finish.disabled).toBe(true);
    dispose();
  });

  it('keeps cancellation available during startup without admitting edits', () => {
    const p = panel();
    setSessionPanelRecovery(document, 'reader', 'loading');
    expect(p.note.readOnly).toBe(true);
    expect(p.finish.disabled).toBe(true);
    expect(p.cancel.disabled).toBe(false);
    expect(p.cancel.textContent).toBe('Cancel');
    setSessionPanelRecovery(document, 'reader', 'ready');
    expect(p.note.readOnly).toBe(false);
    expect(p.finish.disabled).toBe(false);
  });

  it('keeps edits locked on retry and restores them only after the ending operation is abandoned', async () => {
    const p = panel();
    setSessionPanelRecovery(document, 'reader', 'busy');
    expect(p.finish.disabled).toBe(true);
    expect(p.cancel.disabled).toBe(true);
    setSessionPanelRecovery(document, 'reader', 'retry');
    expect(p.finish.disabled).toBe(false);
    expect(p.cancel.disabled).toBe(false);
    expect(p.note.readOnly).toBe(true);
    p.status.textContent = 'Stale asynchronous hint';
    refreshSessionPanelRecovery(document, 'reader');
    await vi.waitFor(() =>
      expect(p.root.querySelector('[data-session-status]')?.textContent).toMatch(/retry/i)
    );
    setSessionPanelRecovery(document, 'reader', 'ready');
    expect(p.note.readOnly).toBe(false);
    expect(p.root.querySelector('input')?.disabled).toBe(false);
    expect(p.note.value).toBe('Keep this note');
  });
});
