/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  createProductionStitchActions,
  type ProductionStitchActionContext
} from '../../../src/options/app/productionStitchActions';
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
});
