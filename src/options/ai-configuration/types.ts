import type { Messages } from '@i18n';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';
import type { readOptionsPath } from '../state/optionsPatchModel';

export class AiConfigInputError extends Error {
  constructor(
    readonly key: keyof Messages,
    readonly field = ''
  ) {
    super(key);
  }
}
export interface AiConfigChange {
  field: string;
  label: keyof Messages;
  before: ReturnType<typeof readOptionsPath>;
  after: ReturnType<typeof readOptionsPath>;
}
export interface AiConfigReview {
  patches: OptionsPatch[];
  expected: OptionsPatch[];
  rows: AiConfigChange[];
}
