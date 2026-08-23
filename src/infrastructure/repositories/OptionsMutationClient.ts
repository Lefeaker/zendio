import type { MessagingService } from '../../platform/interfaces/messaging';
import {
  encodeStoredOptionsReplacement,
  type DecodedStoredOptions
} from '../../shared/config/storedOptionsCodec';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import {
  OptionsMutationError,
  createOptionsMutationRequest,
  isOptionsMutationResponse,
  type OptionsMutationCommand,
  type OptionsPatch
} from '../../shared/types/optionsMutationMessages';

export interface OptionsMutationReader {
  get(): Promise<CompleteOptions>;
  readDecoded(): Promise<DecodedStoredOptions>;
  onChange(callback: (options: CompleteOptions) => void): () => void;
}

let requestSequence = 0;
type MutationResponseValue = Parameters<typeof isOptionsMutationResponse>[0];

function requestId(): string {
  requestSequence += 1;
  return `options-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function clone<T>(value: T): T {
  return globalThis.structuredClone(value);
}

export class OptionsMutationClient implements IOptionsRepository {
  constructor(
    private readonly reader: OptionsMutationReader,
    private readonly messaging: Pick<MessagingService, 'send'>
  ) {}

  async get(): Promise<CompleteOptions> {
    const decoded = await this.reader.readDecoded();
    if (decoded.automaticWritebackIsLossless && decoded.migrations.length > 0) {
      try {
        return clone((await this.send({ kind: 'migrate' })).snapshot);
      } catch (error) {
        console.warn('[OptionsMutationClient] Lossless migration writeback failed:', error);
      }
    }
    return clone(decoded.runtime);
  }

  async patch(patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
    const batch = Array.isArray(patches) ? patches : [patches];
    if (batch.length === 0) throw new OptionsMutationError('INVALID_OPTIONS_MUTATION');
    return clone((await this.send({ kind: 'patch', patches: batch })).snapshot);
  }

  async replace(options: StoredOptions | CompleteOptions): Promise<CompleteOptions> {
    const encoded = encodeStoredOptionsReplacement(options);
    if (!encoded.success) throw new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED');
    return clone((await this.send({ kind: 'replace', replacement: encoded.value })).snapshot);
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    return this.reader.onChange(callback);
  }

  private async send(command: OptionsMutationCommand) {
    const currentRequestId = requestId();
    let response: MutationResponseValue;
    try {
      response = await this.messaging.send<MutationResponseValue>(
        createOptionsMutationRequest(currentRequestId, command)
      );
    } catch {
      throw new OptionsMutationError('OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE');
    }
    if (!isOptionsMutationResponse(response) || response.requestId !== currentRequestId) {
      throw new OptionsMutationError('INVALID_OPTIONS_MUTATION');
    }
    if (response.success === true) return response.result;
    throw new OptionsMutationError(response.errorCode);
  }
}
