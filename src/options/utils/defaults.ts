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
  topics: ['cs', 'misc'],
  ai_platform: ['chatgpt', 'claude', 'other']
};
