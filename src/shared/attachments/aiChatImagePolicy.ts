import {
  AI_CHAT_IMAGE_MAX_BASE64_LENGTH,
  AI_CHAT_IMAGE_MAX_BYTES,
  AIChatImageResourceError,
  isAIChatImageMime
} from './aiChatImageBytes';

export function parseAIChatImagePageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !host.includes('.') ||
    host.startsWith('[') ||
    /^[\d.]+$/u.test(host) ||
    /(?:^|\.)(?:localhost|local|lan|internal|home)$/u.test(host)
  )
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
  return url;
}

function validateDataImage(url: string): void {
  const comma = url.indexOf(',');
  if (comma < 5 || comma > 256) throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
  const header = url.slice(5, comma);
  if (!isAIChatImageMime(header.split(';')[0]?.toLowerCase() ?? ''))
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_MIME');
  const payload = url.slice(comma + 1);
  if (/;base64$/iu.test(header)) {
    if (payload.length > AI_CHAT_IMAGE_MAX_BASE64_LENGTH)
      throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
    const compact = payload.replace(/[\t\n\f\r ]/gu, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(compact) || compact.length % 4 === 1)
      throw new AIChatImageResourceError('AI_CHAT_IMAGE_DATA');
    const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
    if ((padding && compact.length % 4 !== 0) || (compact.length - padding) % 4 === 1)
      throw new AIChatImageResourceError('AI_CHAT_IMAGE_DATA');
    if (Math.floor(((compact.length - padding) * 3) / 4) > AI_CHAT_IMAGE_MAX_BYTES)
      throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
    return;
  }
  if (payload.length > AI_CHAT_IMAGE_MAX_BYTES * 3)
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  let size = 0;
  for (let index = 0; index < payload.length; index += 1) {
    if (payload[index] === '%') {
      if (!/^[\da-f]{2}$/iu.test(payload.slice(index + 1, index + 3)))
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_DATA');
      index += 2;
      size += 1;
    } else {
      const point = payload.codePointAt(index) ?? 0;
      size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
      if (point >= 65536) index += 1;
    }
    if (size > AI_CHAT_IMAGE_MAX_BYTES) throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  }
}

export function resolveAIChatImageUrl(raw: string, source: URL): URL {
  if (raw.length > AI_CHAT_IMAGE_MAX_BYTES * 3 + 257) {
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  }
  let url: URL;
  try {
    url = new URL(raw, source);
  } catch {
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
  }
  if (url.protocol === 'data:') validateDataImage(url.href);
  else if (url.protocol === 'blob:') {
    if (url.origin !== source.origin) throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
  } else parseAIChatImagePageUrl(url.href);
  return url;
}

export function isAIChatImageBackgroundUrl(url: URL, source: URL, platform: string): boolean {
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    (url.origin === source.origin ||
      (platform === 'grok' && url.origin === 'https://assets.grok.com'))
  );
}

/** Trust only the observed Kimi signing route, not arbitrary same-origin redirects. */
export function isKimiSignedImageUrl(url: URL, source: URL, platform: string): boolean {
  if (
    platform !== 'kimi' ||
    source.origin !== 'https://www.kimi.com' ||
    url.origin !== source.origin ||
    source.username ||
    source.password ||
    url.username ||
    url.password ||
    url.hash ||
    url.href.length > 4096 ||
    !/^\/apiv2-files\/sign-obj\/[^/]{1,2048}$/u.test(url.pathname)
  )
    return false;
  const entries = [...url.searchParams];
  if (entries.length !== 3 || new Set(entries.map(([key]) => key)).size !== 3) return false;
  return entries.every(([key, value]) => {
    if (
      !value.trim() ||
      [...value].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      )
    )
      return false;
    if (key === 'filename') return value.length <= 255;
    if (key === 'sig') return value.length <= 1024;
    return key === 't' && value === 't';
  });
}
