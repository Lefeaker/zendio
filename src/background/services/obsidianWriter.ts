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

export async function writeMarkdownToVault(rest: Options['rest'], filePath: string, markdown: string): Promise<void> {
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
    await restClient.writeFile(connection, filePath, markdown);
  } catch (error) {
    await handleError(
      restErrors.requestFailed(
        `Failed to write markdown to vault: ${filePath}`,
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
