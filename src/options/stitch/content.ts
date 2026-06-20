import { changelogResource } from './changelogResourceData';
import { createReleaseLanguageOptions } from './languageOptions';
import { message, previewNavigation } from './previewNavigation';
import { getPreviewTemplateDefaults } from '@shared/config';
import { VIDEO_MODE_ICON_PATH } from '@shared/assets/iconPaths';
import { ZENDIO_RESOURCE_LINKS } from '@shared/links/zendioResourceLinks';
import type { PreviewContent } from './types';

const SAMPLE_RESEARCH_VAULT = message('schemaPreviewSampleVaultResearch');
const SAMPLE_INBOX_VAULT = message('schemaPreviewSampleVaultInbox');
const SAMPLE_ARCHIVE_VAULT = message('schemaPreviewSampleVaultArchive');
const SAMPLE_VIDEO_VAULT = message('schemaPreviewSampleVaultVideo');
const SAMPLE_ARTICLE_TITLE = message('schemaPreviewClipperSourceArticleTitle');
const SAMPLE_VIDEO_CAPTURE_QUOTE = message('schemaPreviewVideoCaptureTwoSummary');
const SAMPLE_USAGE_TOTAL_LABEL = message('schemaPreviewUsageTotalLabel');

const usageHistoryValues = [
  24, 28, 31, 36, 33, 39, 44, 41, 48, 53, 58, 55, 62, 67, 61, 57, 52, 49, 54, 60, 66, 72, 78, 74,
  69, 64, 70, 76, 82, 79
];

const usageHistory = usageHistoryValues.map((value, index) => {
  const day = index + 23;
  const month = day <= 31 ? '03' : '04';
  const date = day <= 31 ? day : day - 31;
  return {
    label: `${month}-${String(date).padStart(2, '0')}`,
    value
  };
});

