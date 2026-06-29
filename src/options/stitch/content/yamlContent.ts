import { configProvider, getPreviewTemplateDefaults } from '@shared/config';
import { message } from '../previewNavigation';
import type { PreviewContent } from '../types';

const SAMPLE_RESEARCH_VAULT = message('schemaPreviewSampleVaultResearch');
const SAMPLE_INBOX_VAULT = message('schemaPreviewSampleVaultInbox');
const SAMPLE_ARCHIVE_VAULT = message('schemaPreviewSampleVaultArchive');
const REST_DEFAULTS = configProvider.getRestDefaults();

function withRestPortOffset(url: string, offset: number): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const currentPort = Number.parseInt(parsed.port, 10);
  if (!Number.isFinite(currentPort)) {
    return url;
  }

  parsed.port = String(currentPort + offset);
  return parsed.toString();
}

export const storageContent: PreviewContent['storage'] = {
  hero: {
    title: 'Storage',
    description: message('schemaStorageHeroDescription'),
    pills: ['Vault List', 'Routing Engine'],
    icon: 'storage'
  },
  routingTypeOptions: [
    { value: 'Domain', label: 'Domain' },
    { value: 'Keyword', label: 'Keyword' },
    { value: 'URL Pattern', label: message('ruleTypeUrlPattern') }
  ],
  vaults: [
    {
      name: 'Zendio',
      https: REST_DEFAULTS.httpsUrl,
      http: REST_DEFAULTS.httpUrl,
      key: 'sk-demo-demo-demo',
      enabled: true,
      isDefault: true
    },
    {
      name: SAMPLE_RESEARCH_VAULT,
      https: REST_DEFAULTS.httpsUrl,
      http: REST_DEFAULTS.httpUrl,
      key: 'research-key',
      enabled: true,
      isDefault: false
    },
    {
      name: SAMPLE_INBOX_VAULT,
      https: withRestPortOffset(REST_DEFAULTS.httpsUrl, 6),
      http: withRestPortOffset(REST_DEFAULTS.httpUrl, 6),
      key: 'inbox-key',
      enabled: true,
      isDefault: false
    },
    {
      name: SAMPLE_ARCHIVE_VAULT,
      https: withRestPortOffset(REST_DEFAULTS.httpsUrl, 12),
      http: withRestPortOffset(REST_DEFAULTS.httpUrl, 12),
      key: 'archive-key',
      enabled: false,
      isDefault: false
    }
  ],
  routingRules: [
    {
      type: 'Domain',
      pattern: 'youtube.com; bilibili.com',
      target: SAMPLE_RESEARCH_VAULT,
      priority: 100,
      enabled: true
    },
    {
      type: 'Keyword',
      pattern: 'paper, survey, report',
      target: SAMPLE_RESEARCH_VAULT,
      priority: 80,
      enabled: true
    },
    {
      type: 'URL Pattern',
      pattern: 'https://*.weixin.qq.com/*',
      target: SAMPLE_INBOX_VAULT,
      priority: 60,
      enabled: true
    }
  ]
};

export const outputContent: PreviewContent['output'] = {
  hero: {
    title: message('schemaOutputTitle'),
    description: message('schemaOutputHeroDescription'),
    pills: ['Templates', 'Domain Naming', 'YAML Schema'],
    icon: 'output'
  },
  templateDefaults: getPreviewTemplateDefaults(),
  tokens: [
    '{platform}',
    '{domain}',
    '{yyyy}',
    '{mm}',
    '{dd}',
    '{HHmmss}',
    '{HHmm}',
    '{HH}',
    '{ss}',
    '{slug}',
    '{title}'
  ],
  domainMappings: [
    ['mp.weixin.qq.com', 'WeChat OA', 'WeChat official-account articles'],
    ['arxiv.org', 'Arxiv', 'Unified naming for paper folders'],
    ['chatgpt.com', 'ChatGPT', 'Alias for AI chat platform']
  ],
  yamlFilters: [
    { value: 'all', label: 'All' },
    { value: 'article', label: 'Article' },
    { value: 'clipper', label: 'Fragment' },
    { value: 'video', label: 'Video' },
    { value: 'ai_chat', label: message('schemaYamlFilterAiChatLabel') }
  ],
  yamlRows: [
    {
      group: 'Default Fields',
      groupId: 'default',
      rows: [
        [
          'type',
          'text',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'On' },
          'default per content type',
          'Source'
        ],
        [
          'title',
          'text',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'Off' },
          'title',
          'Source'
        ],
        [
          'url',
          'text',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'On' },
          'url',
          'Source'
        ],
        [
          'clipped_at',
          'date',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'On' },
          'clipped_at',
          'Source'
        ],
        [
          'tags',
          'array',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'On' },
          'default tags',
          'Source'
        ],
        ['author', 'text', { article: 'Optional' }, 'metadata.author', 'Source'],
        ['published_at', 'date', { article: 'Optional' }, 'metadata.published', 'Source'],
        ['highlight_count', 'number', { clipper: 'On' }, 'stats.highlightCount', 'Source'],
        ['export_mode', 'text', { clipper: 'On' }, 'context.exportMode', 'Source'],
        ['platform', 'text', { video: 'On', ai_chat: 'On' }, 'platform', 'Source'],
        ['capture_count', 'number', { video: 'On' }, 'stats.captureCount', 'Source'],
        ['timestamp_count', 'number', { video: 'On' }, 'stats.timestampCount', 'Source'],
        ['fragment_count', 'number', { video: 'On' }, 'stats.fragmentCount', 'Source'],
        ['model', 'text', { ai_chat: 'On' }, 'model', 'Source'],
        ['message_count', 'number', { ai_chat: 'On' }, 'stats.messageCount', 'Source']
      ]
    },
    {
      group: 'Custom & Global Fields',
      groupId: 'custom',
      rows: [
        ['status', 'array', { article: 'On' }, '["unread"]', 'Custom'],
        [
          'workspace',
          'text',
          { article: 'On', clipper: 'On', video: 'On', ai_chat: 'On' },
          'context.workspace',
          'Global'
        ]
      ]
    }
  ],
  yamlDomainRules: [
    {
      types: ['article'],
      typeLabel: 'article',
      domain: 'arxiv.org',
      rows: [
        ['citation_key', 'On', 'metadata.citationKey', ''],
        ['authors', 'On', 'metadata.authors', '']
      ]
    },
    {
      types: ['article'],
      typeLabel: 'article',
      domain: 'mp.weixin.qq.com',
      rows: [['official_account', 'On', 'metadata.wechat.account', '']]
    }
  ],
  presets: [
    ['Minimal', 'Title, source, date, and base tags. Good for quick capture.'],
    ['Research', 'Adds author, published_at, citation, status, and workspace.'],
    ['Conversation', 'Keeps platform, message_count, topic, and session metadata for AI chats.']
  ]
};
