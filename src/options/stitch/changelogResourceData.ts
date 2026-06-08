import type { PreviewContent } from './types';

export const changelogResource = {
  hero: {
    title: 'Changelog',
    description: '这里直接使用项目中的更新日志重点内容，保持和真实版本记录一致。',
    pills: ['v0.2.0', 'Settings Center', 'Multi-Vault', 'Video', '12 Languages'],
    icon: 'history'
  },
  entries: [
    {
      version: 'v0.2.0',
      date: '2026-06-10',
      bullets: [
        '重构选项页为新的设置中心，集中管理使用概览、界面语言、隐私数据、存储、采集、输出和维护工具',
        '新增多 Vault 管理与智能路由，可按域名、关键词或 URL Pattern 自动选择目标 Obsidian 仓库',
        '强化 Obsidian 写入链路，支持 HTTPS / HTTP 双连接、连接测试和 REST API 回退',
        '新增 Chrome / Chromium 本地 Vault 文件夹写入，授权后可按模板路径直接写入本地目录，权限缺失或写入失败时回退 REST API',
        '剪藏、阅读和视频面板支持保存目标与输出路径自由选择，可在 Vault、本地目录或下载路径之间切换并预览实际落盘路径',
        '增强片段剪藏与阅读模式，支持上下文捕捉、脚注格式、快捷键、高亮主题和阅读导出方式配置',
        '新增视频笔记能力，支持 YouTube / 哔哩哔哩时间点记录、字幕或评论片段捕捉和批注编辑',
        '扩展 AI 对话导出，支持 ChatGPT、Claude、Gemini、Copilot、通义、DeepSeek、Kimi、豆包、Monica、Perplexity 等平台',
        '新增结构化 YAML 配置、路径模板、域名映射、配置迁移和诊断修复工具',
        '正式支持 12 种界面语言，覆盖新版设置页主要入口'
      ],
      notes: [
        {
          title: '使用建议',
          items: [
            '先在 Storage 中配置默认仓库，再按需要添加附加仓库和路由规则',
            'Chrome / Chromium 浏览器可选本地 Vault 文件夹写入；Firefox 继续使用 REST API 路径',
            'AI 页面总结、阅读顶部总结和字幕翻译仍在规划中，本版本不作为已发布能力开放'
          ]
        }
      ]
    },
    {
      version: 'v0.1.0',
      date: '2025-10-13',
      bullets: [
        '网页剪藏基础能力上线',
        '集成 Obsidian Local REST API',
        '支持基础路径模板和域名映射',
        '支持 AI 分类器',
        '提供 AI 对话导出起步能力',
        '提供多语言界面起步支持'
      ]
    }
  ]
} satisfies PreviewContent['resources']['changelog'];
