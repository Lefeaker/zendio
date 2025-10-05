export const APP_ICON_PATH = 'assets/icons/icon128.png';

export const DEFAULT_DOMAIN_MAPPINGS: Record<string, string> = {
  'mp.weixin.qq.com': '公众号',
  'wx.zsxq.com': '知识星球',
  'www.zhihu.com': '知乎',
  'juejin.cn': '掘金',
  'www.youtube.com': 'YouTube',
  'twitter.com': 'Twitter',
  'x.com': 'Twitter',
  'medium.com': 'Medium'
};

export const DEFAULT_CLASSIFIER_TAXONOMY = {
  type: ['article', 'ai_chat'],
  topics: ['cs', 'math', 'product', 'research', 'howto', 'news', 'misc'],
  ai_platform: ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'poe', 'other']
};

export { USAGE_STATS_STORAGE_KEY, DEFAULT_USAGE_STATS, normalizeUsageStats } from './usage';
