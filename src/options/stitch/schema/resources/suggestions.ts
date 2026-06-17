import type { ResourceSchema } from '../../types';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';
import {
  modalSection,
  resourceCard,
  resourceCardGrid,
  resourceModalStack
} from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.suggestions;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    const github = resource.channels.find((item) => item.href?.includes('github.com'));
    const reddit = resource.channels.find((item) => item.href?.includes('reddit.com'));
    return {
      id: 'suggestions',
      kind: 'modal',
      title: tr('schemaResourceSuggestionsTitle'),
      description: tr('schemaResourceSuggestionsDescription'),
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(tr('schemaResourceSuggestionsChannelsGroupTitle'), [
                resourceCardGrid(
                  [
                    {
                      title: tr('schemaResourceSuggestionsGithubTitle'),
                      subtitle: tr('schemaResourceSuggestionsGithubDescription'),
                      ...(github?.href !== undefined ? { href: github.href } : {}),
                      ...(github?.icon !== undefined ? { icon: github.icon } : {})
                    },
                    {
                      title: tr('schemaResourceSuggestionsRedditTitle'),
                      subtitle: tr('schemaResourceSuggestionsRedditDescription'),
                      ...(reddit?.href !== undefined ? { href: reddit.href } : {}),
                      ...(reddit?.icon !== undefined ? { icon: reddit.icon } : {})
                    }
                  ].map((item) => resourceCard(item)),
                  2
                )
              ])
            ])
          : resourceCardGrid(
              resource.channels.map((item) => resourceCard(item)),
              2
            )
      ]
    };
  }
};

export default schema;
