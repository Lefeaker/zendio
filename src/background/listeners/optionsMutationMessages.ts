import type { MessagePayload } from '../../platform/interfaces/messaging';
import type { OptionsMutationCoordinator } from '../services/optionsMutationCoordinator';
import {
  applyStoredOptionsPatch,
  encodeStoredOptionsReplacement
} from '../../shared/config/storedOptionsCodec';
import { asOptionsMutationError } from '../../shared/config/deviceLocalVaultRecoveryTransaction';
import { snapshotPlainStructuredData } from '../../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import {
  OPTIONS_MUTATION_MESSAGE_TYPE,
  createOptionsMutationFailureResponse,
  createOptionsMutationSuccessResponse,
  type OptionsMutationCommand,
  type OptionsMutationRequest,
  type OptionsPatch
} from '../../shared/types/optionsMutationMessages';
import { toMessagePayload } from './runtimeMessageContracts';

type UntrustedValue = Parameters<typeof snapshotPlainStructuredData>[0];

function isObject(value: UntrustedValue): value is PlainStructuredObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: PlainStructuredObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isRequestId(value: PlainStructuredValue | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isOptionsPatch(value: UntrustedValue): value is OptionsPatch {
  return applyStoredOptionsPatch({}, value).success;
}

function isOptionsMutationCommand(value: UntrustedValue): value is OptionsMutationCommand {
  if (!isObject(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'patch') {
    return (
      hasExactKeys(value, ['kind', 'patches']) &&
      Array.isArray(value.patches) &&
      value.patches.length > 0 &&
      value.patches.length <= 100 &&
      value.patches.every(isOptionsPatch)
    );
  }
  if (value.kind === 'replace') {
    return (
      hasExactKeys(value, ['kind', 'replacement']) &&
      encodeStoredOptionsReplacement(value.replacement).success
    );
  }
  return value.kind === 'migrate' && hasExactKeys(value, ['kind']);
}

function isOptionsMutationRequest(value: UntrustedValue): value is OptionsMutationRequest {
  if (!isObject(value)) return false;
  return (
    hasExactKeys(value, ['type', 'requestId', 'command']) &&
    value.type === OPTIONS_MUTATION_MESSAGE_TYPE &&
    isRequestId(value.requestId) &&
    isOptionsMutationCommand(value.command)
  );
}

function responseRequestId(value: PlainStructuredObject): string {
  return typeof value.requestId === 'string' && value.requestId.length > 0
    ? value.requestId.slice(0, 128)
    : 'invalid-options-request';
}

export async function handleOptionsMutationMessage(
  coordinator: OptionsMutationCoordinator | undefined,
  message: UntrustedValue
): Promise<MessagePayload | undefined> {
  const snapshot = snapshotPlainStructuredData(message);
  if (!snapshot.ok || !isObject(snapshot.value)) return undefined;
  const candidate = snapshot.value;
  if (candidate.type !== OPTIONS_MUTATION_MESSAGE_TYPE) return undefined;
  const requestId = responseRequestId(candidate);
  if (!coordinator) {
    return toMessagePayload(
      createOptionsMutationFailureResponse(requestId, 'OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE')
    );
  }
  if (!isOptionsMutationRequest(candidate)) {
    return toMessagePayload(
      createOptionsMutationFailureResponse(requestId, 'INVALID_OPTIONS_MUTATION')
    );
  }
  try {
    return toMessagePayload(
      createOptionsMutationSuccessResponse(
        candidate.requestId,
        await coordinator.execute(candidate.command)
      )
    );
  } catch (error) {
    return toMessagePayload(
      createOptionsMutationFailureResponse(candidate.requestId, asOptionsMutationError(error).code)
    );
  }
}
