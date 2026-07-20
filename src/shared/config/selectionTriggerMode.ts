import type { FragmentClipperOptions, FragmentSelectionTriggerMode } from '../types/options';

export type SelectionTriggerConfig = Pick<
  FragmentClipperOptions,
  'selectionTriggerMode' | 'selectionModifierKeys'
>;

export function isFragmentSelectionTriggerMode<Value>(
  value: Value
): value is Value & FragmentSelectionTriggerMode {
  return value === 'disabled' || value === 'direct' || value === 'modifier';
}

export function isSelectionTriggerConfigured(config: SelectionTriggerConfig): boolean {
  return (
    config.selectionTriggerMode === 'direct' ||
    (config.selectionTriggerMode === 'modifier' && config.selectionModifierKeys.length > 0)
  );
}
