import type { ConnectionChannel, ConnectionChannelResult } from '../../shared/types/connection';
import { optionsErrors } from '../../shared/errors';

type ConnectionContext = Parameters<typeof optionsErrors.connectionInProgress>[0];

export function validateChannelResult(
  channel: unknown,
  context: ConnectionContext,
  index: number
): ConnectionChannelResult {
  if (!channel || typeof channel !== 'object') {
    throw optionsErrors.responseInvalid(`Channel ${index} is not an object.`, {
      ...context,
      response: channel
    });
  }

  const candidate = channel as Partial<ConnectionChannelResult>;
  if (!isConnectionChannel(candidate.channel)) {
    throw optionsErrors.responseInvalid(`Channel ${index} has an invalid channel id.`, {
      ...context,
      response: channel
    });
  }
  if (
    typeof candidate.label !== 'string' ||
    typeof candidate.configured !== 'boolean' ||
    typeof candidate.success !== 'boolean' ||
    typeof candidate.message !== 'string'
  ) {
    throw optionsErrors.responseInvalid(`Channel ${index} is missing required fields.`, {
      ...context,
      response: channel
    });
  }
  if (candidate.url !== undefined && typeof candidate.url !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "url" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (candidate.status !== undefined && typeof candidate.status !== 'number') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "status" must be a number.`, {
      ...context,
      response: channel
    });
  }
  if (candidate.response !== undefined && typeof candidate.response !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "response" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (candidate.error !== undefined && typeof candidate.error !== 'string') {
    throw optionsErrors.responseInvalid(`Channel ${index} field "error" must be a string.`, {
      ...context,
      response: channel
    });
  }
  if (candidate.certificateUrl !== undefined && typeof candidate.certificateUrl !== 'string') {
    throw optionsErrors.responseInvalid(
      `Channel ${index} field "certificateUrl" must be a string.`,
      {
        ...context,
        response: channel
      }
    );
  }

  return {
    channel: candidate.channel,
    label: candidate.label,
    configured: candidate.configured,
    success: candidate.success,
    message: candidate.message,
    ...(candidate.url !== undefined ? { url: candidate.url } : {}),
    ...(candidate.status !== undefined ? { status: candidate.status } : {}),
    ...(candidate.response !== undefined ? { response: candidate.response } : {}),
    ...(candidate.error !== undefined ? { error: candidate.error } : {}),
    ...(candidate.certificateUrl !== undefined ? { certificateUrl: candidate.certificateUrl } : {})
  };
}

function isConnectionChannel(channel: unknown): channel is ConnectionChannel {
  return channel === 'localFolder' || channel === 'https' || channel === 'http';
}
