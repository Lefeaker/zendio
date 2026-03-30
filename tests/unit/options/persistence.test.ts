import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ test: 'value' })));
const saveMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const snapshotMock = vi.hoisted(() => vi.fn(() => ({ cached: true })));

vi.mock('../../../src/options/state/optionsStore', () => ({
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
    await persistence.save({ draft: true } as never);
    expect(persistence.getCached()).toEqual({ cached: true });

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith({ draft: true });
    expect(snapshotMock).toHaveBeenCalledTimes(1);
  });

  it('exposes a shared chrome persistence instance', () => {
    expect(chromeOptionsPersistence).toBeTruthy();
    expect(typeof chromeOptionsPersistence.load).toBe('function');
  });
});
