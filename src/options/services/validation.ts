export class OptionsValidationError extends Error {
  readonly code = 'INVALID_TAXONOMY';
  readonly detail?: string;

  constructor(detail?: string) {
    super('INVALID_TAXONOMY');
    this.name = 'OptionsValidationError';
    this.detail = detail;
  }
}

export function parseClassifierTaxonomy(input: string): unknown {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    throw new OptionsValidationError(detail);
  }
}
