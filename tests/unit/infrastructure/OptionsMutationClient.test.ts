import { describe, expect, it, vi } from 'vitest';
import { OptionsMutationClient } from '../../../src/infrastructure/repositories/OptionsMutationClient';
import { decodeStoredOptions } from '../../../src/shared/config/storedOptionsCodec';
import {
  OPTIONS_MUTATION_RESPONSE_TYPE,
  OptionsMutationError,
  type OptionsMutationResponse
} from '../../../src/shared/types/optionsMutationMessages';
import { DEFAULT_OPTIONS } from '../../../src/shared/config/defaultOptions';
import type { MessagingService } from '../../../src/platform/interfaces/messaging';
import { asType } from '../../utils/typeHelpers';

type StoredValue = Parameters<typeof decodeStoredOptions>[0];

function createReader(raw: StoredValue = {}) {
  return {
    get: vi.fn(() => Promise.resolve(DEFAULT_OPTIONS)),
    readDecoded: vi.fn(() => Promise.resolve(decodeStoredOptions(raw))),
    onChange: vi.fn(() => () => undefined)
  };
}

function successResponse(
  request: { requestId: string },
  snapshot = DEFAULT_OPTIONS
): OptionsMutationResponse {
  return {
    type: OPTIONS_MUTATION_RESPONSE_TYPE,
    requestId: request.requestId,
    success: true,
    result: {
      snapshot,
      operationId: 'operation-id',
      rawSignature: 'fnv1a32:00000000:2',
      didWrite: true
    }
  };
}

describe('OptionsMutationClient', () => {
  it('sends typed patch and strict replacement commands', async () => {
    const reader = createReader();
    const send = vi.fn((message: { requestId: string }) =>
      Promise.resolve(successResponse(message))
    );
    const client = new OptionsMutationClient(
      reader,
      asType<Pick<MessagingService, 'send'>>({ send })
    );

    await client.patch({ path: ['interfaceTheme'], value: 'dark' });
    await client.replace({ interfaceTheme: 'light' });

    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'ZENDIO_OPTIONS_MUTATION',
      command: {
        kind: 'patch',
        patches: [{ path: ['interfaceTheme'], value: 'dark' }]
      }
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      type: 'ZENDIO_OPTIONS_MUTATION',
      command: { kind: 'replace', replacement: { interfaceTheme: 'light' } }
    });
  });

  it('rejects failed messaging without invoking any direct storage fallback', async () => {
    const reader = createReader();
    const client = new OptionsMutationClient(reader, {
      send: vi.fn(() => Promise.reject(new Error('No background')))
    });

    await expect(client.patch({ path: ['interfaceTheme'], value: 'dark' })).rejects.toEqual(
      new OptionsMutationError('OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE')
    );
    expect(reader.get).not.toHaveBeenCalled();
    expect(reader.readDecoded).not.toHaveBeenCalled();
  });

  it('uses the coordinator for lossless read migration but keeps the migrated session readable on failure', async () => {
    const reader = createReader({
      fragmentClipper: { selectionModifierEnabled: false, selectionModifierKeys: ['shift'] }
    });
    const client = new OptionsMutationClient(reader, {
      send: vi.fn(() => Promise.reject(new Error('No background')))
    });

    await expect(client.get()).resolves.toMatchObject({
      fragmentClipper: { selectionTriggerMode: 'direct' }
    });
  });

  it('rejects malformed or mismatched responses', async () => {
    const client = new OptionsMutationClient(createReader(), {
      send: asType<MessagingService['send']>(vi.fn(() => Promise.resolve({ success: true })))
    });

    await expect(client.patch({ path: ['interfaceTheme'], value: 'dark' })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS_MUTATION'
    });
  });
});
