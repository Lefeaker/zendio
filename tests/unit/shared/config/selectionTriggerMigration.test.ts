import { describe, expect, it } from 'vitest';
import { migrateSelectionTriggerOptions } from '@shared/config/selectionTriggerMigration';

describe('selection trigger configuration migration', () => {
  it.each([
    [true, 'modifier'],
    [false, 'direct']
  ] as const)('migrates legacy enabled=%s to %s', (legacyEnabled, expectedMode) => {
    const source = {
      fragmentClipper: {
        selectionModifierEnabled: legacyEnabled,
        selectionModifierKeys: ['shift']
      }
    };

    const result = migrateSelectionTriggerOptions(source);

    expect(result.migrated).toBe(true);
    expect(result.options).toEqual({
      fragmentClipper: {
        selectionTriggerMode: expectedMode,
        selectionModifierKeys: ['shift']
      }
    });
    expect(source.fragmentClipper).toHaveProperty('selectionModifierEnabled', legacyEnabled);
  });

  it('keeps an explicit current mode and only removes the retired field', () => {
    const result = migrateSelectionTriggerOptions({
      fragmentClipper: {
        selectionTriggerMode: 'disabled',
        selectionModifierEnabled: false,
        selectionModifierKeys: ['shift']
      }
    });

    expect(result).toEqual({
      migrated: true,
      options: {
        fragmentClipper: {
          selectionTriggerMode: 'disabled',
          selectionModifierKeys: ['shift']
        }
      }
    });
  });

  it('is idempotent for current configuration', () => {
    const source = {
      interfaceTheme: 'dark',
      fragmentClipper: {
        selectionTriggerMode: 'direct',
        selectionModifierKeys: ['shift']
      }
    };

    const first = migrateSelectionTriggerOptions(source);
    const second = migrateSelectionTriggerOptions(first.options);

    expect(first.migrated).toBe(false);
    expect(second.migrated).toBe(false);
    expect(second.options).toEqual(source);
  });

  it('does not manufacture fragment configuration for unrelated input', () => {
    expect(migrateSelectionTriggerOptions({ rest: { vault: 'Zendio' } })).toEqual({
      migrated: false,
      options: { rest: { vault: 'Zendio' } }
    });
    expect(migrateSelectionTriggerOptions(null)).toEqual({ migrated: false, options: {} });
  });
});
