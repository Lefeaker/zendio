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
    items: (current) => {
      const fallback =
        current.state.previewLanguage === 'en'
          ? { system: 'System', dark: 'Dark', light: 'Light' }
          : { system: '跟随系统', dark: '暗色', light: '亮色' };

      return [
        {
          label: current.t?.('schemaOverviewThemeSystemOption', fallback.system) ?? fallback.system,
          value: 'system'
        },
        {
          label: current.t?.('schemaOverviewThemeDarkOption', fallback.dark) ?? fallback.dark,
          value: 'dark'
        },
        {
          label: current.t?.('schemaOverviewThemeLightOption', fallback.light) ?? fallback.light,
          value: 'light'
        }
      ];
    },
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
