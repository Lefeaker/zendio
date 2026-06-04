import type { PreviewContent } from '@options/stitch/types';

export function localizeStitchContent(content: PreviewContent, language: string): PreviewContent {
  const useChinese = language !== 'en';
  if (!useChinese) {
    return content;
  }

  const navLabels: Record<string, string> = {
    overview: '总览',
    storage: '仓库',
    'capture-sources': '采集来源',
    'capture-behavior': '采集行为',
    output: '输出与元数据',
    maintenance: '维护'
  };
  const resourceLabels: Record<string, string> = {
    onboarding: '首次引导',
    'plugin-setup': '插件设置',
    support: '支持',
    suggestions: '建议',
    contact: '联系',
    changelog: '更新日志'
  };
  const surfaceLabels: Record<string, string> = {
    clipper: '剪藏弹窗',
    reader: '阅读模式',
    video: '视频模式',
    'video-floating-prompt': '视频启动提示',
    'task-success': '任务完成'
  };

  return {
    ...content,
    brand: {
      ...content.brand,
      title: 'Zendio'
    },
    rendererLabels: {
      ...content.rendererLabels,
      resourceOpenAction: '打开',
      highlightExamplePrefix: '导出后的示例会像这样 ',
      highlightExampleText: '标出重点内容',
      highlightExampleSuffix: '，方便回看。'
    },
    nav: content.nav.map((item) => ({
      ...item,
      label: navLabels[item.id] ?? item.label
    })),
    sidebarLinks: content.sidebarLinks.map((item) => ({
      ...item,
      label: resourceLabels[item.id] ?? item.label
    })),
    surfaceLinks: content.surfaceLinks.map((item) => ({
      ...item,
      label: surfaceLabels[item.id] ?? item.label
    })),
    overview: { ...content.overview, hero: { ...content.overview.hero, title: '总览' } },
    storage: { ...content.storage, hero: { ...content.storage.hero, title: '仓库' } },
    captureSources: {
      ...content.captureSources,
      hero: { ...content.captureSources.hero, title: '采集来源' }
    },
    captureBehavior: {
      ...content.captureBehavior,
      hero: { ...content.captureBehavior.hero, title: '采集行为' }
    },
    output: { ...content.output, hero: { ...content.output.hero, title: '输出与元数据' } }
  };
}
