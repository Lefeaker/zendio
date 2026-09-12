import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ test: 'value' })));
const saveMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ acknowledged: true })));
const replaceMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ replaced: true })));
const snapshotMock = vi.hoisted(() => vi.fn(() => ({ cached: true })));

vi.mock('../../../src/options/state/optionsStore', () => ({
  replacePersisted: replaceMock,
  default: {
    load: loadMock,
    save: saveMock,
    snapshot: snapshotMock
  }
}));

import {
  chromeOptionsPersistence,
  createChromeOptionsPersistence
} from '@options/services/persistence';

describe('options persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads, saves, and snapshots through optionsStore', async () => {
    const persistence = createChromeOptionsPersistence();

    await expect(persistence.load()).resolves.toEqual({ test: 'value' });
    await expect(persistence.save([{ path: ['interfaceTheme'], value: 'dark' }])).resolves.toEqual({
      acknowledged: true
    });
    await expect(persistence.replace?.({ interfaceTheme: 'light' })).resolves.toEqual({
      replaced: true
    });
    expect(persistence.getCached()).toEqual({ cached: true });

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith([{ path: ['interfaceTheme'], value: 'dark' }]);
    expect(replaceMock).toHaveBeenCalledWith({ interfaceTheme: 'light' });
    expect(snapshotMock).toHaveBeenCalledTimes(1);
  });

  it('exposes a shared chrome persistence instance', () => {
    expect(chromeOptionsPersistence).toBeTruthy();
    expect(typeof chromeOptionsPersistence.load).toBe('function');
  });
});
