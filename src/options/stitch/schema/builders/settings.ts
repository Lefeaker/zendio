import type { NodeSchema, SchemaContext } from '../../types';
import { div, element } from './primitives';
import { classNames } from './classNames';

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
            { label: 'System', value: 'system' },
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' }
          ]
        : [
            { label: '跟随系统', value: 'system' },
            { label: '暗色', value: 'dark' },
            { label: '亮色', value: 'light' }
          ],
    bind: 'interfaceThemePreference',
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
