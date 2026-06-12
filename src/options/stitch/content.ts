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
    resourceOpenAction: '打开',
    highlightExamplePrefix: '导出后的示例会像这样 ',
    highlightExampleText: '标出重点内容',
    highlightExampleSuffix: '，方便回看。'
  },
  sidebarLinks: [
    { id: 'onboarding', label: 'Onboarding', hint: '首次引导与快速了解', icon: 'rocket_launch' },
    {
      id: 'plugin-setup',
      label: 'Plugin Setup',
      hint: 'Local REST API 配置指南',
      icon: 'extension'
    },
    { id: 'support', label: 'Support', hint: '支持作者与服务范围', icon: 'favorite' },
    { id: 'suggestions', label: 'Suggestions', hint: '建议与反馈渠道', icon: 'lightbulb' },
    { id: 'contact', label: 'Contact', hint: '联系作者与支持邮箱', icon: 'mail' },
    { id: 'changelog', label: 'Changelog', hint: '最近版本更新', icon: 'history' }
  ],
  surfaceLinks: [
    {
      id: 'clipper',
      label: 'Clipper Dialog',
      hint: '网页选中文本后的剪藏浮窗',
      icon: 'content_cut'
    },
    { id: 'reader', label: 'Reader Mode', hint: '阅读模式悬浮面板', icon: 'auto_stories' },
    { id: 'video', label: 'Video Mode', hint: '视频模式记录面板', icon: 'smart_display' },
    {
      id: 'video-floating-prompt',
      label: 'Video Floating Prompt',
      hint: '视频页面的启动提示浮层',
      icon: 'ads_click'
    },
    {
      id: 'task-success',
      label: 'Task Success',
      hint: '任务完成后的成功提示与反馈弹窗',
      icon: 'celebration'
    }
  ],
  nav: [
    {
      id: 'overview',
      label: 'Overview',
      hint: '使用概览、语言、隐私与数据控制',
      icon: 'dashboard'
    },
    { id: 'storage', label: 'Storage', hint: 'Vault 列表、连接参数、路由', icon: 'storage' },
    {
      id: 'capture-sources',
      label: 'Capture Sources',
      hint: 'AI、Video',
      icon: 'ads_click'
    },
    {
      id: 'capture-behavior',
      label: 'Capture Behavior',
      hint: 'Reading、Fragment 行为与导出',
      icon: 'menu_book'
    },
    {
      id: 'output',
      label: 'Output & Metadata',
      hint: '路径模板、映射、YAML',
      icon: 'output'
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      hint: 'Transfer、Diagnosis、修复',
      icon: 'construction'
    }
  ],
  overview: {
    hero: {
      title: 'Overview',
      description: '查看当前使用概览，并管理语言、隐私和数据控制。',
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
  privacyCollected: ['错误类型与调用位置', '浏览器 / 扩展版本', '异常发生时间', '匿名功能使用次数'],
  privacyExcluded: ['个人身份信息', '页面正文与剪藏内容', '私密 URL 清单', '密码、API 密钥明文'],
  storage: {
    hero: {
      title: 'Storage',
      description: '管理 Vault 列表、连接参数和路由规则。',
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
      description: '配置 AI 和 Video 的来源型捕获能力。',
      pills: ['AI Chat', 'Video'],
      icon: 'ads_click'
    },
    aiPlatforms: ['ChatGPT', 'Claude', 'Gemini', 'Kimi', 'DeepSeek', 'Tongyi', 'Doubao', 'Monica']
  },
  captureBehavior: {
    hero: {
      title: 'Capture Behavior',
      description: '配置阅读导出和片段交互行为。',
      pills: ['Reading Session', 'Fragment Clipper'],
      icon: 'menu_book'
    }
  },
  output: {
    hero: {
      title: 'Output & Metadata',
      description: '配置输出路径、域名命名和 YAML 字段。',
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
      ['mp.weixin.qq.com', '公众号', '微信公众号文章'],
      ['arxiv.org', 'Arxiv', '论文目录统一命名'],
      ['chatgpt.com', 'ChatGPT', 'AI 对话平台别名']
    ],
    yamlFilters: [
      { value: 'all', label: '全部' },
      { value: 'article', label: '文章' },
      { value: 'clipper', label: '片段' },
      { value: 'video', label: '视频' },
      { value: 'ai_chat', label: 'AI 对话' }
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
      ['Minimal', '标题、来源、日期、基础标签。适合快速收集。'],
      ['Research', '增加 author、published_at、citation、status、workspace。'],
      ['Conversation', '为 AI 对话保留 platform、message_count、topic、session metadata。']
    ]
  },
  experimental: {
    hero: {
      title: 'Experimental',
      description: '规划中的 AI 辅助功能，默认关闭，后续再接入真实能力。',
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
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'ko', label: '한국어' },
      { value: 'de', label: 'Deutsch' },
      { value: 'es', label: 'Español' }
    ]
  },
  resources: {
    privacyPolicy: {
      hero: {
        title: 'Privacy Policy',
        description: '说明扩展会处理哪些数据、不会收集哪些内容，以及用户如何关闭相关能力。',
        pills: ['Local first', 'No page content analytics', 'User controlled'],
        icon: 'privacy_tip'
      },
      sections: [
        {
          title: '不会收集',
          body: '扩展不会上传、出售或分析你的个人身份信息和剪藏正文。',
          bullets: ['页面正文与剪藏内容', '私密 URL 清单', '密码、API 密钥明文', '个人身份信息']
        },
        {
          title: '可选分析',
          body: '匿名使用统计和错误报告由设置页开关控制。关闭后，运行时 analytics/error reporting consent 会同步关闭。'
        },
        {
          title: '本地配置',
          body: 'Vault、REST API、路径模板、YAML 字段和运行时配置保存在浏览器扩展存储中，可通过 Maintenance 导出或清除相关分析数据。'
        }
      ]
    },
    dataUsage: {
      hero: {
        title: 'Data Usage',
        description: '解释 Usage Dashboard、错误报告和诊断动作如何使用本地或匿名数据。',
        pills: ['Usage dashboard', 'Diagnostics', 'Transfer'],
        icon: 'analytics'
      },
      sections: [
        {
          title: '匿名功能使用次数',
          body: 'Usage Dashboard 只统计保存次数、功能类型和最近趋势，用于帮助用户了解自己的工作流。'
        },
        {
          title: '错误报告',
          body: '当用户启用错误报告时，扩展会记录错误类型与调用位置、浏览器 / 扩展版本、异常发生时间。'
        },
        {
          title: '配置迁移',
          body: 'Maintenance 导出的配置用于同设备或跨浏览器迁移；导入前会解析 JSON，并走 Options controller 的真实保存路径。'
        }
      ]
    },
    onboarding: {
      hero: {
        title: 'Onboarding',
        description: '对应项目现有 onboarding 的 5 步引导内容，帮助新用户快速完成连接和基础认知。',
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
          title: '配置 Obsidian Local REST API',
          description: '先完成 Obsidian 端插件安装和连接信息记录，这是扩展写入 Obsidian 的前提。',
          bullets: [
            '在 Obsidian 中安装并启用 Local REST API 插件',
            '打开 Enable Non-encrypted (HTTP) Server',
            '记录 HTTPS URL，通常为 https://127.0.0.1:27124/',
            '记录 HTTP URL，通常为 http://127.0.0.1:27123/',
            '记录 Vault 名称并复制 API Key'
          ]
        },
        {
          number: '2',
          title: '配置额外仓库与路由',
          description: '如果你有多个 Vault，可以按域名、关键词或 URL pattern 自动路由到不同仓库。',
          bullets: [
            '附加仓库的 HTTPS / HTTP / API Key 配置方法与默认仓库一致',
            '可按域名、关键词或 URL Pattern 设置路由规则',
            '不符合规则的内容默认回落到默认仓库'
          ]
        },
        {
          number: '3',
          title: '了解主要功能',
          description: '项目当前主流程包括整页剪藏、AI 对话导出、阅读模式和视频模式。',
          bullets: [
            '点击网页空白处保存整页内容',
            '自动识别并导出主流 AI 对话平台内容',
            '阅读模式可批量评论片段并保存全文高亮',
            '视频模式支持时间点笔记、评论捕捉和回溯定位'
          ]
        },
        {
          number: '4',
          title: '了解辅助功能',
          description: '这部分对应配置迁移、域名映射、自定义模板和诊断能力。',
          bullets: [
            '同设备多浏览器之间可复制配置',
            '支持域名映射为更友好的目录名',
            '支持自定义路径模板',
            '内置智能诊断帮助排查配置问题'
          ]
        },
        {
          number: '5',
          title: '持续迭代与反馈',
          description: '项目会持续增加更智能的能力，也鼓励用户通过社区和 issue 反馈。',
          bullets: [
            '后续会继续引入 AI 能力',
            '目标是让浏览器与 Obsidian 形成双向工作流',
            '建议、支持与联系入口都保留在设置页中'
          ]
        }
      ]
    },
    pluginSetup: {
      hero: {
        title: 'Plugin Setup Guide',
        description:
          '基于项目当前真实流程整理的插件配置指引，重点是 Obsidian Local REST API 与扩展连接。',
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
          title: '1. 在 Obsidian 安装 Local REST API',
          body: '在 Obsidian 社区插件中安装并启用 Local REST API，这是扩展与本地 Vault 通信的唯一桥梁。'
        },
        {
          title: '2. 打开 HTTP / HTTPS 连接信息',
          body: '在插件设置里确认 HTTPS 与 HTTP 地址。当前项目已经使用双 URL 配置，推荐两个都填。'
        },
        {
          title: '3. 记录 Vault 名称与 API Key',
          body: '复制 Vault 名称和 API Key，并准备回填到扩展的 Storage > Vault List。'
        },
        {
          title: '4. 在扩展中测试连接',
          body: '回到扩展设置页填写默认仓库第一行的 HTTPS / HTTP / API Key，然后执行连接测试。'
        }
      ],
      checks: [
        'Obsidian 已启动且 Local REST API 已启用',
        'HTTP / HTTPS 地址与 Obsidian 设置一致',
        'Vault 名称拼写正确',
        'API Key 已完整复制，没有多余空格',
        'Storage 页的连接测试返回成功'
      ]
    },
    support: {
      hero: {
        title: 'Support',
        description: '这里对应项目当前的支持入口和用户支持说明，不再只是空链接。',
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
          title: '爱发电',
          subtitle: '中文用户支持作者',
          icon: './icons/aifadian-line-copy.svg',
          href: 'https://afdian.com/a/LefShi'
        }
      ],
      scope: [
        '安装、升级、卸载等基础问题',
        '剪藏、AI 解析、Obsidian 写入失败排查',
        'API Token、权限配置、网络连接指导',
        '隐私、权限、数据安全问题说明'
      ],
      response: [
        '工作日 48 小时内首轮回复',
        '复杂问题会提供预计解决时间',
        '数据丢失或安全风险可在标题标注 URGENT'
      ]
    },
    suggestions: {
      hero: {
        title: 'Suggestions',
        description: '使用项目里已经存在的建议渠道，不再做空白占位。',
        pills: ['GitHub Issue', 'Reddit'],
        icon: 'lightbulb'
      },
      channels: [
        {
          title: 'GitHub Issue',
          subtitle: '提交功能建议或 bug 反馈',
          href: 'https://github.com/Lefeaker/AllinOB/issues/new?labels=enhancement&title=%5B建议%5D%20'
        },
        {
          title: 'Reddit 社区',
          subtitle: '与作者直接交流想法',
          href: 'https://www.reddit.com/user/sxnian/'
        }
      ]
    },
    contact: {
      hero: {
        title: 'Contact',
        description: '整合项目现有的联系作者入口与支持文档里的联系信息。',
        pills: ['Reddit', 'GitHub', 'Outlook'],
        icon: 'mail'
      },
      entries: [
        {
          title: 'Reddit',
          subtitle: 'Reddit 私信或主页',
          href: 'https://www.reddit.com/user/sxnian/'
        },
        {
          title: 'GitHub Repository',
          subtitle: '查看项目与提交 issue',
          href: 'https://github.com/Lefeaker/AllinOB'
        },
        {
          title: 'Support Email',
          subtitle: '通过邮件联系支持',
          href: 'mailto:allinobsidian@outlook.com'
        }
      ],
      note: '如果你认可这个产品，或想和作者交流，当前项目里的主要公开联系渠道是 Reddit、GitHub 和邮件。'
    },
    changelog: changelogResource
  },
  surfaces: {
    clipper: {
      hero: {
        title: 'Clipper Dialog',
        description: '网页选中文本后的首个交互层，负责批注、直接剪藏、进入阅读模式或进入视频模式。',
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
        '真正重要的不是信息本身，而是信息和已有知识之间的连接。只有在连接被写下来的时候，未来的自己才有机会重新进入当时的思路。',
      commentPlaceholder: '写下你的理解、问题或补充……',
      helper:
        '支持双击回车进入阅读模式，Cmd/Ctrl + Enter 直接保存，Esc 取消，Alt + 方向键调整浮窗位置。',
      shortcuts: [
        '双击 ↵ 进入阅读模式',
        'Cmd/Ctrl + ↵ 直接剪藏',
        'Esc 取消',
        'Alt + 方向键移动浮窗'
      ],
      actions: [
        { id: 'reader', label: '进入阅读模式', variant: 'ghost' },
        { id: 'video', label: '进入视频模式', variant: 'ghost' },
        { id: 'clip', label: '直接剪藏', variant: 'primary' }
      ]
    },
    reader: {
      hero: {
        title: 'Reader Mode',
        description:
          '在同一页面内累积高亮与批注，最后统一保存到 Obsidian。这里同时预留了阅读悬浮窗顶部 AI 总结位。',
        pills: ['Non-modal Panel', 'Highlight List', 'Inline Comment Edit', 'AI Summary Slot'],
        icon: 'auto_stories'
      },
      iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_readingt.png',
      labels: {
        title: '阅读模式',
        subtitle: 'Reading session',
        exitTriggerLabel: '退出',
        exitTitle: '退出当前面板？',
        exitCancelLabel: '继续编辑',
        exitConfirmLabel: '确认退出',
        notePlaceholder: '补充你对这个高亮片段的判断……',
        saveLabel: '保存',
        deleteLabel: '删除'
      },
      hint: '当前页面的高亮与批注会持续追加到本次阅读会话。',
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
        'AI 总结：本文主要围绕“信息连接如何形成长期可复用知识”展开，重点强调高亮本身不重要，重要的是为片段补上下文与个人判断。',
      highlights: [
        {
          id: 'reader-1',
          index: 1,
          excerpt: '真正重要的不是信息本身，而是信息和已有知识之间的连接。',
          fullText:
            '真正重要的不是信息本身，而是信息和已有知识之间的连接。没有连接的摘录，后续回看时通常只剩下一句漂亮但失去语境的话。',
          commentPreview: '这句适合放在文章开头，作为整页阅读模式导出的总引。',
          comment: '这句适合放在文章开头，作为整页阅读模式导出的总引。',
          timestamp: '今天 21:14'
        },
        {
          id: 'reader-2',
          index: 2,
          excerpt: '信息的价值，不在于被存下，而在于能否在未来被重新理解。',
          fullText:
            '信息的价值，不在于被存下，而在于能否在未来被重新理解。重新理解依赖原始语境、批注以及知识网络中的相邻节点。',
          commentPreview: '补一个例子，说明为什么单独收藏链接没有意义。',
          comment: '补一个例子，说明为什么单独收藏链接没有意义。',
          timestamp: '今天 21:18'
        },
        {
          id: 'reader-3',
          index: 3,
          excerpt: '高亮本身只是锚点，真正帮助记忆的是你在边上的那一句判断。',
          fullText:
            '高亮本身只是锚点，真正帮助记忆的是你在边上的那一句判断。阅读模式的价值也正在于把这一步从脑内动作变成结构化输出。',
          commentPreview: '点击后进入行内编辑。',
          draft: '这里应该补上“为什么要在阅读模式里写判断，而不是回 Obsidian 再补”。',
          timestamp: '今天 21:26',
          editing: true
        }
      ],
      actions: [
        { id: 'reader:finish', label: '完成并保存', variant: 'primary' },
        { id: 'reader:cancel', label: '取消', variant: 'ghost' }
      ]
    },
    video: {
      hero: {
        title: 'Video Mode',
        description:
          '围绕时间点与字幕/评论片段建立视频笔记。面板保留“添加记录 -> 编辑批注 -> 完成保存”的真实工作流。',
        pills: ['Timestamp Notes', 'Fragment Capture', 'Inline Edit', 'YouTube / Bilibili'],
        icon: 'smart_display'
      },
      labels: {
        title: '视频模式',
        subtitle: 'Video session active',
        exitTriggerLabel: '退出',
        exitTitle: '退出当前面板？',
        exitCancelLabel: '继续编辑',
        exitConfirmLabel: '确认退出',
        notePlaceholder: '补充这一条时间点 / 字幕片段的说明……',
        saveLabel: '保存',
        deleteLabel: '删除',
        addLabel: '记录当前时间点',
        emptyCapturePlaceholder: '在当前时间点输入笔记...'
      },
      status: 'YouTube · 01:23:14 · 自动跟随当前播放时间',
      hint: '记录当前时间点，或从字幕 / 评论区抓取片段并立即补充说明。',
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
          commentPreview: '这里第一次定义了核心概念，后面可以和文章版定义做交叉引用。',
          comment: '这里第一次定义了核心概念，后面可以和文章版定义做交叉引用。',
          meta: 'https://youtube.com/watch?v=demo&t=45'
        },
        {
          id: 'video-2',
          index: 2,
          kind: 'fragment',
          markerLabel: '08:12',
          summary: '“真正形成理解的，是你在观看当下做出的那一次判断。”',
          fullText:
            '真正形成理解的，是你在观看当下做出的那一次判断。时间点只负责帮你回去，解释权仍然来自评论和上下文。',
          commentPreview: '这个字幕片段适合单独摘出来，后面配一条评论。',
          comment: '这个字幕片段适合单独摘出来，后面配一条评论。',
          meta: 'https://youtube.com/watch?v=demo&t=728'
        },
        {
          id: 'video-3',
          index: 3,
          kind: 'timestamp',
          markerLabel: '12:10',
          summary: '12:08',
          draft: '这里是案例展开的位置，保存时可以把评论区里那条反例一起带上。',
          meta: 'https://youtube.com/watch?v=demo&t=728',
          editing: true
        }
      ],
      actions: [
        { id: 'video:finish', label: '完成并保存', variant: 'primary' },
        { id: 'video:cancel', label: '取消', variant: 'ghost' }
      ]
    },
    videoFloatingPrompt: {
      label: '开启视频笔记',
      shortcut: 'Alt+V',
      dismissLabel: '关闭视频笔记提示'
    },
    taskSuccess: {
      hero: {
        title: 'Task Success',
        description:
          '保存完成后的反馈层，包含状态反馈、支持入口、赞踩动作，以及后续 like / dislike toast 的视觉预览。',
        pills: ['Success Prompt', 'Support Links', 'Like / Dislike', 'Toast States'],
        icon: 'celebration'
      },
      status: 'success',
      statusMessage: '成功发送到 Research Vault',
      statusDetail: '整页内容已按当前仓库路由写入 `Articles/Research/2026/`，分类结果同步完成。',
      progress: { value: 100, variant: 'success' },
      feedbackLabel: '快速反馈',
      likeLabel: '赞一个',
      dislikeLabel: '倒赞',
      dismissLabel: '点击页面其他区域即可关闭',
      likeToast: {
        title: '感谢鼓励！',
        detail: '如果你愿意，欢迎写一条评论，帮助更多用户发现 Zendio。',
        actions: ['撰写评论', '我已写过评论']
      },
      dislikeToast: {
        title: '反馈问题',
        detail: '可以去 Reddit 继续交流，或者在 GitHub 提交问题。',
        actions: ['在 Reddit 讨论', 'GitHub']
      }
    }
  },
  maintenanceLog: `诊断结果\n========\n✅ 默认仓库 HTTPS 连接正常\n✅ 至少一个附加仓库处于启用状态\n✅ 路由规则优先级无冲突\n✅ article / clipper / video / ai_chat YAML 配置均可解析\n⚠️ fragment.contextLength = 200，值合理，但建议在阅读模式较重场景做性能观察\nℹ️ AI 页面总结、阅读模式顶部总结与字幕翻译仍处于规划阶段，尚未参与本次模型连通性检查\nℹ️ video.floatingPromptEnabled 控制视频网站控制栏笔记按钮显示`
};
