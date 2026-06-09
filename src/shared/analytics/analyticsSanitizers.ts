export type AnalyticsPrimitive = string | number | boolean;
export type TelemetryCustomDefinitionKind = 'dimension' | 'metric';
type UntrustedTelemetryValue = unknown;
type TelemetryParamDefinitions<ParamName extends string> = Record<
  ParamName,
  TelemetryParamDefinition
>;
type UntrustedTelemetryRecord = Record<string, UntrustedTelemetryValue>;

export type TelemetryParamSanitizer = (
  value: UntrustedTelemetryValue
) => AnalyticsPrimitive | undefined;

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
] satisfies ReadonlyArray<RegExp>;

export function enumParam<const Value extends string>(
  allowedValues: readonly Value[],
  options: TelemetryParamOptions
): TelemetryParamDefinition {
  return {
    ...options,
    sanitize: (value) =>
      typeof value === 'string'
        ? allowedValues.find((allowedValue) => allowedValue === value)
        : undefined
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
  paramDefinitions: TelemetryParamDefinitions<ParamName>,
  params: UntrustedTelemetryValue
): Record<string, AnalyticsPrimitive> {
  if (!isPlainRecord(params)) {
    return {};
  }

  const sanitized: Record<string, AnalyticsPrimitive> = {};
  const paramNames = recordKeys(paramDefinitions);

  for (const key of paramNames) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }

    const definition = paramDefinitions[key];
    const nextValue = definition.sanitize(value);
    if (nextValue !== undefined) {
      sanitized[key] = nextValue;
    }
  }

  return sanitized;
}

export function hasRequiredTelemetryParams<ParamName extends string>(
  paramDefinitions: TelemetryParamDefinitions<ParamName>,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return recordKeys(paramDefinitions).every((key) => {
    const definition = paramDefinitions[key];
    if (!definition.required) {
      return true;
    }

    return params[key] !== undefined;
  });
}

function recordKeys<Key extends string>(record: Record<Key, unknown>): Key[] {
  return Object.keys(record) as Key[];
}

function isPlainRecord(value: UntrustedTelemetryValue): value is UntrustedTelemetryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeIdentifier(value: UntrustedTelemetryValue, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    !SAFE_IDENTIFIER_PATTERN.test(normalized) ||
    hasUnsafeTelemetryStringContent(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeLanguage(value: UntrustedTelemetryValue): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 16 || !LANGUAGE_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function sanitizeNonNegativeNumber(
  value: UntrustedTelemetryValue,
  max?: number
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  if (max !== undefined && value > max) {
    return undefined;
  }

  return value;
}

function sanitizePositiveNumber(value: UntrustedTelemetryValue, max?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  if (max !== undefined && value > max) {
    return undefined;
  }

  return value;
}

export function hasUnsafeTelemetryStringContent(value: string): boolean {
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
