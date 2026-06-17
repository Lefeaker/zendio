import type { SettingsSchema, SchemaContext } from '../../types';
import {
  getDefaultProductionEnglishMessage,
  type SchemaMessageKey,
  type SchemaMessageValues
} from '../i18n';
import { emptyState, grid } from '../builders/primitives';
import { aiPlatformLinks } from '../builders/settings';
import { boundInput } from '../builders/controls';
import { createVideoCaptureSourcesGroup } from './capture-sources-video';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  values?: SchemaMessageValues
): string {
  const fallback = getDefaultProductionEnglishMessage(key, values);
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
        title: translate(ctx, 'schemaCaptureSourcesTitle'),
        description: translate(ctx, 'schemaCaptureSourcesHeroDescription')
      },
      children: [
        {
          kind: 'group',
          title: translate(ctx, 'schemaCaptureSourcesAiChatGroupTitle'),
          children: [
            {
              kind: 'card',
              title: translate(ctx, 'schemaCaptureSourcesAiConversationTitle'),
              description: translate(ctx, 'schemaCaptureSourcesAiConversationDescription'),
              actions: [
                {
                  kind: 'badge',
                  label: translate(ctx, 'schemaCaptureSourcesAiSupportedPlatformsBadge'),
                  variant: 'success'
                }
              ],
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: translate(ctx, 'videoSupportedPlatformsTitle'),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesSupportedPlatformsDescription'
                      ),
                      control: aiPlatformLinks()
                    },
                    {
                      kind: 'row',
                      title: translate(ctx, 'aiSummaryUserName'),
                      description: translate(ctx, 'schemaCaptureSourcesUserDisplayNameDescription'),
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: translate(ctx, 'userNameLabel'),
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
                            label: translate(ctx, 'schemaCaptureSourcesPreviewFieldLabel'),
                            control: emptyState((current) =>
                              translate(current, 'schemaCaptureSourcesUserDisplayNamePreview', {
                                label: current.state.aiUserName ?? 'USER'
                              })
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
