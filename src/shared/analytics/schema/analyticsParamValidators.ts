export type AnalyticsParamPrimitive = string | number | boolean;
export type AnalyticsParamValidator<
  Value extends AnalyticsParamPrimitive = AnalyticsParamPrimitive
> = (value: unknown) => Value | undefined;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const OPERATION_ID_PATTERN = /^op_[a-z0-9]{6,24}$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const FILE_NAME_PATTERN =
  /\.(md|markdown|txt|json|ya?ml|csv|tsv|png|jpe?g|gif|webp|svg|mp4|mov|mkv|srt|vtt|pdf|docx?)$/i;
const SECRET_PATTERN = /(api[_-]?key|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|secret|token|password)/i;

export function identifier(maxLength: number): AnalyticsParamValidator<string> {
  return (value) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    if (
      normalized.length === 0 ||
      normalized.length > maxLength ||
      !IDENTIFIER_PATTERN.test(normalized) ||
      hasForbiddenAnalyticsStringShape(normalized)
    ) {
      return undefined;
    }
    return normalized;
  };
}

export function operationId(): AnalyticsParamValidator<string> {
  return (value) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    return OPERATION_ID_PATTERN.test(normalized) ? normalized : undefined;
  };
}

export function languageTag(): AnalyticsParamValidator<string> {
  return (value) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    if (normalized.length > 16 || !LANGUAGE_PATTERN.test(normalized)) {
      return undefined;
    }
    return normalized;
  };
}

export function booleanValue(): AnalyticsParamValidator<boolean> {
  return (value) => (typeof value === 'boolean' ? value : undefined);
}

export function nonNegativeInteger(): AnalyticsParamValidator<number> {
  return (value) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function positiveInteger(): AnalyticsParamValidator<number> {
  return (value) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function enumValue<const Values extends readonly string[]>(
  values: Values
): AnalyticsParamValidator<Values[number]> {
  const allowedValues = new Set(values as readonly string[]);
  return (value) => {
    if (typeof value !== 'string' || hasForbiddenAnalyticsStringShape(value)) {
      return undefined;
    }
    return allowedValues.has(value) ? (value as Values[number]) : undefined;
  };
}

export function literalValue<const Value extends AnalyticsParamPrimitive>(
  literal: Value
): AnalyticsParamValidator<Value> {
  return (value) => (value === literal ? literal : undefined);
}

export function runtimeHarnessSource(): AnalyticsParamValidator<'runtime-observability-harness'> {
  return literalValue('runtime-observability-harness');
}

export function hasForbiddenAnalyticsStringShape(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.includes('://') ||
    lowerValue.startsWith('www.') ||
    lowerValue.startsWith('/') ||
    lowerValue.includes('\\') ||
    lowerValue.includes('?') ||
    lowerValue.includes('#') ||
    lowerValue.includes('\n') ||
    lowerValue.includes('```') ||
    lowerValue.includes('---') ||
    FILE_NAME_PATTERN.test(value) ||
    SECRET_PATTERN.test(lowerValue)
  );
}
