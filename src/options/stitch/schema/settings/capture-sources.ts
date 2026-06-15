import type { SettingsSchema, SchemaContext } from '../../types';
import type { SchemaMessageKey, SchemaMessageValues } from '../i18n';
import { emptyState, grid } from '../builders/primitives';
import { aiPlatformLinks } from '../builders/settings';
import { boundInput } from '../builders/controls';
import { createVideoCaptureSourcesGroup } from './capture-sources-video';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  fallback: string,
  values?: SchemaMessageValues
): string {
  return current.t ? current.t(key, fallback, values) : fallback;
}

const schema: SettingsSchema = {
  createView(ctx) {
    const hero = ctx.appData.captureSources.hero;

    return {
      id: 'capture-sources',
      kind: 'page',
      hero: {
        ...hero,
        title: translate(ctx, 'schemaCaptureSourcesTitle', hero.title),
        description: translate(ctx, 'schemaCaptureSourcesHeroDescription', hero.description)
      },
      children: [
        {
          kind: 'group',
          title: translate(ctx, 'schemaCaptureSourcesAiChatGroupTitle', 'AI Chat'),
          children: [
            {
              kind: 'card',
              title: translate(
                ctx,
                'schemaCaptureSourcesAiConversationTitle',
                'AI Conversation Capture'
              ),
              description: translate(
                ctx,
                'schemaCaptureSourcesAiConversationDescription',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesAiConversationDescription
              ),
              actions: [
                {
                  kind: 'badge',
                  label: translate(
                    ctx,
                    'schemaCaptureSourcesAiSupportedPlatformsBadge',
                    '8 supported platforms'
                  ),
                  variant: 'success'
                }
              ],
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: translate(
                        ctx,
                        'videoSupportedPlatformsTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.videoSupportedPlatformsTitle
                      ),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesSupportedPlatformsDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesSupportedPlatformsDescription
                      ),
                      control: aiPlatformLinks()
                    },
                    {
                      kind: 'row',
                      title: translate(
                        ctx,
                        'aiSummaryUserName',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.aiSummaryUserName
                      ),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesUserDisplayNameDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesUserDisplayNameDescription
                      ),
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: translate(ctx, 'userNameLabel', 'userName'),
                            control: boundInput({
                              bind: 'aiUserName',
                              onInput: {
                                id: 'options:updateField',
                                args: ['aiChat.userName'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: translate(
                              ctx,
                              'schemaCaptureSourcesPreviewFieldLabel',
                              'Preview'
                            ),
                            control: emptyState((current) =>
                              translate(
                                current,
                                'schemaCaptureSourcesUserDisplayNamePreview',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesUserDisplayNamePreview,
                                { label: current.state.aiUserName ?? 'USER' }
                              )
                            )
                          }
                        ],
                        'field-grid-2'
                      )
                    }
                  ]
                }
              ]
            }
          ]
        },
        createVideoCaptureSourcesGroup(ctx)
      ]
    };
  }
};

export default schema;
