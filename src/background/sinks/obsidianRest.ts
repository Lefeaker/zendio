export async function writeFile(
  rest: { baseUrl: string; httpsUrl?: string; httpUrl?: string; vault: string; apiKey: string },
  filePath: string,
  content: string
) {
  // 对路径的每个部分分别编码，保留斜杠
  const encodedPath = filePath.split('/').map(part => encodeURIComponent(part)).join('/');

  console.log('Writing to Obsidian:', {
    filePath,
    baseUrl: rest.baseUrl,
    httpsUrl: rest.httpsUrl,
    httpUrl: rest.httpUrl,
    vault: rest.vault,
    hasApiKey: !!rest.apiKey,
    apiKeyLength: rest.apiKey?.length,
    apiKeyFirst8: rest.apiKey?.slice(0, 8),
    apiKeyLast8: rest.apiKey?.slice(-8)
  });

  async function doPut(targetUrl: string, protocol: string) {
    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${rest.apiKey}`,
        'Content-Type': 'text/markdown; charset=utf-8'
      },
      body: content
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`REST write failed (${protocol}): ${res.status} ${errorText}`);
    }
    return res;
  }

  // 构建 URL 的辅助函数
  function buildUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/$/,'')}/vault/${encodeURIComponent(rest.vault)}/${encodedPath}`;
  }

  // 准备要尝试的 URL 列表
  const urlsToTry: Array<{url: string, protocol: string}> = [];

  // 检查是否是本地地址
  const isLocalAddress = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)/.test(url);

  // 如果用户配置了 httpsUrl 和 httpUrl，优先使用这些配置
  if (rest.httpsUrl || rest.httpUrl) {
    console.log('使用用户配置的 HTTPS/HTTP URL');

    // 如果配置了 HTTPS URL，先尝试
    if (rest.httpsUrl && rest.httpsUrl.trim()) {
      urlsToTry.push({
        url: buildUrl(rest.httpsUrl),
        protocol: 'HTTPS (用户配置)'
      });
    }

    // 如果配置了 HTTP URL，再尝试
    if (rest.httpUrl && rest.httpUrl.trim()) {
      urlsToTry.push({
        url: buildUrl(rest.httpUrl),
        protocol: 'HTTP (用户配置)'
      });
    }

    // 如果两个都配置了，还可以尝试交换端口作为后备
    if (rest.httpsUrl && rest.httpUrl && isLocalAddress(rest.httpsUrl)) {
      // 尝试 HTTP 的其他常见端口
      const httpAltPort = rest.httpUrl.replace(':27123', ':27124');
      if (httpAltPort !== rest.httpUrl) {
        urlsToTry.push({
          url: buildUrl(httpAltPort),
          protocol: 'HTTP (备用端口)'
        });
      }
    }
  } else {
    // 如果没有配置 httpsUrl/httpUrl，使用旧的 baseUrl 逻辑（向后兼容）
    console.log('使用 baseUrl 配置（向后兼容模式）');

    if (isLocalAddress(rest.baseUrl)) {
      const isHttps = rest.baseUrl.startsWith('https://');

      if (isHttps) {
        // 如果配置的是 HTTPS，先尝试 HTTPS，失败后尝试 HTTP
        urlsToTry.push({
          url: buildUrl(rest.baseUrl),
          protocol: 'HTTPS'
        });

        // 尝试 HTTP（同端口）
        urlsToTry.push({
          url: buildUrl(rest.baseUrl.replace(/^https:/, 'http:')),
          protocol: 'HTTP (same port)'
        });

        // 尝试 HTTP（常见的不安全端口 27123）
        const httpAltPort = rest.baseUrl.replace(/^https:/, 'http:').replace(':27124', ':27123');
        if (httpAltPort !== rest.baseUrl.replace(/^https:/, 'http:')) {
          urlsToTry.push({
            url: buildUrl(httpAltPort),
            protocol: 'HTTP (port 27123)'
          });
        }
      } else {
        // 如果配置的是 HTTP，先尝试 HTTP，失败后尝试 HTTPS
        urlsToTry.push({
          url: buildUrl(rest.baseUrl),
          protocol: 'HTTP'
        });

        // 尝试 HTTPS（同端口）
        urlsToTry.push({
          url: buildUrl(rest.baseUrl.replace(/^http:/, 'https:')),
          protocol: 'HTTPS (same port)'
        });

        // 尝试 HTTPS（常见的安全端口 27124）
        const httpsAltPort = rest.baseUrl.replace(/^http:/, 'https:').replace(':27123', ':27124');
        if (httpsAltPort !== rest.baseUrl.replace(/^http:/, 'https:')) {
          urlsToTry.push({
            url: buildUrl(httpsAltPort),
            protocol: 'HTTPS (port 27124)'
          });
        }
      }
    } else {
      // 对于非本地地址，只使用配置的协议
      urlsToTry.push({
        url: buildUrl(rest.baseUrl),
        protocol: rest.baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
      });
    }
  }

  const errors: Array<{protocol: string, error: Error}> = [];

  // 依次尝试所有 URL
  for (const {url, protocol} of urlsToTry) {
    try {
      console.log(`Trying ${protocol}:`, url.replace(rest.apiKey, '***'));
      const res = await doPut(url, protocol);
      console.log(`✅ Write successful (${protocol}):`, res.status);
      return; // 成功则直接返回
    } catch (error) {
      const err = error as Error;
      console.warn(`❌ ${protocol} failed:`, err.message);
      errors.push({ protocol, error: err });
      
      // 如果不是连接失败，直接抛出错误（可能是认证或其他问题）
      if (!err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
      
      // 继续尝试下一个 URL
    }
  }

  // 所有尝试都失败了，生成详细的错误信息
  const errorDetails = errors.map(e => `  - ${e.protocol}: ${e.error.message}`).join('\n');

  const configInfo = rest.httpsUrl || rest.httpUrl
    ? `HTTPS: ${rest.httpsUrl || '未配置'}, HTTP: ${rest.httpUrl || '未配置'}`
    : `baseUrl: ${rest.baseUrl}`;

  throw new Error(
    `无法连接到 Obsidian Local REST API。\n` +
    `配置：${configInfo}\n` +
    `已尝试的协议：\n${errorDetails}\n\n` +
    `请检查：\n` +
    `1. Obsidian 是否正在运行\n` +
    `2. Local REST API 插件是否已启用\n` +
    `3. 在扩展选项中配置正确的 HTTPS 和 HTTP URL\n` +
    `4. 检查防火墙设置是否阻止了连接`
  );
}

