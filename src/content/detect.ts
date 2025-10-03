export const isAIChat = (url: string, doc: Document) => {
  // Check for known AI chat platforms
  if (/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|perplexity\.ai|poe\.com)/i.test(url)) return true;

  // Check for Chinese AI platforms
  // Note: tongyi.com (not tongyi.aliyun.com) is the actual domain
  if (/(tongyi\.com|tongyi\.aliyun\.com|chat\.deepseek\.com|deepseek\.com|kimi\.moonshot\.cn)/i.test(url)) return true;

  // Fallback: check for common chat UI elements
  const hasQA = doc.querySelector('article, [data-message-author], [class*=prose] pre code');
  return !!hasQA;
};