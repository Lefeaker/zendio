import type { ConnectionChannel, ConnectionChannelResult } from '../../shared/types/connection';
import {
  isUserVisibleMessageDescriptor,
  type UserVisibleMessageDescriptor
} from '../../shared/i18n/userVisibleMessageDescriptor';
import { optionsErrors } from '../../shared/errors';

type ConnectionContext = Parameters<typeof optionsErrors.connectionInProgress>[0];

export function validateChannelResult(
  channel: Partial<ConnectionChannelResult> | null | undefined,
  context: ConnectionContext,
  index: number
): ConnectionChannelResult {
  if (!channel || typeof channel !== 'object') {
    throw optionsErrors.responseInvalid(`Channel ${index} is not an object.`, {
      ...context,
      response: channel
    });
  }

  if (!isConnectionChannel(channel.channel)) {
    throw optionsErrors.responseInvalid(`Channel ${index} has an invalid channel id.`, {
      ...context,
      response: channel
    });
  }
  if (
    typeof channel.label !== 'string' ||
    typeof channel.configured !== 'boolean' ||
    typeof channel.success !== 'boolean' ||
    typeof channel.message !== 'string'
  ) {
    throw optionsErrors.responseInvalid(`Channel ${index} is missing required fields.`, {
      ...context,
      response: channel
    });
  }
  if (channel.url !== undefined && typeof channel.url !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "url" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (channel.status !== undefined && typeof channel.status !== 'number') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "status" must be a number.`, {
      ...context,
      response: channel
    });
  }
  if (channel.response !== undefined && typeof channel.response !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "response" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (channel.error !== undefined && typeof channel.error !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "error" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (channel.certificateUrl !== undefined && typeof channel.certificateUrl !== 'string') {
    throw optionsErrors.responseInvalid(
      `Channel ${index} field "certificateUrl" must be a string.`,
      {
        ...context,
        response: channel
      }
    );
  }

  const labelDescriptor = validateDescriptorField(
    channel.labelDescriptor,
    `Channel ${index} field "labelDescriptor"`,
    context,
    channel
  );
  const messageDescriptor = validateDescriptorField(
    channel.messageDescriptor,
    `Channel ${index} field "messageDescriptor"`,
    context,
    channel
  );
  const errorDescriptor = validateDescriptorField(
    channel.errorDescriptor,
    `Channel ${index} field "errorDescriptor"`,
    context,
    channel
  );

  return {
    channel: channel.channel,
    label: channel.label,
    ...(labelDescriptor ? { labelDescriptor } : {}),
    configured: channel.configured,
    success: channel.success,
    message: channel.message,
    ...(messageDescriptor ? { messageDescriptor } : {}),
    ...(channel.url !== undefined ? { url: channel.url } : {}),
    ...(channel.status !== undefined ? { status: channel.status } : {}),
    ...(channel.response !== undefined ? { response: channel.response } : {}),
    ...(channel.error !== undefined ? { error: channel.error } : {}),
    ...(errorDescriptor ? { errorDescriptor } : {}),
    ...(channel.certificateUrl !== undefined ? { certificateUrl: channel.certificateUrl } : {})
  };
}

function isConnectionChannel(channel: string | undefined): channel is ConnectionChannel {
  return channel === 'localFolder' || channel === 'https' || channel === 'http';
}

function validateDescriptorField(
  descriptor: unknown,
  fieldName: string,
  context: ConnectionContext,
  response: unknown
): UserVisibleMessageDescriptor | undefined {
  if (descriptor === undefined) {
    return undefined;
  }

  if (!isUserVisibleMessageDescriptor(descriptor)) {
    throw optionsErrors.responseInvalid(`${fieldName} must be a valid descriptor.`, {
      ...context,
      response
    });
  }

  return descriptor;
}
