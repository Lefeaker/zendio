import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import {
  createOptionsDraftSession,
  type OptionsMutationIntent
} from '@options/app/optionsDraftSession';
import { OPTIONS_PATCH_PATHS, optionsPathKey } from '@options/state/optionsPatchModel';

const clone = <T>(value: T): T => structuredClone(value);

function baseline(): CompleteOptions {
  return mergeOptions({});
}

function requireIntent(value: OptionsMutationIntent | null): OptionsMutationIntent {
  expect(value).not.toBeNull();
  if (value === null) throw new Error('EXPECTED_OPTIONS_MUTATION_INTENT');
  return value;
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

  it('creates independent screenshot attachment leaf patches in registry order', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.video.screenshotAttachment.locationTemplate = './assets/local';
    local.video.screenshotAttachment.fileNameTemplate = 'local.jpg';
    session.captureLocalDraft(local);

    expect(session.createIntent()?.patches).toEqual([
      {
        path: ['video', 'screenshotAttachment', 'locationTemplate'],
        value: './assets/local'
      },
      {
        path: ['video', 'screenshotAttachment', 'fileNameTemplate'],
        value: 'local.jpg'
      }
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
    const intent = requireIntent(session.createIntent());
    session.admit(intent);

    const remote = clone(initial);
    remote.interfaceTheme = 'dark';
    session.observeAuthoritative(remote);

    const oldAck = clone(initial);
    oldAck.fragmentClipper.captureContext = local.fragmentClipper.captureContext;
    session.acknowledge(intent, oldAck);

    expect(session.getWorkingDraft().interfaceTheme).toBe('dark');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('does not let an old acknowledgement replace later same-path authority', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);
    const intent = requireIntent(session.createIntent());
    session.admit(intent);

    const written = clone(initial);
    written.fragmentClipper.captureContext = true;
    session.observeAuthoritative(written);
    const remote = clone(written);
    remote.fragmentClipper.captureContext = false;
    remote.interfaceTheme = 'dark';
    session.observeAuthoritative(remote);

    const oldAck = clone(initial);
    oldAck.fragmentClipper.captureContext = true;
    session.acknowledge(intent, oldAck);

    expect(session.getAuthoritativeSnapshot().fragmentClipper.captureContext).toBe(false);
    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(false);
    expect(session.getWorkingDraft().interfaceTheme).toBe('dark');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('settles without resurrecting a write when authority already satisfies the sent value', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);
    const intent = requireIntent(session.createIntent());
    session.admit(intent);

    session.observeAuthoritative(local);
    session.acknowledge(intent, local);

    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(true);
    expect(session.getDirtyPathKeys()).toEqual([]);
    expect(session.createIntent()).toBeNull();
  });

  it('preserves a newer edit generation when the older generation is acknowledged', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.aiChat.userName = 'first';
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    const second = clone(first);
    second.aiChat.userName = 'second';
    session.captureLocalDraft(second);
    const secondIntent = requireIntent(session.createIntent());

    const firstAck = clone(initial);
    firstAck.aiChat.userName = 'first';
    session.acknowledge(firstIntent, firstAck);
    expect(session.observeAuthoritative(firstAck).changed).toBe(false);

    expect(session.getWorkingDraft().aiChat.userName).toBe('second');
    expect(secondIntent.patches).toEqual([{ path: ['aiChat', 'userName'], value: 'second' }]);
    session.admit(secondIntent);
    session.acknowledge(secondIntent, second);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('second');
    expect(session.getWorkingDraft().aiChat.userName).toBe('second');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('does not classify an admitted value observation as external to a queued reversal', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.fragmentClipper.captureContext = true;
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    session.captureLocalDraft(initial);
    const reversalIntent = requireIntent(session.createIntent());
    session.observeAuthoritative(first);
    session.acknowledge(firstIntent, first);
    session.admit(reversalIntent);
    session.acknowledge(reversalIntent, initial);

    expect(session.getAuthoritativeSnapshot().fragmentClipper.captureContext).toBe(false);
    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(false);
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('keeps external same-path authority observed between queued acknowledgements', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.aiChat.userName = 'first';
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    const second = clone(first);
    second.aiChat.userName = 'second';
    session.captureLocalDraft(second);
    const secondIntent = requireIntent(session.createIntent());
    session.acknowledge(firstIntent, first);

    const remote = clone(first);
    remote.aiChat.userName = 'remote';
    session.observeAuthoritative(remote);
    session.admit(secondIntent);
    session.acknowledge(secondIntent, second);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('remote');
    expect(session.getWorkingDraft().aiChat.userName).toBe('remote');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('retains edit C while queued B settles and then acknowledges C', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.aiChat.userName = 'first';
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    const second = clone(first);
    second.aiChat.userName = 'second';
    session.captureLocalDraft(second);
    const secondIntent = requireIntent(session.createIntent());
    session.acknowledge(firstIntent, first);

    const third = clone(second);
    third.aiChat.userName = 'third';
    session.captureLocalDraft(third);
    session.admit(secondIntent);
    session.acknowledge(secondIntent, second);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('second');
    expect(session.getWorkingDraft().aiChat.userName).toBe('third');
    expect(session.getDirtyPathKeys()).toEqual(['aiChat.userName']);

    const thirdIntent = requireIntent(session.createIntent());
    session.admit(thirdIntent);
    session.acknowledge(thirdIntent, third);
    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('third');
    expect(session.getWorkingDraft().aiChat.userName).toBe('third');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('classifies own and external paths independently in one repository observation', () => {
    const initial = baseline();
    initial.interfaceTheme = 'system';
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.aiChat.userName = 'first';
    first.interfaceTheme = 'dark';
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    const second = clone(first);
    second.aiChat.userName = 'second';
    session.captureLocalDraft(second);
    const secondIntent = requireIntent(session.createIntent());

    const observed = clone(first);
    observed.interfaceTheme = 'light';
    session.observeAuthoritative(observed);
    session.acknowledge(firstIntent, first);
    session.admit(secondIntent);
    session.acknowledge(secondIntent, second);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('second');
    expect(session.getAuthoritativeSnapshot().interfaceTheme).toBe('light');
    expect(session.getWorkingDraft().aiChat.userName).toBe('second');
    expect(session.getWorkingDraft().interfaceTheme).toBe('light');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('keeps a user reversal as a newer generation while the changed value is admitted', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const first = clone(initial);
    first.fragmentClipper.captureContext = true;
    session.captureLocalDraft(first);
    const firstIntent = requireIntent(session.createIntent());
    session.admit(firstIntent);

    session.captureLocalDraft(initial);
    expect(session.createIntent()?.patches).toEqual([
      { path: ['fragmentClipper', 'captureContext'], value: false }
    ]);

    session.acknowledge(firstIntent, first);
    expect(session.getWorkingDraft().fragmentClipper.captureContext).toBe(false);
    expect(session.getDirtyPathKeys()).toEqual(['fragmentClipper.captureContext']);
  });

  it('retains dirty ownership on failure and drops it on user reversal', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.interfaceTheme = 'dark';
    session.captureLocalDraft(local);
    const intent = requireIntent(session.createIntent());

    session.admit(intent);
    session.fail(intent);
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
    const failed = requireIntent(session.createIntent());
    session.admit(failed);
    session.fail(failed);

    session.captureLocalDraft(clone(local));
    const retried = session.createIntent();

    expect(retried?.admissionGeneration).toBeGreaterThan(failed.admissionGeneration);
    expect(retried?.patches).toEqual(failed?.patches);
  });

  it('captures current external authority when retrying a failed admission', () => {
    const initial = baseline();
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.aiChat.userName = 'local';
    session.captureLocalDraft(local);
    const failed = requireIntent(session.createIntent());
    session.admit(failed);
    session.fail(failed);

    const remote = clone(initial);
    remote.aiChat.userName = 'remote';
    session.observeAuthoritative(remote);
    session.captureLocalDraft(local);
    const retried = requireIntent(session.createIntent());
    session.admit(retried);
    session.acknowledge(retried, local);

    expect(session.getAuthoritativeSnapshot().aiChat.userName).toBe('local');
    expect(session.getWorkingDraft().aiChat.userName).toBe('local');
    expect(session.getDirtyPathKeys()).toEqual([]);
  });

  it('clears failed no-op ownership when the authoritative base already matches', () => {
    const initial = baseline();
    initial.fragmentClipper.captureContext = false;
    const session = createOptionsDraftSession(initial);
    const local = clone(initial);
    local.fragmentClipper.captureContext = true;
    session.captureLocalDraft(local);
    const failed = requireIntent(session.createIntent());
    session.admit(failed);
    session.fail(failed);

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
    const local = { ...clone(initial), futureSetting: true };

    expect(() => session.captureLocalDraft(local)).toThrow('UNREGISTERED_OPTIONS_DRAFT_PATH');
  });
});
