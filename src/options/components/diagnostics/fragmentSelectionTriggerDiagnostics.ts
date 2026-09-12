import type { FragmentClipperOptions } from '@shared/types/options';
import { createDiagnosticLine, type DiagnosticLine } from './diagnosticsMessages';

const VALID_FRAGMENT_KEYS: ReadonlySet<FragmentClipperOptions['selectionModifierKeys'][number]> =
  new Set(['alt', 'meta', 'ctrl', 'shift']);

export function appendFragmentSelectionTriggerDiagnostics(
  lines: DiagnosticLine[],
  clipper: StoredSelectionTriggerConfig
): void {
  if (clipper.selectionTriggerMode === 'direct') {
    lines.push(createDiagnosticLine('ok', 'diagnosticsFragmentSelectionTriggerDirect'));
    return;
  }

  if (clipper.selectionTriggerMode !== 'modifier') {
    lines.push(createDiagnosticLine('info', 'diagnosticsFragmentSelectionTriggerDisabled'));
    return;
  }

  const keys = (clipper.selectionModifierKeys ?? []).filter((key) => VALID_FRAGMENT_KEYS.has(key));
  if (keys.length === 0) {
    lines.push(createDiagnosticLine('warning', 'diagnosticsFragmentModifierKeysMissing'));
    return;
  }

  lines.push(
    createDiagnosticLine('ok', 'diagnosticsFragmentModifierKeysValue', {
      keys: keys.join(' + ')
    })
  );
}

type StoredSelectionTriggerConfig = Partial<
  Pick<FragmentClipperOptions, 'selectionTriggerMode' | 'selectionModifierKeys'>
>;
