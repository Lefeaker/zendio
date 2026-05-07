import type { NodeSchema, SchemaContext } from '../../types';
import { div, element, paragraph, strong } from './primitives';
import { classNames } from './classNames';
import { boundSwitch } from './controls';

const AI_PLATFORM_LINKS: Record<string, string> = {
  ChatGPT: 'https://chatgpt.com/',
  Claude: 'https://claude.ai/',
  Gemini: 'https://gemini.google.com/',
  Kimi: 'https://www.kimi.com/',
  DeepSeek: 'https://chat.deepseek.com/',
  Tongyi: 'https://tongyi.aliyun.com/',
  Doubao: 'https://www.doubao.com/',
  Monica: 'https://monica.im/'
};

export function themeSegmentedSwitch(): NodeSchema {
  return {
    kind: 'segmentedNav',
    items: (current) =>
      current.state.previewLanguage === 'en'
        ? [
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' }
          ]
        : [
            { label: '暗色', value: 'dark' },
            { label: '亮色', value: 'light' }
          ],
    bind: 'previewTheme',
    action: { id: 'preview:setTheme' }
  };
}

export function aiPlatformLinks(): NodeSchema {
  return div(classNames.settings.aiPlatformLinkRow, (current: SchemaContext) =>
    current.appData.captureSources.aiPlatforms.map((item) =>
      element('a', {
        className: ['chip', classNames.settings.aiPlatformLink].join(' '),
        text: item,
        href: AI_PLATFORM_LINKS[item] ?? '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        ariaPressed: 'true'
      })
    )
  );
}

export function deepResearchPurifyAction(): NodeSchema {
  return div(classNames.settings.deepResearchTitleInline, [
    strong('提纯模式'),
    boundSwitch({
      bind: 'deepResearchPureMode',
      compact: true,
      onChange: {
        id: 'options:updateField',
        args: ['deepResearch.pureMode'],
        valueFrom: 'target.checked'
      }
    })
  ]);
}

export function deepResearchPurifyNotice(): NodeSchema {
  return div(['compact-inline-notice', classNames.settings.purifyModeNotice].join(' '), [
    strong('来源限制'),
    paragraph('只捕捉报告正文，不保存过程消息。'),
    paragraph('Gemini 一次只会显示一个完整报告，若要保存多个报告，应逐个打开并执行剪藏。')
  ]);
}
