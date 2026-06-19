import type { SettingsSchema, SchemaContext } from '../../types';
import {
  getDefaultProductionEnglishMessage,
  type SchemaMessageKey,
  type SchemaMessageValues
} from '../i18n';
import { aiPlatformLinks } from '../builders/settings';
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
