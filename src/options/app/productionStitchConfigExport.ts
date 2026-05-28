import type { CompleteOptions } from '@shared/types/options';
import { normalizeOptionsForTransfer } from '@options/utils/optionsTransfer';

export function serializeOptionsFullBackup(options: CompleteOptions): string {
  return JSON.stringify(normalizeOptionsForTransfer(options, { mode: 'fullBackup' }), null, 2);
}
