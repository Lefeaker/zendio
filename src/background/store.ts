import { VaultRouterConfig, createDefaultVaultRouterConfig } from './vault-router';

type RestCfg = {
  baseUrl: string;
  httpsUrl?: string;  // 新增：HTTPS URL（可选）
  httpUrl?: string;   // 新增：HTTP URL（可选）
  vault: string;
  apiKey: string;
  rootDir?: string
};
type TemplatesCfg = { article: string; ai: string; fragment: string };
type ClassifierCfg = {
  enabled: boolean;
  provider: 'openai' | 'compatible' | 'ollama';
  endpoint?: string;
  apiKey?: string;
  model?: string;
  taxonomy?: any;
};
type DeepResearchCfg = {
  pureMode: boolean;  // true = 只捕捉 Deep Research 报告, false = 包含对话内容
};
type FragmentClipperCfg = {
  useFootnoteFormat: boolean;  // 使用脚注格式（兼容 Sidebar Highlights）
  captureContext: boolean;     // 是否捕捉上下文
  contextLength: number;        // 上下文长度（字符数）
  contextMode: 'chars' | 'sentences';  // 上下文模式：字符数或句子数
};

export type Options = {
  rest: RestCfg;
  templates: TemplatesCfg;
  domainMappings?: Record<string, string>;  // 新增：域名映射
  classifier?: ClassifierCfg;
  deepResearch?: DeepResearchCfg;  // 新增：Deep Research 配置
  vaultRouter?: VaultRouterConfig;  // 新增：多仓库路由配置
  fragmentClipper?: FragmentClipperCfg;  // 新增：片段剪藏配置
};

const DEFAULTS: Options = {
  rest: {
    baseUrl: 'https://127.0.0.1:27124/',  // 保留作为默认值
    httpsUrl: 'https://127.0.0.1:27124/', // HTTPS URL
    httpUrl: 'http://127.0.0.1:27123/',   // HTTP URL
    vault: 'YourVault',
    apiKey: ''
  },
  templates: {
    article: 'Articles/{domain}/{yyyy}/{slug}.md',
    ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md',
    fragment: 'Fragments/{yyyy}/{mm}/{dd}/{title}.md'
  },
  domainMappings: {
    'mp.weixin.qq.com': '公众号',
    'wx.zsxq.com': '知识星球',
    'www.zhihu.com': '知乎',
    'juejin.cn': '掘金',
    'www.youtube.com': 'YouTube',
    'twitter.com': 'Twitter',
    'x.com': 'Twitter',
    'medium.com': 'Medium'
  },
  classifier: {
    enabled: false,
    provider: 'ollama',
    endpoint: 'http://localhost:11434/api/chat',
    model: 'llama3.1',
    taxonomy: {
      type: ['article', 'ai_chat'],
      topics: ['cs','math','product','research','howto','news','misc'],
      ai_platform: ['chatgpt','claude','gemini','copilot','perplexity','poe','other']
    }
  },
  deepResearch: {
    pureMode: false  // 默认包含对话内容
  },
  fragmentClipper: {
    useFootnoteFormat: true,   // 默认使用脚注格式
    captureContext: false,      // 默认不捕捉上下文
    contextLength: 200,         // 默认上下文长度 200 字符
    contextMode: 'chars'        // 默认按字符数
  }
};

export async function getOptions(): Promise<Options> {
  const { options } = await chrome.storage.sync.get('options');

  // 如果没有配置，直接返回默认值
  if (!options) {
    return {
      ...DEFAULTS,
      vaultRouter: undefined  // 不自动创建默认配置
    };
  }

  // 智能合并：优先使用用户配置，只在用户配置缺失时使用默认值
  const merged: Options = {
    rest: {
      baseUrl: options.rest?.baseUrl || DEFAULTS.rest.baseUrl,
      httpsUrl: options.rest?.httpsUrl || DEFAULTS.rest.httpsUrl,
      httpUrl: options.rest?.httpUrl || DEFAULTS.rest.httpUrl,
      vault: options.rest?.vault || DEFAULTS.rest.vault,
      apiKey: options.rest?.apiKey || DEFAULTS.rest.apiKey,
      rootDir: options.rest?.rootDir
    },
    templates: {
      article: options.templates?.article || DEFAULTS.templates.article,
      fragment: options.templates?.fragment || DEFAULTS.templates.fragment,
      ai: options.templates?.ai || DEFAULTS.templates.ai
    },
    domainMappings: options.domainMappings || DEFAULTS.domainMappings,
    classifier: options.classifier ? {
      enabled: options.classifier.enabled ?? DEFAULTS.classifier.enabled,
      provider: options.classifier.provider || DEFAULTS.classifier.provider,
      endpoint: options.classifier.endpoint || DEFAULTS.classifier.endpoint,
      model: options.classifier.model || DEFAULTS.classifier.model,
      apiKey: options.classifier.apiKey || DEFAULTS.classifier.apiKey,
      taxonomy: options.classifier.taxonomy || DEFAULTS.classifier.taxonomy
    } : DEFAULTS.classifier,
    deepResearch: options.deepResearch || DEFAULTS.deepResearch,
    vaultRouter: options.vaultRouter,  // 只使用用户配置的 vaultRouter，不自动创建
    fragmentClipper: options.fragmentClipper ? {
      useFootnoteFormat: options.fragmentClipper.useFootnoteFormat ?? DEFAULTS.fragmentClipper.useFootnoteFormat,
      captureContext: options.fragmentClipper.captureContext ?? DEFAULTS.fragmentClipper.captureContext,
      contextLength: options.fragmentClipper.contextLength || DEFAULTS.fragmentClipper.contextLength,
      contextMode: options.fragmentClipper.contextMode || DEFAULTS.fragmentClipper.contextMode
    } : DEFAULTS.fragmentClipper
  };

  return merged;
}