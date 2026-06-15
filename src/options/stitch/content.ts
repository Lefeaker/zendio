import { changelogResource } from './changelogResourceData';
import { createReleaseLanguageOptions } from './languageOptions';
import { getPreviewTemplateDefaults } from '@shared/config';
import type { PreviewContent } from './types';

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
    subtitle: 'Component Preview',
    logo: '../../AiiinOB/public/icons/bannerlogo-128.png'
  },
  rendererLabels: {
    resourcePendingBadge: 'Pending',
    resourceOpenAction: 'Open',
    highlightExamplePrefix: 'An exported example will look like ',
    highlightExampleText: 'this highlighted section',
    highlightExampleSuffix: ', making it easier to revisit later.'
  },
  sidebarLinks: [
    {
      id: 'onboarding',
      label: 'Onboarding',
      hint: 'First-run guide and quick orientation',
      icon: 'rocket_launch'
    },
    {
      id: 'plugin-setup',
      label: 'Plugin Setup',
      hint: 'Local REST API setup guide',
      icon: 'extension'
    },
    {
      id: 'support',
      label: 'Support',
      hint: 'Support channels and service scope',
      icon: 'favorite'
    },
    {
      id: 'suggestions',
      label: 'Suggestions',
      hint: 'Feedback and suggestion channels',
      icon: 'lightbulb'
    },
    { id: 'contact', label: 'Contact', hint: 'Author contact and support email', icon: 'mail' },
    { id: 'changelog', label: 'Changelog', hint: 'Recent release updates', icon: 'history' }
  ],
  surfaceLinks: [
    {
      id: 'clipper',
      label: 'Clipper Dialog',
      hint: 'Selection dialog after highlighting text',
      icon: 'content_cut'
    },
    {
      id: 'reader',
      label: 'Reader Mode',
      hint: 'Floating Reader Mode panel',
      icon: 'auto_stories'
    },
    { id: 'video', label: 'Video Mode', hint: 'Video note panel', icon: 'smart_display' },
    {
      id: 'video-floating-prompt',
      label: 'Video Floating Prompt',
      hint: 'Entry bubble on video pages',
      icon: 'ads_click'
    },
    {
      id: 'task-success',
      label: 'Task Success',
      hint: 'Success prompt and feedback modal',
      icon: 'celebration'
    }
  ],
  nav: [
    {
      id: 'overview',
      label: 'Overview',
      hint: 'Usage, language, privacy, and data controls',
      icon: 'dashboard'
    },
    {
      id: 'storage',
      label: 'Storage',
      hint: 'Vaults, connection settings, and routing',
      icon: 'storage'
    },
    {
      id: 'capture-sources',
      label: 'Capture Sources',
      hint: 'AI Chat and Video',
      icon: 'ads_click'
    },
    {
      id: 'capture-behavior',
      label: 'Capture Behavior',
      hint: 'Reading and Fragment behavior',
      icon: 'menu_book'
    },
    {
      id: 'output',
      label: 'Output & Metadata',
      hint: 'Templates, mappings, and YAML',
      icon: 'output'
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      hint: 'Transfer, diagnosis, and repair',
      icon: 'construction'
    }
  ],
  overview: {
    hero: {
      title: 'Overview',
      description: 'Review current usage and manage language, privacy, and data controls.',
      pills: ['Default vault ready', 'Routing active', 'YAML configured'],
      icon: 'dashboard'
    },
    stats: [
      { label: 'Total saved', value: 1284 },
      { label: 'AI conversations', value: 436 },
      { label: 'Reading + Video + Fragment', value: 406 },
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
      description: 'Manage vault lists, connection settings, and routing rules.',
      pills: ['Vault List', 'Routing Engine'],
      icon: 'storage'
    },
    routingTypeOptions: [
      { value: 'Domain', label: 'Domain' },
      { value: 'Keyword', label: 'Keyword' },
      { value: 'URL Pattern', label: 'URL Pattern' }
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
        name: 'Research Vault',
        https: 'https://127.0.0.1:27124/',
        http: 'http://127.0.0.1:27123/',
        key: 'research-key',
        enabled: true,
        isDefault: false
      },
      {
        name: 'Inbox Vault',
        https: 'https://127.0.0.1:27130/',
        http: 'http://127.0.0.1:27129/',
        key: 'inbox-key',
        enabled: true,
        isDefault: false
      },
      {
        name: 'Archive Vault',
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
        target: 'Research Vault',
        priority: 100,
        enabled: true
      },
      {
        type: 'Keyword',
        pattern: 'paper, survey, report',
        target: 'Research Vault',
        priority: 80,
        enabled: true
      },
      {
        type: 'URL Pattern',
        pattern: 'https://*.weixin.qq.com/*',
        target: 'Inbox Vault',
        priority: 60,
        enabled: true
      }
    ]
  },
  captureSources: {
    hero: {
      title: 'Capture Sources',
      description: 'Configure source-based capture capabilities for AI and video.',
      pills: ['AI Chat', 'Video'],
      icon: 'ads_click'
    },
    aiPlatforms: ['ChatGPT', 'Claude', 'Gemini', 'Kimi', 'DeepSeek', 'Tongyi', 'Doubao', 'Monica']
  },
  captureBehavior: {
    hero: {
      title: 'Capture Behavior',
      description: 'Configure reading exports and fragment interactions.',
      pills: ['Reading Session', 'Fragment Clipper'],
      icon: 'menu_book'
    }
  },
  output: {
    hero: {
      title: 'Output & Metadata',
      description: 'Configure output paths, domain naming, and YAML fields.',
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
      { value: 'ai_chat', label: 'AI Chat' }
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
    yamlPreview: `---\ntype: article\ntitle: "Research Article Example"\nurl: "https://arxiv.org/abs/2401.00001"\nclipped_at: "2026-04-08T18:32:00+08:00"\ntags: ["clipping", "research"]\nstatus: ["unread"]\nworkspace: "research"\nauthors: ["Jane Doe", "John Smith"]\ncitation_key: "doe2026ia"\n---`,
    presets: [
      ['Minimal', 'Title, source, date, and base tags. Good for quick capture.'],
      ['Research', 'Adds author, published_at, citation, status, and workspace.'],
      ['Conversation', 'Keeps platform, message_count, topic, and session metadata for AI chats.']
    ]
  },
  experimental: {
    hero: {
      title: 'Experimental',
      description:
        'Planned AI-assisted capabilities. Disabled by default until real implementations land.',
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
      { value: 'compatible', label: 'OpenAI Compatible' },
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
      { value: 'zh-CN', label: 'Simplified Chinese' },
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
        title: 'Privacy Policy',
        description:
          'Explains what data the extension processes, what it does not collect, and how users can turn related features off.',
        pills: ['Local first', 'No page content analytics', 'User controlled'],
        icon: 'privacy_tip'
      },
      sections: [
        {
          title: 'Not collected',
          body: 'The extension does not upload, sell, or analyze your personal identity or clipped page content.',
          bullets: [
            'Page content and clipped text',
            'Private URL lists',
            'Plaintext passwords and API keys',
            'Personal identity information'
          ]
        },
        {
          title: 'Optional analytics',
          body: 'Anonymous usage statistics and error reporting are controlled by toggles in Settings. When disabled, runtime analytics and error-reporting consent are disabled as well.'
        },
        {
          title: 'Local configuration',
          body: 'Vault settings, REST API details, path templates, YAML fields, and runtime configuration are stored in extension storage and can be exported or cleared through Maintenance.'
        }
      ]
    },
    dataUsage: {
      hero: {
        title: 'Data Usage',
        description:
          'Explains how the Usage Dashboard, error reporting, and diagnostic actions use local or anonymous data.',
        pills: ['Usage dashboard', 'Diagnostics', 'Transfer'],
        icon: 'analytics'
      },
      sections: [
        {
          title: 'Anonymous feature usage',
          body: 'The Usage Dashboard only counts saves, feature types, and recent trends so users can understand their own workflow.'
        },
        {
          title: 'Error reporting',
          body: 'When error reporting is enabled, the extension records error type and call site, browser and extension version, and the failure timestamp.'
        },
        {
          title: 'Configuration transfer',
          body: 'Configuration exported from Maintenance supports same-device or cross-browser transfer; imported JSON is parsed and saved through the real Options controller path.'
        }
      ]
    },
    onboarding: {
      hero: {
        title: 'Onboarding',
        description:
          'Mirrors the current 5-step onboarding flow so new users can finish setup and understand the basics quickly.',
        pills: [
          'Step 1 API',
          'Step 2 Vault Routing',
          'Step 3 Core Features',
          'Step 4 Utilities',
          'Step 5 Feedback'
        ],
        icon: 'rocket_launch'
      },
      steps: [
        {
          number: '1',
          title: 'Set up Obsidian Local REST API',
          description:
            'Finish the Obsidian-side plugin setup and record the connection details first. This is required before the extension can write to Obsidian.',
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
          title: 'Set up additional vaults and routing',
          description:
            'If you use multiple vaults, route content automatically by domain, keywords, or URL pattern.',
          bullets: [
            'Additional vaults use the same HTTPS / HTTP / API key setup as the default vault',
            'Route rules can match by domain, keyword, or URL pattern',
            'Content that matches no rule falls back to the default vault'
          ]
        },
        {
          number: '3',
          title: 'Understand the main workflows',
          description:
            'The current core flows include full-page clipping, AI chat export, Reader Mode, and Video Mode.',
          bullets: [
            'Click blank space on a webpage to save the full page',
            'Auto-detect and export content from mainstream AI chat platforms',
            'Reader Mode batches note-taking across highlights and saves full-page highlights',
            'Video Mode supports timestamp notes, captured comments, and jump-back links'
          ]
        },
        {
          number: '4',
          title: 'Review the supporting tools',
          description:
            'This section covers configuration transfer, domain mappings, custom templates, and diagnostics.',
          bullets: [
            'Copy configuration between browsers on the same device',
            'Map domains to friendlier folder names',
            'Customize path templates',
            'Use built-in diagnostics to troubleshoot configuration issues'
          ]
        },
        {
          number: '5',
          title: 'Keep iterating and sharing feedback',
          description:
            'The project keeps adding smarter capabilities and encourages feedback through the community and issue tracker.',
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
        title: 'Plugin Setup Guide',
        description:
          'A setup guide based on the current real product flow, focused on Obsidian Local REST API and extension connectivity.',
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
          title: '1. Install Local REST API in Obsidian',
          body: 'Install and enable Local REST API from the Obsidian Community Plugins list. It is the only bridge between the extension and a local vault.'
        },
        {
          title: '2. Confirm the HTTP / HTTPS connection info',
          body: 'Check both HTTPS and HTTP addresses in the plugin settings. The current product uses dual-URL configuration, so it is recommended to fill both.'
        },
        {
          title: '3. Record the vault name and API key',
          body: 'Copy the vault name and API key so you can paste them into Storage > Vault List in the extension.'
        },
        {
          title: '4. Test the connection in the extension',
          body: 'Return to the extension settings page, fill the HTTPS / HTTP / API key fields in the first default-vault row, and run the connection test.'
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
        description:
          'Reflects the project’s current support entry points and support expectations instead of empty placeholders.',
        pills: ['Ko-fi', 'Afdian'],
        icon: 'favorite'
      },
      channels: [
        {
          title: 'Ko-fi',
          subtitle: 'Buy me a coffee',
          icon: './icons/ko-fi.svg',
          href: 'https://ko-fi.com/xiannian'
        },
        {
          title: 'Afdian',
          subtitle: 'Support the author in Chinese',
          icon: './icons/aifadian-line-copy.svg',
          href: 'https://afdian.com/a/LefShi'
        }
      ],
      scope: [
        'Install, upgrade, and uninstall basics',
        'Troubleshooting clip failures, AI parsing, and Obsidian writes',
        'Guidance for API tokens, permissions, and network setup',
        'Explanations for privacy, permissions, and data safety'
      ],
      response: [
        'First reply within 48 hours on business days',
        'Complex cases will include an estimated resolution window',
        'Use URGENT in the subject for data-loss or security-risk reports'
      ]
    },
    suggestions: {
      hero: {
        title: 'Suggestions',
        description: 'Uses the existing project feedback channels instead of blank placeholders.',
        pills: ['GitHub Issue', 'Reddit'],
        icon: 'lightbulb'
      },
      channels: [
        {
          title: 'GitHub Issue',
          subtitle: 'Submit feature requests or bug reports',
          href: 'https://github.com/Lefeaker/AllinOB/issues/new?labels=enhancement&title=%5BFeature%20Request%5D%20'
        },
        {
          title: 'Reddit Community',
          subtitle: 'Discuss ideas directly with the author',
          href: 'https://www.reddit.com/user/sxnian/'
        }
      ]
    },
    contact: {
      hero: {
        title: 'Contact',
        description:
          'Combines the existing author-contact entry points with the support-document contact details.',
        pills: ['Reddit', 'GitHub', 'Outlook'],
        icon: 'mail'
      },
      entries: [
        {
          title: 'Reddit',
          subtitle: 'Reddit messages or public profile',
          href: 'https://www.reddit.com/user/sxnian/'
        },
        {
          title: 'GitHub Repository',
          subtitle: 'Browse the project and open issues',
          href: 'https://github.com/Lefeaker/AllinOB'
        },
        {
          title: 'Support Email',
          subtitle: 'Reach support by email',
          href: 'mailto:allinobsidian@outlook.com'
        }
      ],
      note: 'If you like the product or want to talk with the author, the current public contact channels are Reddit, GitHub, and email.'
    },
    changelog: changelogResource
  },
  surfaces: {
    clipper: {
      hero: {
        title: 'Clipper Dialog',
        description:
          'The first interaction layer after selecting text on a webpage, responsible for notes, direct save, Reader Mode entry, or Video Mode entry.',
        pills: ['Clip Selection', 'Reader Entry', 'Video Entry', 'Shortcuts'],
        icon: 'content_cut'
      },
      iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_clipt.png',
      labels: {
        title: 'Clip Selection',
        selectionPreview: 'Selection Preview',
        commentLabel: 'Comment'
      },
      source: {
        title: 'macOS update preview article',
        host: 'macworld.com/article/2024-macos-update',
        initials: 'MW',
        verifiedLabel: 'Verified source'
      },
      destination: {
        id: 'vault-research',
        kind: 'vault',
        label: 'Research Vault',
        path: 'Clippings/macOS update preview article.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-research',
            kind: 'vault',
            label: 'Research Vault',
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
        { id: 'reader', label: 'Open Reader Mode', variant: 'ghost' },
        { id: 'video', label: 'Open Video Mode', variant: 'ghost' },
        { id: 'clip', label: 'Save Clip', variant: 'primary' }
      ]
    },
    reader: {
      hero: {
        title: 'Reader Mode',
        description:
          'Accumulate highlights and notes on the same page, then save them to Obsidian in one step. The layout also reserves the top summary slot for Reader Mode AI summaries.',
        pills: ['Non-modal Panel', 'Highlight List', 'Inline Comment Edit', 'AI Summary Slot'],
        icon: 'auto_stories'
      },
      iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_readingt.png',
      labels: {
        title: 'Reader Mode',
        subtitle: 'Reading session',
        exitTriggerLabel: 'Exit',
        exitTitle: 'Leave this panel?',
        exitCancelLabel: 'Keep editing',
        exitConfirmLabel: 'Confirm exit',
        notePlaceholder: 'Add your takeaway for this highlight...',
        saveLabel: 'Save',
        deleteLabel: 'Delete'
      },
      hint: 'Highlights and notes from the current page keep accumulating in this reading session.',
      counter: '4',
      destination: {
        id: 'vault-research',
        kind: 'vault',
        label: 'Research Vault',
        path: 'Reading/macOS update preview article.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-research',
            kind: 'vault',
            label: 'Research Vault',
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
        { id: 'reader:finish', label: 'Finish and Save', variant: 'primary' },
        { id: 'reader:cancel', label: 'Cancel', variant: 'ghost' }
      ]
    },
    video: {
      hero: {
        title: 'Video Mode',
        description:
          'Build video notes around timestamps and subtitle or comment fragments. The panel keeps the real workflow of add note -> edit comment -> finish and save.',
        pills: ['Timestamp Notes', 'Fragment Capture', 'Inline Edit', 'YouTube / Bilibili'],
        icon: 'smart_display'
      },
      labels: {
        title: 'Video Mode',
        subtitle: 'Video session active',
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
      hint: 'Record the current timestamp, or capture a subtitle/comment fragment and add context immediately.',
      counter: '3',
      destination: {
        id: 'vault-video',
        kind: 'vault',
        label: 'Video Vault',
        path: 'Videos/demo-video-notes.md',
        hasConfiguredVault: true,
        options: [
          {
            id: 'vault-video',
            kind: 'vault',
            label: 'Video Vault',
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
          summary: '"What creates understanding is the judgment you make while watching."',
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
        { id: 'video:finish', label: 'Finish and Save', variant: 'primary' },
        { id: 'video:cancel', label: 'Cancel', variant: 'ghost' }
      ]
    },
    videoFloatingPrompt: {
      label: 'Start video notes',
      shortcut: 'Alt+V',
      dismissLabel: 'Dismiss video-note prompt'
    },
    taskSuccess: {
      hero: {
        title: 'Task Success',
        description:
          'A post-save feedback layer with status copy, support links, like/dislike actions, and preview states for the follow-up toasts.',
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
        title: 'Thanks for the encouragement!',
        detail: 'If you want to help more people discover Zendio, feel free to leave a review.',
        actions: ['Write a review', 'I already left one']
      },
      dislikeToast: {
        title: 'Report an issue',
        detail: 'Continue the discussion on Reddit or file an issue on GitHub.',
        actions: ['Discuss on Reddit', 'GitHub']
      }
    }
  },
  maintenanceLog: `Diagnosis Results\n========\n✅ Default vault HTTPS connection is healthy\n✅ At least one additional vault is enabled\n✅ Routing rule priorities do not conflict\n✅ article / clipper / video / ai_chat YAML configuration all parses successfully\n⚠️ fragment.contextLength = 200 is reasonable, but monitor performance in heavier Reader Mode sessions\nℹ️ AI page summaries, Reader Mode top summaries, and subtitle translation are still planned and were not included in this connectivity check\nℹ️ video.floatingPromptEnabled controls whether the note button appears in the video-site control bar`
};
