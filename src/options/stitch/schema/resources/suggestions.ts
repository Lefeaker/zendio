import type { ResourceSchema } from '../../types';
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
    const githubHref = resource.channels.find((item) => item.href?.includes('github.com'))?.href;
    const redditHref = resource.channels.find((item) => item.href?.includes('reddit.com'))?.href;
    return {
      id: 'suggestions',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceSuggestionsTitle', 'Suggestions') ?? 'Suggestions')
        : 'Suggestions',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceSuggestionsDescription',
            'Send feedback through the currently supported public channels.'
          ) ?? 'Send feedback through the currently supported public channels.')
        : 'Send feedback through the currently supported public channels.',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(
                ctx.t?.('schemaResourceSuggestionsChannelsGroupTitle', 'Feedback Channels') ??
                  'Feedback Channels',
                [
                  resourceCardGrid(
                    [
                      {
                        title:
                          ctx.t?.('schemaResourceSuggestionsGithubTitle', 'GitHub Issue') ??
                          'GitHub Issue',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceSuggestionsGithubDescription',
                            'Feature requests and bug reports'
                          ) ?? 'Feature requests and bug reports',
                        ...(githubHref !== undefined ? { href: githubHref } : {})
                      },
                      {
                        title:
                          ctx.t?.('schemaResourceSuggestionsRedditTitle', 'Reddit') ?? 'Reddit',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceSuggestionsRedditDescription',
                            'Direct public discussion with the author'
                          ) ?? 'Direct public discussion with the author',
                        ...(redditHref !== undefined ? { href: redditHref } : {})
                      }
                    ].map((item) => resourceCard(item)),
                    2
                  )
                ]
              )
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
