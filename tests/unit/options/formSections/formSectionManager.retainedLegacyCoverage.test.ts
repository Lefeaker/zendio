import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';

describe('FormSectionRegistry', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    registry = new FormSectionRegistry();
  });

  it('maintains isolated handler sets per registry', async () => {
    const primaryHandler = {
      applySnapshot: vi.fn(),
      collectChanges: vi.fn(() => ({ rest: { baseUrl: 'primary' } }) as Partial<CompleteOptions>)
    };

    registry.register('rest', primaryHandler);

    const initialOptions = { rest: { baseUrl: 'https://primary.example.com/' } } as StoredOptions;
    await registry.apply(initialOptions);

    expect(primaryHandler.applySnapshot).toHaveBeenCalledTimes(1);
    expect(primaryHandler.applySnapshot).toHaveBeenCalledWith(initialOptions);

    expect(registry.collect(null)).toEqual({ rest: { baseUrl: 'primary' } });

    const secondaryRegistry = new FormSectionRegistry();
    const secondaryHandler = {
      applySnapshot: vi.fn(),
      collectChanges: vi.fn(() => ({ rest: { baseUrl: 'secondary' } }) as Partial<CompleteOptions>)
    };

    secondaryRegistry.register('rest', secondaryHandler);
    const secondaryOptions = {
      rest: { baseUrl: 'https://secondary.example.com/' }
    } as StoredOptions;
    await secondaryRegistry.apply(secondaryOptions);

    expect(primaryHandler.applySnapshot).toHaveBeenCalledTimes(1);
    expect(secondaryHandler.applySnapshot).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);
    expect(secondaryRegistry.size).toBe(1);
    expect(secondaryRegistry.collect(null)).toEqual({ rest: { baseUrl: 'secondary' } });

    secondaryRegistry.unregister('rest', secondaryHandler);
    expect(secondaryRegistry.size).toBe(0);

    const replayHandler = {
      applySnapshot: vi.fn(),
      collectChanges: vi.fn(() => ({ rest: { baseUrl: 'replay' } }) as Partial<CompleteOptions>)
    };

    registry.register('rest', replayHandler);
    expect(replayHandler.applySnapshot).toHaveBeenCalledWith(initialOptions);

    registry.unregister('rest', replayHandler);
    registry.unregister('rest', primaryHandler);
  });

  it('clears registered handlers and cached snapshot', async () => {
    const handler = {
      applySnapshot: vi.fn(),
      collectChanges: vi.fn(() => ({ rest: { baseUrl: 'cleared' } }) as Partial<CompleteOptions>)
    };

    registry.register('rest', handler);
    await registry.apply({ rest: { baseUrl: 'https://example.com/' } } as StoredOptions);
    expect(handler.applySnapshot).toHaveBeenCalledTimes(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.collect(null)).toEqual({});

    // Ensure snapshots are not replayed after clear
    const replay = {
      applySnapshot: vi.fn(),
      collectChanges: vi.fn(() => null)
    };
    registry.register('rest', replay);
    expect(replay.applySnapshot).not.toHaveBeenCalled();
  });
});
