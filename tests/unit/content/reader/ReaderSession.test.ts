/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import '../../../setup/globalSetup';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import {
  __resetContentSessionRegistryForTests,
  getReaderSession,
  isReaderSessionActive,
  registerReaderSession
} from '@content/runtime/contentSessionRegistry';
import {
  createSessionContext,
  flushDraftPersistence,
  getSessionHarness
} from './readerSessionTestHarness';

describe('ReaderSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    document.documentElement.removeAttribute('data-aiob-reader-active');
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    __resetContentSessionRegistryForTests(document);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes a reader session and mounts the panel view', async () => {
    const context = createSessionContext();

    await context.session.initialize();

    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(document.documentElement.dataset.aiobReaderActive).toBe('true');
    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
    expect(context.environment.start).toHaveBeenCalledTimes(1);
    expect(context.getCallbacks()).toBeDefined();
    expect(context.view.updateCount).toHaveBeenLastCalledWith(0);
    expect(context.view.setHighlights).toHaveBeenLastCalledWith([], {});
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
  });

  it('uses the clipper-selected destination for the initial reader path preview', async () => {
    const context = createSessionContext();
    const content = document.getElementById('content')?.firstChild;
    if (!content) {
      throw new Error('content missing');
    }
    const range = document.createRange();
    range.selectNodeContents(content);

    await context.session.initialize({
      range,
      selectedHtml: 'Hello reader session world.',
      selectedText: 'Hello reader session world.',
      comment: '',
      destination: { kind: 'vault', vaultId: 'research' }
    });

    const [createdHighlight] = getSessionHarness(context.session).__testHighlights;
    expect(createdHighlight).toBeDefined();
    expect(context.view.setHighlights).toHaveBeenLastCalledWith(expect.any(Array), {
      focusHighlightId: createdHighlight?.id
    });
    expect(context.view.updateDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );
  });

  it('destroy delegates to cancel cleanup and resets mounted state', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    context.session.destroy();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
    });

    expect(context.environment.stop).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    expect(getReaderSession()).toBeNull();
    expect(document.documentElement.dataset.aiobReaderActive).toBeUndefined();
    expect(document.body.dataset.aiobReaderHighlight).toBeUndefined();
  });

  it('panel callbacks delegate to finish, cancel, delete, edit, and focus flows', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.dataset.readerHighlightId = 'h-1';
    wrapper.textContent = 'Hello';
    (
      wrapper as HTMLElement & { scrollIntoView: Mock<HTMLElement['scrollIntoView']> }
    ).scrollIntoView = vi.fn<HTMLElement['scrollIntoView']>();
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-1',
        selectedHtml: '<mark>Hello</mark>',
        selectedText: 'Hello',
        comment: 'memo',
        fragmentUrl: '#h-1',
        wrapper
      }
    ]);

    callbacks.onFocusHighlight('h-1');
    expect(wrapper.classList.contains('aiob-reader-highlight--focus')).toBe(true);

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-1', '  updated memo  '));
    await flushDraftPersistence();
    await editPromise;
    expect(context.view.finishEditing).toHaveBeenCalled();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.panel.hint);

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-1'));
    await flushDraftPersistence();
    await deletePromise;
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
    expect(context.view.updateHint).toHaveBeenLastCalledWith(
      DEFAULT_SESSION_MESSAGES.hintNoHighlights
    );

    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalled();
    });
  });

  it('start is a no-op when another session is already active', async () => {
    const context = createSessionContext();
    registerReaderSession({ id: 'existing-reader' }, document);

    await context.session.start();

    expect(context.environment.start).not.toHaveBeenCalled();
    expect(context.getCallbacks()).toBeUndefined();
    expect(context.view.updateCount).not.toHaveBeenCalled();
  });

  it('falls back to default reading config when repository loading fails', async () => {
    const context = createSessionContext();
    context.readerRepository.getReadingConfig.mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await context.session.initialize();

    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('reacts to injected reading config updates', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    context.emitReadingConfig({ exportMode: 'highlights', highlightTheme: 'neonGreen' });

    expect(document.body.dataset.aiobReaderHighlight).toBe('neonGreen');
  });
});
