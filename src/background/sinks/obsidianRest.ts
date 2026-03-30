import { createFetchRestClient } from '../../infrastructure/restClient';
import type { RestConnection } from '../../shared/interfaces/restClient';

interface RestConfig {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
}

export async function writeFile(rest: RestConfig, filePath: string, content: string): Promise<void> {
  // 将旧的 RestConfig 转换为新的 RestConnection 格式
  const connection: RestConnection = {
    baseUrl: rest.baseUrl,
    vault: rest.vault,
    apiKey: rest.apiKey,
    ...(rest.httpsUrl !== undefined && { httpsUrl: rest.httpsUrl }),
    ...(rest.httpUrl !== undefined && { httpUrl: rest.httpUrl })
  };

  // 使用新的 RestClient 接口
  const restClient = defaultRestClient;
  await restClient.writeFile(connection, filePath, content);
}



// 默认 REST 客户端实例，用于向后兼容
export const defaultRestClient = createFetchRestClient();