export const previewContent: PreviewContent = {
  brand: {
    title: 'Zendio',
    subtitle: previewNavigation.brandSubtitle,
    logo: '../../AiiinOB/public/icons/bannerlogo-128.png'
  },
  rendererLabels: {
    resourcePendingBadge: 'Pending',
    resourceOpenAction: 'Open',
    highlightExamplePrefix: 'An exported example will look like ',
    highlightExampleText: 'this highlighted section',
    highlightExampleSuffix: ', making it easier to revisit later.'
  },
  sidebarLinks: previewNavigation.sidebarLinks,
  surfaceLinks: previewNavigation.surfaceLinks,
  nav: previewNavigation.nav,
  overview: {
    hero: {
      title: 'Overview',
      description: message('schemaOverviewHeroDescription'),
      pills: ['Default vault ready', 'Routing active', 'YAML configured'],
      icon: 'dashboard'
    },
    stats: [
      { label: SAMPLE_USAGE_TOTAL_LABEL, value: 1284 },
      { label: message('usageAiLabel'), value: 436 },
      { label: message('usageFragmentLabel'), value: 406 },
      { label: 'Articles', value: 442 }
    ],
    history: usageHistory
  },
  languageOptions: createReleaseLanguageOptions(),
  privacyCollected: [
    'Error type and call site',
    'Browser / extension version',
    'Failure timestamp',
    'Anonymous feature usage counts'
  ],
  privacyExcluded: [
    'Personal identity information',
    'Page content and clipped text',
    'Private URL lists',
    'Plaintext passwords and API keys'
  ],
  storage: {
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
        https: 'https://127.0.0.1:27124/',
        http: 'http://127.0.0.1:27123/',
        key: 'sk-demo-demo-demo',
        enabled: true,
        isDefault: true
      },
      {
        name: SAMPLE_RESEARCH_VAULT,
        https: 'https://127.0.0.1:27124/',
        http: 'http://127.0.0.1:27123/',
        key: 'research-key',
        enabled: true,
        isDefault: false
      },
      {
        name: SAMPLE_INBOX_VAULT,
        https: 'https://127.0.0.1:27130/',
        http: 'http://127.0.0.1:27129/',
        key: 'inbox-key',
        enabled: true,
        isDefault: false
      },
      {
        name: SAMPLE_ARCHIVE_VAULT,
        https: 'https://127.0.0.1:27136/',
        http: 'http://127.0.0.1:27135/',
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
  },
  captureSources: {
    hero: {
      title: message('schemaCaptureSourcesTitle'),
      description: 'Configure source-based capture capabilities for AI and video.',
      pills: ['AI Chat', 'Video'],
      icon: 'ads_click'
    },
    aiPlatforms: ['ChatGPT', 'Claude', 'Gemini', 'Kimi', 'DeepSeek', 'Tongyi', 'Doubao', 'Monica']
  },
  captureBehavior: {
    hero: {
      title: message('schemaCaptureBehaviorTitle'),
      description: message('schemaCaptureBehaviorHeroDescription'),
      pills: ['Reading Session', 'Fragment Clipper'],
      icon: 'menu_book'
    }
  },
  output: {
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
  },
  experimental: {
    hero: {
      title: 'Experimental',
      description: message('schemaExperimentalHeroDescription'),
      pills: [
        'Shared AI Service',
        'Page Summary',
        'Reading Overlay Summary',
        'Subtitle Translation'
      ],
      icon: 'science'
    },
    providerOptions: [
      { value: 'openai', label: 'OpenAI' },
      {
        value: 'compatible',
        label: message('schemaExperimentalProviderCompatibleOption')
      },
      { value: 'siliconflow', label: 'SiliconFlow' },
      { value: 'ollama', label: 'Ollama' }
    ],
    aiDefaults: {
      provider: 'compatible',
      model: 'gpt-4.1-mini',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: ''
    },
    subtitleLanguages: [
      {
        value: 'zh-CN',
        label: message('schemaOverviewLanguageOptionZhCn')
      },
      { value: 'en', label: 'English' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'de', label: 'German' },
      { value: 'es', label: 'Spanish' }
    ]
  },
  resources: {
    privacyPolicy: {
      hero: {
        title: message('schemaResourcePrivacyPolicyTitle'),
        description: message('schemaResourcePrivacyPolicyDescription'),
        pills: ['Local-first', 'GA4 opt-in', 'No content analytics'],
        icon: 'privacy_tip'
      },
      sections: [
        {
          title: message('errorReportingNotCollectedTitle'),
          body: message('schemaResourcePrivacyPolicyDescription'),
          bullets: [
            'Page content, clipped text, reading notes, and video note text',
            'Full URLs, query strings, Vault names, file names, and local paths',
            'Screenshot bytes, data URLs, cache keys, passwords, tokens, and cookies',
            'Personal identity information'
          ]
        },
        {
          title: message('analyticsConsentTitle'),
          body: message('schemaResourceDataUsageAnonymousUsageBody')
        },
        {
          title: message('schemaResourcePrivacyLocalConfigTitle'),
          body: message('schemaResourcePrivacyLocalConfigBody')
        }
      ]
    },
    dataUsage: {
      hero: {
        title: message('schemaResourceDataUsageTitle'),
        description: message('schemaResourceDataUsageDescription'),
        pills: ['Usage dashboard', 'Diagnostics', 'Transfer'],
        icon: 'analytics'
      },
      sections: [
        {
          title: message('schemaResourceDataUsageAnonymousUsageTitle'),
          body: message('schemaResourceDataUsageAnonymousUsageBody')
        },
        {
          title: message('errorReportingConsentTitle'),
          body: message('errorReportingConsentDescription')
        },
        {
          title: message('schemaResourceDataUsageConfigMigrationTitle'),
          body: message('schemaResourceDataUsageConfigMigrationBody')
        }
      ]
    },
    onboarding: {
      hero: {
        title: message('schemaResourceOnboardingTitle'),
        description: message('schemaResourceOnboardingDescription'),
        pills: [
          message('apiConfigTitle'),
          message('schemaStorageVaultListTitle'),
          message('schemaStorageRoutingGroupTitle'),
          message('schemaOutputYamlGroupTitle')
        ],
        icon: 'rocket_launch'
      },
      steps: [
        {
          number: '1',
          title: message('step1Title'),
          description: message('step1Description'),
          bullets: [
            'Install and enable the Local REST API plugin in Obsidian',
            'Turn on Enable Non-encrypted (HTTP) Server',
            'Record the HTTPS URL, usually https://127.0.0.1:27124/',
            'Record the HTTP URL, usually http://127.0.0.1:27123/',
            'Record the vault name and copy the API key'
          ]
        },
        {
          number: '2',
          title: message('step2Title'),
          description: message('step2Description'),
          bullets: [
            'Additional vaults use the same HTTPS / HTTP / API key setup as the default vault',
            'Route rules can match by domain, keyword, or URL pattern',
            'Content that matches no rule falls back to the default vault'
          ]
        },
        {
          number: '3',
          title: message('step3Title'),
          description: message('step3Description'),
          bullets: [
            'Click blank space on a webpage to save the full page',
            'Auto-detect and export content from mainstream AI chat platforms',
            'Reader Mode batches note-taking across highlights and saves full-page highlights',
            'Video Mode supports timestamp notes, captured comments, and jump-back links'
          ]
        },
        {
          number: '4',
          title: message('step4Title'),
          description: message('step4Description'),
          bullets: [
            'Copy configuration between browsers on the same device',
            'Map domains to friendlier folder names',
            'Customize path templates',
            'Use built-in diagnostics to troubleshoot configuration issues'
          ]
        },
        {
          number: '5',
          title: message('step5Title'),
          description: message('step5Description'),
          bullets: [
            'More AI capabilities will continue to land over time',
            'The long-term goal is a two-way workflow between the browser and Obsidian',
            'Suggestion, support, and contact entry points remain available in Settings'
          ]
        }
      ]
    },
    pluginSetup: {
      hero: {
        title: message('schemaResourcePluginSetupTitle'),
        description: message('schemaResourcePluginSetupDescription'),
        pills: ['Obsidian Plugin', 'Dual URL', 'Vault Name', 'Connection Test'],
        icon: 'extension'
      },
      ports: [
        ['HTTPS URL', 'https://127.0.0.1:27124/'],
        ['HTTP URL', 'http://127.0.0.1:27123/'],
        ['Vault', 'your-vault-name'],
        ['API Key', 'your-api-key']
      ],
      steps: [
        {
          title: message('schemaResourcePluginSetupStep1'),
          body: ''
        },
        {
          title: message('schemaResourcePluginSetupStep2'),
          body: ''
        },
        {
          title: message('schemaResourcePluginSetupStep3'),
          body: ''
        },
        {
          title: message('schemaResourcePluginSetupStep4'),
          body: ''
        }
      ],
      checks: [
        'Obsidian is running and Local REST API is enabled',
        'The HTTP / HTTPS addresses match the Obsidian settings',
        'The vault name is spelled correctly',
        'The API key was copied completely with no extra spaces',
        'The Storage page connection test returns success'
      ]
    },
    support: {
      hero: {
        title: 'Support',
        description: message('schemaResourceSupportDescription'),
        pills: ['Ko-fi', message('schemaResourceSupportAfdianTitle')],
        icon: 'favorite'
      },
      channels: [
        {
          title: 'Ko-fi',
          subtitle: message('schemaResourceSupportKoFiDescription'),
          icon: './icons/ko-fi.svg',
          href: ZENDIO_RESOURCE_LINKS.koFi
        },
        {
          title: message('schemaResourceSupportAfdianTitle'),
          subtitle: message('schemaResourceSupportAfdianDescription'),
          icon: './icons/wechat-reward.svg',
          image: './icons/wechat-reward-qr.jpg'
        }
      ]
    },
    suggestions: {
      hero: {
        title: 'Suggestions',
        description: message('schemaResourceSuggestionsDescription'),
        pills: ['GitHub Issue', 'Reddit'],
        icon: 'lightbulb'
      },
      channels: [
        {
          title: message('schemaResourceSuggestionsGithubTitle'),
          subtitle: message('schemaResourceSuggestionsGithubDescription'),
          icon: './icons/github-fill.svg',
          href: ZENDIO_RESOURCE_LINKS.githubIssuesNew
        },
        {
          title: message('schemaResourceSuggestionsRedditTitle'),
          subtitle: message('schemaResourceSuggestionsRedditDescription'),
          icon: './icons/reddit.svg',
          href: ZENDIO_RESOURCE_LINKS.redditAuthor
        }
      ]
    },
    contact: {
      hero: {
        title: 'Contact',
        description: message('schemaResourceContactHint'),
        pills: ['Website', 'Reddit', 'Email'],
        icon: 'mail'
      },
      entries: [
        {
          title: 'Reddit',
          subtitle: message('schemaResourceContactRedditDescription'),
          href: ZENDIO_RESOURCE_LINKS.redditAuthor
        },
        {
          title: message('schemaResourceContactGithubTitle'),
          subtitle: message('schemaResourceContactGithubDescription'),
          href: ZENDIO_RESOURCE_LINKS.githubProfile
        },
        {
          title: message('schemaResourceContactEmailTitle'),
          subtitle: message('schemaResourceContactEmailDescription'),
          href: ZENDIO_RESOURCE_LINKS.supportEmail
        }
      ],
      note: 'If you like the product or want to talk with the author, use the website, social channels, GitHub, or email.'
    },
    changelog: changelogResource
  },
  surfaces: {
    clipper: {
      hero: {
        title: message('schemaRuntimeClipperTitle'),
        description: message('schemaRuntimeClipperDescription'),
        pills: ['Clip Selection', 'Reader Entry', 'Video Entry', 'Shortcuts'],
        icon: 'content_cut'
      },
      iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_clipt.png',
      labels: {
        title: message('clipDialogTitle'),
        selectionPreview: 'Selection Preview',
        commentLabel: 'Comment'
      },
      source: {
        title: SAMPLE_ARTICLE_TITLE,
        host: 'macworld.com/article/2024-macos-update',
        initials: 'MW',
        verifiedLabel: 'Verified source'
      },
      destination: {
        id: 'vault-research',
        kind: 'vault',
        label: SAMPLE_RESEARCH_VAULT,
        path: 'Clippings/macOS update preview article.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-research',
            kind: 'vault',
            label: SAMPLE_RESEARCH_VAULT,
            path: 'Clippings/macOS update preview article.md',
            selected: true
          },
          {
            id: 'downloads',
            kind: 'downloads',
            label: 'Downloads',
            path: 'Clippings/macOS update preview article.md',
            selected: false
          }
        ]
      },
      selectedText:
        'What matters most is not the information itself, but the links between that information and what you already know. Only when those links are written down can your future self re-enter the original train of thought.',
      commentPlaceholder: 'Write down your interpretation, question, or follow-up...',
      helper:
        'Double Enter opens Reader Mode, Cmd/Ctrl + Enter saves immediately, Esc cancels, and Alt + arrow keys move the dialog.',
      shortcuts: [
        'Double ↵ to open Reader Mode',
        'Cmd/Ctrl + ↵ to save immediately',
        'Esc to cancel',
        'Alt + arrow keys to move the dialog'
      ],
      actions: [
        { id: 'reader', label: message('addToReaderButton'), variant: 'ghost' },
        { id: 'video', label: message('openVideoModeButton'), variant: 'ghost' },
        { id: 'clip', label: message('clipButton'), variant: 'primary' }
      ]
    },
    reader: {
      hero: {
        title: message('schemaRuntimeReaderTitle'),
        description: message('schemaRuntimeReaderDescription'),
        pills: ['Non-modal Panel', 'Highlight List', 'Inline Comment Edit', 'AI Summary Slot'],
        icon: 'auto_stories'
      },
      iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_readingt.png',
      labels: {
        title: message('schemaRuntimeReaderTitle'),
        subtitle: message('readerPanelStatus'),
        exitTriggerLabel: 'Exit',
        exitTitle: 'Leave this panel?',
        exitCancelLabel: 'Keep editing',
        exitConfirmLabel: 'Confirm exit',
        notePlaceholder: 'Add your takeaway for this highlight...',
        saveLabel: 'Save',
        deleteLabel: 'Delete'
      },
      hint: message('readerPanelHint'),
      counter: '4',
      destination: {
        id: 'vault-research',
        kind: 'vault',
        label: SAMPLE_RESEARCH_VAULT,
        path: 'Reading/macOS update preview article.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-research',
            kind: 'vault',
            label: SAMPLE_RESEARCH_VAULT,
            path: 'Reading/macOS update preview article.md',
            selected: true
          },
          {
            id: 'downloads',
            kind: 'downloads',
            label: 'Downloads',
            path: 'Reading/macOS update preview article.md',
            selected: false
          }
        ]
      },
      overlaySummary:
        'AI summary: This article focuses on how information links become reusable knowledge over time, emphasizing that highlights alone matter less than the context and judgment you add around them.',
      highlights: [
        {
          id: 'reader-1',
          index: 1,
          excerpt:
            'What matters most is not the information itself, but the links between that information and what you already know.',
          fullText:
            'What matters most is not the information itself, but the links between that information and what you already know. Without those links, a saved excerpt often turns into a beautiful sentence with no remaining context.',
          commentPreview:
            'This works well near the top of the article as the lead note for the Reader Mode export.',
          comment:
            'This works well near the top of the article as the lead note for the Reader Mode export.',
          timestamp: 'Today 21:14'
        },
        {
          id: 'reader-2',
          index: 2,
          excerpt:
            'The value of information is not that it was stored, but that it can be understood again in the future.',
          fullText:
            'The value of information is not that it was stored, but that it can be understood again in the future. Re-understanding depends on the original context, your note, and the nearby nodes in your knowledge graph.',
          commentPreview: 'Add an example here to explain why saving a link alone is not enough.',
          comment: 'Add an example here to explain why saving a link alone is not enough.',
          timestamp: 'Today 21:18'
        },
        {
          id: 'reader-3',
          index: 3,
          excerpt:
            'A highlight is only an anchor; what really helps memory is the judgment you write beside it.',
          fullText:
            'A highlight is only an anchor; what really helps memory is the judgment you write beside it. The value of Reader Mode is turning that step from a mental action into structured output.',
          commentPreview: 'Click to enter inline editing.',
          draft:
            'Add a sentence here explaining why the judgment belongs in Reader Mode instead of waiting until later in Obsidian.',
          timestamp: 'Today 21:26',
          editing: true
        }
      ],
      actions: [
        { id: 'reader:finish', label: message('readerPanelFinish'), variant: 'primary' },
        { id: 'reader:cancel', label: 'Cancel', variant: 'ghost' }
      ]
    },
    video: {
      hero: {
        title: message('schemaRuntimeVideoTitle'),
        description: message('schemaRuntimeVideoDescription'),
        pills: ['Timestamp Notes', 'Fragment Capture', 'Inline Edit', 'YouTube / Bilibili'],
        icon: 'smart_display'
      },
      iconUrl: `../../AiiinOB/public/${VIDEO_MODE_ICON_PATH}`,
      labels: {
        title: message('schemaRuntimeVideoTitle'),
        subtitle: message('videoPanelStatus'),
        exitTriggerLabel: 'Exit',
        exitTitle: 'Leave this panel?',
        exitCancelLabel: 'Keep editing',
        exitConfirmLabel: 'Confirm exit',
        notePlaceholder: 'Add context for this timestamp or subtitle fragment...',
        saveLabel: 'Save',
        deleteLabel: 'Delete',
        addLabel: 'Note current timestamp',
        emptyCapturePlaceholder: 'Write a note for the current timestamp...'
      },
      status: 'YouTube · 01:23:14 · Following current playback time',
      hint: message('videoPanelHint'),
      counter: '3',
      destination: {
        id: 'vault-video',
        kind: 'vault',
        label: SAMPLE_VIDEO_VAULT,
        path: 'Videos/demo-video-notes.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-video',
            kind: 'vault',
            label: SAMPLE_VIDEO_VAULT,
            path: 'Videos/demo-video-notes.md',
            selected: true
          },
          {
            id: 'downloads',
            kind: 'downloads',
            label: 'Downloads',
            path: 'Videos/demo-video-notes.md',
            selected: false
          }
        ]
      },
      captures: [
        {
          id: 'video-1',
          index: 1,
          kind: 'timestamp',
          markerLabel: '02:45',
          summary: '00:45',
          commentPreview:
            'This is the first explicit definition of the core concept. Cross-reference it with the article version later.',
          comment:
            'This is the first explicit definition of the core concept. Cross-reference it with the article version later.',
          meta: 'https://youtube.com/watch?v=demo&t=45'
        },
        {
          id: 'video-2',
          index: 2,
          kind: 'fragment',
          markerLabel: '08:12',
          summary: SAMPLE_VIDEO_CAPTURE_QUOTE,
          fullText:
            'What creates understanding is the judgment you make while watching. The timestamp only helps you return to the moment; the explanation still comes from your comment and the surrounding context.',
          commentPreview:
            'This subtitle fragment works well as a standalone quote with a follow-up note.',
          comment: 'This subtitle fragment works well as a standalone quote with a follow-up note.',
          meta: 'https://youtube.com/watch?v=demo&t=728'
        },
        {
          id: 'video-3',
          index: 3,
          kind: 'timestamp',
          markerLabel: '12:10',
          summary: '12:08',
          draft:
            'Expand the case here and include that counterexample from the comments before saving.',
          meta: 'https://youtube.com/watch?v=demo&t=728',
          editing: true
        }
      ],
      actions: [
        { id: 'video:finish', label: message('videoPanelFinish'), variant: 'primary' },
        { id: 'video:cancel', label: 'Cancel', variant: 'ghost' }
      ]
    },
    videoFloatingPrompt: {
      label: message('videoPromptAction'),
      shortcut: 'Alt+V',
      dismissLabel: 'Dismiss video-note prompt'
    },
    taskSuccess: {
      hero: {
        title: message('schemaRuntimeTaskSuccessTitle'),
        description: message('schemaRuntimeTaskSuccessDescription'),
        pills: ['Success Prompt', 'Support Links', 'Like / Dislike', 'Toast States'],
        icon: 'celebration'
      },
      status: 'success',
      statusMessage: 'Sent successfully to Research Vault',
      statusDetail:
        'The full page was written to `Articles/Research/2026/` using the current vault routing, and classification finished successfully.',
      progress: { value: 100, variant: 'success' },
      feedbackLabel: 'Quick feedback',
      likeLabel: 'Like',
      dislikeLabel: 'Dislike',
      dismissLabel: 'Click anywhere else to close',
      likeToast: {
        title: message('supportPromptLikeThankYou'),
        detail: message('schemaPreviewTaskSuccessLikeToastDetail'),
        actions: ['Write a review', 'I already left one']
      },
      dislikeToast: {
        title: message('supportPromptDislikeToastTitle'),
        detail: message('schemaPreviewTaskSuccessDislikeToastDetail'),
        actions: ['Discuss on Reddit', 'GitHub']
      }
    }
  },
  maintenanceLog: `Diagnosis Results\n========\n✅ Default vault HTTPS connection is healthy\n✅ At least one additional vault is enabled\n✅ Routing rule priorities do not conflict\n✅ article / clipper / video / ai_chat YAML configuration all parses successfully\n⚠️ fragment.contextLength = 200 is reasonable, but monitor performance in heavier Reader Mode sessions\nℹ️ AI page summaries, Reader Mode top summaries, and subtitle translation are still planned and were not included in this connectivity check\nℹ️ video.floatingPromptEnabled controls whether the note button appears in the video-site control bar`
};
