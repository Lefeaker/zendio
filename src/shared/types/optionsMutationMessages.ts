import type { StoredOptions as SchemaStoredOptions } from '../schemas/options.schema';
import { isObjectRecord, type ObjectRecord } from '../guards/object';
import type {
  CompleteOptions,
  InterfaceTheme,
  StoredOptions,
  VideoScreenshotAttachmentOptions
} from './options';

export const OPTIONS_MUTATION_MESSAGE_TYPE = 'ZENDIO_OPTIONS_MUTATION';
export const OPTIONS_MUTATION_RESPONSE_TYPE = 'ZENDIO_OPTIONS_MUTATION_RESPONSE';
export const OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE = 'OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE';

export type OptionsMutationErrorCode =
  | 'INVALID_OPTIONS_MUTATION'
  | 'OPTIONS_MUTATION_REJECTED'
  | 'OPTIONS_REPLACEMENT_REJECTED'
  | 'OPTIONS_QUOTA_EXCEEDED'
  | 'OPTIONS_STORAGE_FAILURE'
  | 'EXTERNAL_SYNC_CONFLICT'
  | typeof OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE;

export class OptionsMutationError extends Error {
  constructor(readonly code: OptionsMutationErrorCode) {
    super(code);
    this.name = 'OptionsMutationError';
  }
}

type DeleteValue = Readonly<{ $zendio: 'delete' }>;
type WritableValue<T> = Exclude<T, undefined> | DeleteValue;

type WholeRootPatch =
  | { readonly path: readonly ['interfaceTheme']; readonly value: InterfaceTheme | DeleteValue }
  | {
      readonly path: readonly ['domainMappings'];
      readonly value: CompleteOptions['domainMappings'] | DeleteValue;
    }
  | {
      readonly path: readonly ['vaultRouter'];
      readonly value: WritableValue<StoredOptions['vaultRouter']>;
    }
  | {
      readonly path: readonly ['yamlConfig'];
      readonly value: WritableValue<StoredOptions['yamlConfig']>;
    };

type FieldPatchRoots = Pick<
  CompleteOptions,
  | 'rest'
  | 'templates'
  | 'aiChat'
  | 'deepResearch'
  | 'fragmentClipper'
  | 'readingSession'
  | 'video'
  | 'classifier'
  | 'experimentalAi'
  | 'pageSummary'
  | 'readingOverlaySummary'
  | 'subtitleTranslation'
  | 'privacyPreferences'
>;

type FieldPatch = {
  [Root in keyof FieldPatchRoots]-?: {
    [Field in keyof NonNullable<FieldPatchRoots[Root]> & string]-?: {
      readonly path: readonly [Root, Field];
      readonly value: WritableValue<NonNullable<FieldPatchRoots[Root]>[Field]>;
    };
  }[keyof NonNullable<FieldPatchRoots[Root]> & string];
}[keyof FieldPatchRoots];

type ScreenshotAttachmentPatch = {
  [Field in keyof VideoScreenshotAttachmentOptions]-?: {
    readonly path: readonly ['video', 'screenshotAttachment', Field];
    readonly value: WritableValue<VideoScreenshotAttachmentOptions[Field]>;
  };
}[keyof VideoScreenshotAttachmentOptions];

export type OptionsPatch = WholeRootPatch | FieldPatch | ScreenshotAttachmentPatch;

export type OptionsMutationCommand =
  | { readonly kind: 'patch'; readonly patches: readonly OptionsPatch[] }
  | { readonly kind: 'replace'; readonly replacement: SchemaStoredOptions }
  | { readonly kind: 'migrate' };

export interface OptionsMutationRequest {
  readonly type: typeof OPTIONS_MUTATION_MESSAGE_TYPE;
  readonly requestId: string;
  readonly command: OptionsMutationCommand;
}

export interface OptionsMutationSuccessResult {
  readonly snapshot: CompleteOptions;
  readonly operationId: string;
  readonly rawSignature: string;
  readonly didWrite: boolean;
}

export type OptionsMutationResponse =
  | {
      readonly type: typeof OPTIONS_MUTATION_RESPONSE_TYPE;
      readonly requestId: string;
      readonly success: true;
      readonly result: OptionsMutationSuccessResult;
    }
  | {
      readonly type: typeof OPTIONS_MUTATION_RESPONSE_TYPE;
      readonly requestId: string;
      readonly success: false;
      readonly errorCode: OptionsMutationErrorCode;
    };

type UntrustedValue = Parameters<typeof isObjectRecord>[0];
type ObjectValue = ObjectRecord[string];

function isObject(value: UntrustedValue): value is ObjectRecord {
  return isObjectRecord(value) && !Array.isArray(value);
}

function hasExactKeys(value: ObjectRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isRequestId(value: ObjectValue): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function createOptionsMutationRequest(
  requestId: string,
  command: OptionsMutationCommand
): OptionsMutationRequest {
  return { type: OPTIONS_MUTATION_MESSAGE_TYPE, requestId, command };
}

export function createOptionsMutationSuccessResponse(
  requestId: string,
  result: OptionsMutationSuccessResult
): OptionsMutationResponse {
  return { type: OPTIONS_MUTATION_RESPONSE_TYPE, requestId, success: true, result };
}

export function createOptionsMutationFailureResponse(
  requestId: string,
  errorCode: OptionsMutationErrorCode
): OptionsMutationResponse {
  return { type: OPTIONS_MUTATION_RESPONSE_TYPE, requestId, success: false, errorCode };
}

function isErrorCode(value: ObjectValue): value is OptionsMutationErrorCode {
  return [
    'INVALID_OPTIONS_MUTATION',
    'OPTIONS_MUTATION_REJECTED',
    'OPTIONS_REPLACEMENT_REJECTED',
    'OPTIONS_QUOTA_EXCEEDED',
    'OPTIONS_STORAGE_FAILURE',
    'EXTERNAL_SYNC_CONFLICT',
    OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE
  ].includes(String(value));
}

export function isOptionsMutationResponse(value: UntrustedValue): value is OptionsMutationResponse {
  if (
    !isObject(value) ||
    value.type !== OPTIONS_MUTATION_RESPONSE_TYPE ||
    !isRequestId(value.requestId)
  ) {
    return false;
  }
  if (value.success === false) {
    return (
      hasExactKeys(value, ['type', 'requestId', 'success', 'errorCode']) &&
      isErrorCode(value.errorCode)
    );
  }
  if (
    value.success !== true ||
    !hasExactKeys(value, ['type', 'requestId', 'success', 'result']) ||
    !isObject(value.result)
  ) {
    return false;
  }
  return (
    hasExactKeys(value.result, ['snapshot', 'operationId', 'rawSignature', 'didWrite']) &&
    isObject(value.result.snapshot) &&
    typeof value.result.operationId === 'string' &&
    value.result.operationId.length > 0 &&
    typeof value.result.rawSignature === 'string' &&
    typeof value.result.didWrite === 'boolean'
  );
}

export function isOptionsMutationAuthorityUnavailableError(error: Error): boolean {
  return (
    error instanceof OptionsMutationError && error.code === OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE
  );
}
