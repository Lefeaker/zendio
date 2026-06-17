export const APP_ICON_PATH = 'icons/bannerlogo-128.png';

export const DEFAULT_DOMAIN_MAPPINGS: Record<string, string> = {
  'mp.weixin.qq.com': 'WeChat',
  'wx.zsxq.com': 'ZSXQ',
  'www.zhihu.com': 'Zhihu',
  'juejin.cn': 'Juejin',
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
