import type { CompleteOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type { PreviewContent } from '@options/stitch/types';

export function createYamlFieldStates(appData: PreviewContent): Record<string, string> {
  const states: Record<string, string> = {};
  for (const group of appData.output.yamlRows) {
    for (const [field, , modes] of group.rows) {
      for (const [mode, status] of Object.entries(modes)) {
        states[`${field}:${mode}`] = status;
      }
    }
  }
  return states;
}

export function createPresetYamlConfig(
  preset: 'Minimal' | 'Research' | 'Conversation'
): YamlConfigOverrides | null {
  if (preset === 'Minimal') {
    return {
      contentTypes: {
        article: {
          customFields: []
        },
        clipper: {
          customFields: []
        },
        video: {
          customFields: []
        },
        ai_chat: {
          customFields: []
        }
      }
    };
  }

  if (preset === 'Conversation') {
    return {
      contentTypes: {
        ai_chat: {
          customFields: [
            {
              name: 'topic',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.topic',
              isCustom: true
            },
            {
              name: 'session_id',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.sessionId',
              isCustom: true
            }
          ],
          domainOverrides: {
            'chatgpt.com': [
              { name: 'platform', type: 'text', enabled: true, defaultValue: 'ChatGPT' }
            ],
            'claude.ai': [{ name: 'platform', type: 'text', enabled: true, defaultValue: 'Claude' }]
          }
        }
      }
    };
  }

  return {
    globalFields: [
      { name: 'workspace', type: 'text', enabled: true, defaultValue: 'research', isCustom: true }
    ],
    contentTypes: {
      article: {
        customFields: [
          {
            name: 'status',
            type: 'array',
            enabled: true,
            defaultValue: ['unread'],
            isCustom: true
          },
          {
            name: 'workspace',
            type: 'text',
            enabled: true,
            defaultValue: 'research',
            isCustom: true
          },
          {
            name: 'citation_key',
            type: 'text',
            enabled: true,
            valuePath: 'metadata.citationKey',
            isCustom: true
          }
        ],
        domainOverrides: {
          'arxiv.org': [
            {
              name: 'citation_key',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.citationKey'
            },
            { name: 'authors', type: 'array', enabled: true, valuePath: 'metadata.authors' }
          ],
          'mp.weixin.qq.com': [
            {
              name: 'official_account',
              type: 'text',
              enabled: true,
              valuePath: 'metadata.wechat.account'
            }
          ]
        }
      },
      clipper: {
        customFields: [
          {
            name: 'workspace',
            type: 'text',
            enabled: true,
            defaultValue: 'research',
            isCustom: true
          }
        ]
      }
    }
  };
}

export function toTemplateValues(options: CompleteOptions): Record<string, string> {
  return {
    articleVideo: options.templates.article,
    video: options.templates.video,
    fragment: options.templates.fragment,
    readingCustom: options.templates.reading,
    aiChat: options.templates.ai
  };
}
