import { describe, expect, it, vi } from 'vitest';
import { handleOptionsMutationMessage } from '../../../src/background/listeners/optionsMutationMessages';
import { OptionsMutationCoordinator } from '../../../src/background/services/optionsMutationCoordinator';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../../src/shared/config/losslessObjectBoundaryTypes';
import {
  DeviceLocalVaultRecoveryError,
  type OptionsRawStorageRepository
} from '../../../src/shared/config/deviceLocalVaultRecoveryTransaction';
import {
  OPTIONS_MUTATION_MESSAGE_TYPE,
  OPTIONS_MUTATION_RESPONSE_TYPE,
  OptionsMutationError,
  type OptionsMutationErrorCode
} from '../../../src/shared/types/optionsMutationMessages';

class RawOptionsRepository implements OptionsRawStorageRepository {
  readRaw(): Promise<PlainStructuredValue | null> {
    return Promise.resolve({});
  }

  writeRaw(_value: PlainStructuredObject): Promise<void> {
    return Promise.resolve();
  }
}

const request = {
  type: OPTIONS_MUTATION_MESSAGE_TYPE,
  requestId: 'typed-error-request',
  command: { kind: 'migrate' }
} as const;

function createCoordinator(): OptionsMutationCoordinator {
  return new OptionsMutationCoordinator(new RawOptionsRepository());
}

function failureResponse(errorCode: OptionsMutationErrorCode) {
  return {
    type: OPTIONS_MUTATION_RESPONSE_TYPE,
    requestId: request.requestId,
    success: false,
    errorCode
  } as const;
}

describe('handleOptionsMutationMessage', () => {
  it('preserves an external sync conflict from Local Vault recovery', async () => {
    const coordinator = createCoordinator();
    vi.spyOn(coordinator, 'execute').mockRejectedValueOnce(
      new DeviceLocalVaultRecoveryError('EXTERNAL_SYNC_CONFLICT')
    );

    await expect(handleOptionsMutationMessage(coordinator, request)).resolves.toEqual(
      failureResponse('EXTERNAL_SYNC_CONFLICT')
    );
  });

  it('preserves a storage failure from Local Vault recovery', async () => {
    const coordinator = createCoordinator();
    vi.spyOn(coordinator, 'execute').mockRejectedValueOnce(
      new DeviceLocalVaultRecoveryError('OPTIONS_STORAGE_FAILURE')
    );

    await expect(handleOptionsMutationMessage(coordinator, request)).resolves.toEqual(
      failureResponse('OPTIONS_STORAGE_FAILURE')
    );
  });

  it('maps an untyped execution error to a storage failure', async () => {
    const coordinator = createCoordinator();
    vi.spyOn(coordinator, 'execute').mockRejectedValueOnce(new Error('untyped failure'));

    await expect(handleOptionsMutationMessage(coordinator, request)).resolves.toEqual(
      failureResponse('OPTIONS_STORAGE_FAILURE')
    );
  });

  it('returns authority unavailable without executing a coordinator', async () => {
    const coordinator = createCoordinator();
    const execute = vi.spyOn(coordinator, 'execute');

    await expect(handleOptionsMutationMessage(undefined, request)).resolves.toEqual(
      failureResponse('OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE')
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves an existing non-storage Options mutation error', async () => {
    const coordinator = createCoordinator();
    vi.spyOn(coordinator, 'execute').mockRejectedValueOnce(
      new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED')
    );

    await expect(handleOptionsMutationMessage(coordinator, request)).resolves.toEqual(
      failureResponse('OPTIONS_QUOTA_EXCEEDED')
    );
  });
});
