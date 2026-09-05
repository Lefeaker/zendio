import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { CompleteOptions } from '@shared/types/options';
import { createOptionsDraftSession } from '@options/app/optionsDraftSession';
import { OPTIONS_PATCH_PATHS, optionsPathKey } from '@options/state/optionsPatchModel';

const clone = <T>(value: T): T => structuredClone(value);

function baseline(): CompleteOptions {
  return clone(DEFAULT_OPTIONS as CompleteOptions);
}

describe('OptionsDraftSession', () => {
  it('keeps one canonical key for every writable path', () => {
    const keys = OPTIONS_PATCH_PATHS.map(optionsPathKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('owns the optional classifier timeout through the same canonical path model', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.classifier.timeoutMs = 12_000;
    session.captureLocalDraft(local);

    expect(session.createIntent()?.patches).toEqual([
      { path: ['classifier', 'timeoutMs'], value: 12_000 }
    ]);
  });

  it('rebases remote non-dirty fields and emits only the locally owned path', () => {
    const initial = baseline();
    initial.interfaceTheme = 'system';
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);

    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);

    const remote = clone(initial);
    remote.interfaceTheme = 'dark';
    session.observeAuthoritative(remote);

    expect(session.getWorkingDraft().interfaceTheme).toBe('dark');
    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(true);
    expect(session.createIntent()?.patches).toEqual([
      { path: ['fragmentClipper', 'captureContext'], value: true }
    ]);
  });

  it('keeps same-path local ownership over a newer authoritative base', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.aiChat.userName = 'local';
    session.captureLocalDraft(local);

    const remote = clone(initial);
    remote.aiChat.userName = 'remote';
    session.observeAuthoritative(remote);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('remote');
    expect(session.getWorkingDraft().aiChat.userName).toBe('local');
    expect(session.getDirtyPathKeys()).toEqual(['aiChat.userName']);
  });

  it('does not let an older acknowledgement roll back a later non-dirty revision', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = !initial.fragmentClipper.captureContext;
    session.captureLocalDraft(local);
    const intent = session.createIntent();
    expect(intent).not.toBeNull();
    session.admit(intent!);

    const remote = clone(initial);
    remote.interfaceTheme = 'dark';
    session.observeAuthoritative(remote);

    const oldAck = clone(initial);
    oldAck.fragmentClipper.captureContext = local.fragmentClipper.captureContext;
    session.acknowledge(intent!, oldAck);

    expect(session.getWorkingDraft().interfaceTheme).toBe('dark');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('preserves a newer edit generation when the older generation is acknowledged', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.aiChat.userName = 'first';
    session.captureLocalDraft(first);
    const firstIntent = session.createIntent();
    expect(firstIntent).not.toBeNull();
    session.admit(firstIntent!);

    const second = clone(first);
    second.aiChat.userName = 'second';
    session.captureLocalDraft(second);

    const firstAck = clone(initial);
    firstAck.aiChat.userName = 'first';
    session.acknowledge(firstIntent!, firstAck);

    expect(session.getWorkingDraft().aiChat.userName).toBe('second');
    expect(session.createIntent()?.patches).toEqual([
      { path: ['aiChat', 'userName'], value: 'second' }
    ]);
  });

  it('keeps a user reversal as a newer generation while the changed value is admitted', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.fragmentClipper.captureContext = true;
    session.captureLocalDraft(first);
    const firstIntent = session.createIntent();
    expect(firstIntent).not.toBeNull();
    session.admit(firstIntent!);

    session.captureLocalDraft(initial);
    expect(session.createIntent()?.patches).toEqual([
      { path: ['fragmentClipper', 'captureContext'], value: false }
    ]);

    session.acknowledge(firstIntent!, first);
    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(false);
    expect(session.getDirtyPathKeys()).toEqual(['fragmentClipper.captureContext']);
  });

  it('retains dirty ownership on failure and drops it on user reversal', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.interfaceTheme = 'dark';
    session.captureLocalDraft(local);
    const intent = session.createIntent();
    expect(intent).not.toBeNull();

    session.admit(intent!);
    session.fail(intent!);
    expect(session.getDirtyPathKeys()).toEqual(['interfaceTheme']);

    session.captureLocalDraft(initial);
    expect(session.getDirtyPathKeys()).toEqual([]);
    expect(session.createIntent()).toBeNull();
  });

  it('creates a newer admission after failure even when the collected draft is identical', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);
    const failed = session.createIntent();
    expect(failed).not.toBeNull();
    session.admit(failed!);
    session.fail(failed!);

    session.captureLocalDraft(clone(local));
    const retried = session.createIntent();

    expect(retried?.admissionGeneration).toBeGreaterThan(failed!.admissionGeneration);
    expect(retried?.patches).toEqual(failed?.patches);
  });

  it('clears failed no-op ownership when the authoritative base already matches', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);
    const failed = session.createIntent();
    expect(failed).not.toBeNull();
    session.admit(failed!);
    session.fail(failed!);

    session.observeAuthoritative(local);

    expect(session.getDirtyPathKeys()).toEqual([]);
    expect(session.createIntent()).toBeNull();
  });

  it('ignores identical notifications and strict reset clears all dirty generations', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const revision = session.getRevision();

    expect(session.observeAuthoritative(clone(initial)).changed).toBe(false);
    expect(session.getRevision()).toBe(revision);

    const local = clone(initial);
    local.interfaceTheme = 'dark';
    session.captureLocalDraft(local);
    const imported = clone(initial);
    imported.interfaceTheme = 'light';
    session.resetAuthoritative(imported);

    expect(session.getWorkingDraft().interfaceTheme).toBe('light');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('fails closed when a draft changes a path outside the canonical registry', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial) as CompleteOptions & { futureSetting?: boolean };
    local.futureSetting = true;

    expect(() => session.captureLocalDraft(local)).toThrow('UNREGISTERED_OPTIONS_DRAFT_PATH');
  });
});
