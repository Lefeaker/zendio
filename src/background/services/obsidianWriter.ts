import type { Options } from '../store';
import type { RestConnection } from '../../shared/interfaces/restClient';
import type { RestClient } from '../../shared/interfaces/restClient';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import { handleError } from '../../shared/errors';
import { restErrors } from '../../shared/errors/restErrors';

function getObsidianRestClient(): RestClient {
  return getService<PlatformServices>(TOKENS.platformServices).restClient;
}

export async function writeMarkdownToVault(
  rest: Options['rest'],
  filePath: string,
  markdown: string
): Promise<void> {
  await writeVaultFile(rest, filePath, markdown, 'text/markdown; charset=utf-8');
}

export async function writeAttachmentToVault(
  rest: Options['rest'],
  filePath: string,
  dataUrl: string,
  mimeType: string
): Promise<void> {
  await writeVaultFile(rest, filePath, dataUrlToBlob(dataUrl, mimeType), mimeType);
}

async function writeVaultFile(
  rest: Options['rest'],
  filePath: string,
  content: BodyInit,
  contentType: string
): Promise<void> {
  const restClient = getObsidianRestClient();

  // 将 Options['rest'] 转换为 RestConnection 格式
  const connection: RestConnection = {
    baseUrl: rest.baseUrl,
    vault: rest.vault,
    apiKey: rest.apiKey,
    ...(rest.httpsUrl !== undefined && { httpsUrl: rest.httpsUrl }),
    ...(rest.httpUrl !== undefined && { httpUrl: rest.httpUrl })
  };

  try {
    await restClient.writeFile(connection, filePath, content, { contentType });
  } catch (error) {
    await handleError(
      restErrors.requestFailed(
        `Failed to write file to vault: ${filePath}`,
        {
          endpoint: rest.baseUrl,
          vault: rest.vault,
          method: 'PUT',
          filePath
        },
        { cause: error }
      ),
      { suppressNotifications: true }
    );
    throw error;
  }
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid attachment data URL.');
  }
  const [, mimeType, base64] = match;
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || fallbackMimeType });
}
