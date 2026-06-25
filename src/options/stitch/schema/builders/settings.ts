import type { NodeSchema, SchemaContext } from '../../types';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';
import { div, element } from './primitives';
import { classNames } from './classNames';

const AI_PLATFORM_LINKS: Record<string, string> = {
  ChatGPT: 'https://chatgpt.com/',
  Claude: 'https://claude.ai/',
  Copilot: 'https://copilot.microsoft.com/',
  Gemini: 'https://gemini.google.com/',
  'Tongyi/Qianwen': 'https://tongyi.aliyun.com/',
  Kimi: 'https://www.kimi.com/',
  DeepSeek: 'https://chat.deepseek.com/',
  Doubao: 'https://www.doubao.com/',
  Monica: 'https://monica.im/',
  Perplexity: 'https://www.perplexity.ai/'
};

export function themeSegmentedSwitch(): NodeSchema {
  return {
    kind: 'segmentedNav',
    items: (current) => {
      const fallback = {
        system: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewThemeSystemOption,
        dark: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewThemeDarkOption,
        light: DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewThemeLightOption
      };

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
