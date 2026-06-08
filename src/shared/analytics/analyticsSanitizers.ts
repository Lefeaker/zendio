export type AnalyticsPrimitive = string | number | boolean;
export type TelemetryCustomDefinitionKind = 'dimension' | 'metric';
export type TelemetryParamSanitizer = (value: unknown) => AnalyticsPrimitive | undefined;

export interface TelemetryParamDefinition {
  readonly required?: boolean;
  readonly sanitize: TelemetryParamSanitizer;
  readonly gaCustomDefinitionKind?: TelemetryCustomDefinitionKind;
  readonly privacyNote: string;
}

interface TelemetryParamOptions {
  readonly required?: boolean;
  readonly gaCustomDefinitionKind?: TelemetryCustomDefinitionKind;
  readonly privacyNote: string;
}

interface NumericParamOptions extends TelemetryParamOptions {
  readonly max?: number;
}

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const FILE_LIKE_SUFFIX_PATTERN =
  /\.(?:md|markdown|txt|rtf|pdf|docx?|xlsx?|csv|tsv|json|ya?ml|png|jpe?g|gif|webp|svg|zip)$/i;
const SECRET_LIKE_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{8,}\b/,
  /\bsk(?:_|-)?(?:live|test|proj)?[_-]?[A-Za-z0-9]{8,}\b/i,
  /\bAIza[0-9A-Za-z_-]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_-]?key|session[_-]?token|bearer|cookie)\b/i
] as const;

export function enumParam<const Value extends string>(
  allowedValues: readonly Value[],
  options: TelemetryParamOptions
): TelemetryParamDefinition {
  const allowedValueSet = new Set<string>(allowedValues);

  return {
    ...options,
    sanitize: (value) =>
      typeof value === 'string' && allowedValueSet.has(value) ? (value as Value) : undefined
  };
}

export function booleanParam(options: TelemetryParamOptions): TelemetryParamDefinition {
  return {
    ...options,
    sanitize: (value) => (typeof value === 'boolean' ? value : undefined)
  };
}

export function identifierParam(
  maxLength: number,
  options: TelemetryParamOptions
): TelemetryParamDefinition {
  return {
    ...options,
    sanitize: (value) => sanitizeIdentifier(value, maxLength)
  };
}

export function languageParam(options: TelemetryParamOptions): TelemetryParamDefinition {
  return {
    ...options,
    sanitize: (value) => sanitizeLanguage(value)
  };
}

export function nonNegativeNumberParam(options: NumericParamOptions): TelemetryParamDefinition {
  const { max } = options;

  return {
    ...options,
    sanitize: (value) => sanitizeNonNegativeNumber(value, max)
  };
}

export function positiveNumberParam(options: NumericParamOptions): TelemetryParamDefinition {
  const { max } = options;

  return {
    ...options,
    sanitize: (value) => sanitizePositiveNumber(value, max)
  };
}

export function sanitizeTelemetryParams<ParamName extends string>(
  paramDefinitions: Record<ParamName, TelemetryParamDefinition>,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  if (!isPlainRecord(params)) {
    return {};
  }

  const sanitized: Record<string, AnalyticsPrimitive> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    const definition = (paramDefinitions as Record<string, TelemetryParamDefinition | undefined>)[
      key
    ];
    if (!definition) {
      continue;
    }

    const nextValue = definition.sanitize(value);
    if (nextValue !== undefined) {
      sanitized[key] = nextValue;
    }
  }

  return sanitized;
}

export function hasRequiredTelemetryParams<ParamName extends string>(
  paramDefinitions: Record<ParamName, TelemetryParamDefinition>,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  const definitions = Object.entries(paramDefinitions) as Array<[string, TelemetryParamDefinition]>;

  return definitions.every(([key, definition]) => {
    if (!definition.required) {
      return true;
    }

    return params[key] !== undefined;
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeIdentifier(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    !SAFE_IDENTIFIER_PATTERN.test(normalized) ||
    containsUnsafeStringContent(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 16 || !LANGUAGE_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function sanitizeNonNegativeNumber(value: unknown, max?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  if (max !== undefined && value > max) {
    return undefined;
  }

  return value;
}

function sanitizePositiveNumber(value: unknown, max?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  if (max !== undefined && value > max) {
    return undefined;
  }

  return value;
}

function containsUnsafeStringContent(value: string): boolean {
  const lowerValue = value.toLowerCase();

  if (
    value.includes('://') ||
    lowerValue.startsWith('www.') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    FILE_LIKE_SUFFIX_PATTERN.test(value)
  ) {
    return true;
  }

  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}
