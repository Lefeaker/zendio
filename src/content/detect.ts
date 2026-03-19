const AI_CHAT_HOST_PATTERNS = [
  /(chatgpt\.com|chat\.openai\.com)$/i,
  /claude\.ai$/i,
  /gemini\.google\.com$/i,
  /kimi\.(moonshot\.cn|com)$/i,
  /deepseek\.com$/i,
  /tongyi\.(aliyun\.com|com)$/i,
  /(?:^|\.)doubao\.com$/i,
  /(?:^|\.)monica\.im$/i
];

function extractHostname(url: string, doc?: Document): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    const fallback = doc?.location?.hostname;
    return fallback ?? null;
  }
}

export const isAIChat = (url: string, doc: Document) => {
  const hostname = extractHostname(url, doc);
  if (!hostname) {
    return false;
  }
  return AI_CHAT_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
};
