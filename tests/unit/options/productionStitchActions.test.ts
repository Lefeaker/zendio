/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  createProductionStitchActions,
  type ProductionStitchActionContext
} from '../../../src/options/app/productionStitchActions';
import {
  resolveProductionStitchTaskInvalidation,
  resolveProductionStitchTaskOwner
} from '../../../src/options/app/productionStitchShellContext';
import { asType } from '../../utils/typeHelpers';

describe('production Stitch persistence action routing', () => {
  it('registers theme, privacy, usage reset, and import tasks with the detached task owner', async () => {
    const state = {
      interfaceThemePreference: 'system',
      previewTheme: 'light'
    };
    const pending: Promise<void>[] = [];
    const runPersistenceTask = vi.fn(
      (key: string, task: () => Promise<void>, captureRollback?: () => () => void) => {
        void captureRollback;
        void key;
        pending.push(task());
      }
    );
    const persistThemePreference = vi.fn(() => Promise.resolve());
    const persistPrivacyPreference = vi.fn(() => Promise.resolve());
    const resetUsageData = vi.fn(() => Promise.resolve());
    const importConfigurationWithStatus = vi.fn(() => Promise.resolve());
    const actions = createProductionStitchActions(
      asType<ProductionStitchActionContext>({
        getCurrentLanguage: () => 'en',
        getDraft: () => ({ interfaceTheme: 'system' }),
        getMessages: () => null,
        getState: () => state,
        isActive: () => true,
        runPersistenceTask,
        persistThemePreference,
        persistPrivacyPreference,
        resetUsageData,
        importConfigurationWithStatus,
        syncPreviewThemeControls: vi.fn(),
        refreshAppData: vi.fn(),
        render: vi.fn(),
        eventButton: () => null
      })
    );

    actions['preview:setTheme'](
      asType<Parameters<(typeof actions)['preview:setTheme']>[0]>({
        value: 'dark',
        mutate: (mutator: (next: typeof state) => void) => mutator(state)
      })
    );
    actions['overview:updatePrivacyConsent'](
      asType<Parameters<(typeof actions)['overview:updatePrivacyConsent']>[0]>({
        args: ['analytics'],
        value: true
      })
    );
    actions['overview:clearUsageData'](
      asType<Parameters<(typeof actions)['overview:clearUsageData']>[0]>({})
    );
    actions['maintenance:importConfig'](
      asType<Parameters<(typeof actions)['maintenance:importConfig']>[0]>({ value: undefined })
    );
    await Promise.all(pending);

    expect(runPersistenceTask.mock.calls.map(([key]) => key)).toEqual([
      'options:theme',
      'privacy:analytics',
      'usage:reset',
      'options:import'
    ]);
    expect(runPersistenceTask.mock.calls[0]?.[2]).toEqual(expect.any(Function));
    expect(persistThemePreference).toHaveBeenCalledWith('dark');
    expect(persistPrivacyPreference).toHaveBeenCalledWith('analytics', true);
    expect(resetUsageData).toHaveBeenCalledTimes(1);
    expect(importConfigurationWithStatus).toHaveBeenCalledWith(null);
  });

  it('owns local-folder clear as one pending durable action task', async () => {
    let releaseClear = (): void => undefined;
    const clearVaultLocalFolder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseClear = resolve;
        })
    );
    let ownedTask: (() => Promise<void>) | undefined;
    const runPersistenceTask = vi.fn(
      (_key: string, task: () => Promise<void>, _capture?: () => () => void) => {
        ownedTask = task;
      }
    );
    const actions = createProductionStitchActions(
      asType<ProductionStitchActionContext>({
        clearVaultLocalFolder,
        getDraft: () => ({}),
        getState: () => ({}),
        runPersistenceTask
      })
    );

    actions['storage:deleteLocalFolder'](
      asType<Parameters<(typeof actions)['storage:deleteLocalFolder']>[0]>({ args: [2] })
    );

    expect(runPersistenceTask).toHaveBeenCalledWith(
      'storage:deleteLocalFolder',
      expect.any(Function)
    );
    expect(clearVaultLocalFolder).not.toHaveBeenCalled();
    if (!ownedTask) throw new Error('Expected the clear action to register a durable task.');

    let settled = false;
    const running = ownedTask().then(() => {
      settled = true;
    });
    expect(clearVaultLocalFolder).toHaveBeenCalledTimes(1);
    expect(clearVaultLocalFolder).toHaveBeenCalledWith(2);
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseClear();
    await running;
    expect(settled).toBe(true);
    expect(clearVaultLocalFolder).toHaveBeenCalledTimes(1);
  });

  it('captures language rollback before the optimistic lane-head mutation', async () => {
    const state = { previewLanguage: 'en' };
    let activeLanguage = 'en';
    const queued: Array<{ task: () => Promise<void>; capture: () => () => void }> = [];
    const actions = createProductionStitchActions(
      asType<ProductionStitchActionContext>({
        getCurrentLanguage: () => activeLanguage,
        getMessages: () => null,
        getState: () => state,
        isActive: () => true,
        setLanguageResource: (
          resource: Parameters<ProductionStitchActionContext['setLanguageResource']>[0]
        ) => {
          activeLanguage = resource.language;
          state.previewLanguage = resource.language;
        },
        changeLanguage: vi.fn(() => Promise.reject(new Error('language persistence failed'))),
        runPersistenceTask: (
          _key: string,
          task: () => Promise<void>,
          capture?: () => () => void
        ) => {
          if (capture) queued.push({ task, capture });
        }
      })
    );

    actions['preview:setLanguage'](
      asType<Parameters<(typeof actions)['preview:setLanguage']>[0]>({
        value: 'ja',
        mutate: (mutator: (next: typeof state) => void) => mutator(state)
      })
    );
    expect(state.previewLanguage).toBe('en');
    const queuedTask = queued[0];
    if (!queuedTask) throw new Error('Expected a queued language task with rollback capture.');

    const rollback = queuedTask.capture();
    const running = queuedTask.task();
    expect(state.previewLanguage).toBe('ja');
    await expect(running).rejects.toThrow('language persistence failed');
    rollback();

    expect(activeLanguage).toBe('en');
    expect(state.previewLanguage).toBe('en');
  });

  it('maps every detached persistence key to a finite success and rollback scope', () => {
    expect(
      [
        'options:theme',
        'options:language',
        'usage:reset',
        'privacy:clear',
        'privacy:analytics',
        'maintenance:copy',
        'options:import',
        'options:repair',
        'options:reload'
      ].map((key) => [key, resolveProductionStitchTaskInvalidation(key)])
    ).toEqual([
      ['options:theme', 'theme'],
      ['options:language', 'locale-schema'],
      ['usage:reset', 'overview-usage'],
      ['privacy:clear', 'overview-usage'],
      ['privacy:analytics', 'overview-usage'],
      ['maintenance:copy', 'maintenance'],
      ['options:import', 'maintenance'],
      ['options:repair', ['storage', 'output', 'maintenance']],
      ['options:reload', 'maintenance']
    ]);
    expect(() => resolveProductionStitchTaskInvalidation('unknown')).toThrow(
      'UNKNOWN_OPTIONS_PERSISTENCE_TASK:unknown'
    );
    expect(
      ['privacy:analytics', 'privacy:errorReporting', 'privacy:debugMode'].map(
        resolveProductionStitchTaskOwner
      )
    ).toEqual(['privacy', 'privacy', 'privacy']);
    expect(
      ['maintenance:copy', 'options:import', 'options:repair', 'options:reload'].map(
        resolveProductionStitchTaskOwner
      )
    ).toEqual(['maintenance', 'maintenance', 'maintenance', 'maintenance']);
  });
});
