const AI_CHAT_URL_PATTERNS = [
  /(chatgpt\.com|chat\.openai\.com)/i,
  /claude\.ai/i,
  /gemini\.google\.com/i,
  /kimi\.(moonshot\.cn|com)/i,
  /deepseek\.com/i,
  /tongyi\.(aliyun\.com|com)/i
];

export const isAIChat = (url: string, _doc: Document) => {
  return AI_CHAT_URL_PATTERNS.some((pattern) => pattern.test(url));
};
