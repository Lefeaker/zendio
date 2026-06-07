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
        : '提出建议',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceSuggestionsDescription',
            'Send feedback through the currently supported public channels.'
          ) ?? 'Send feedback through the currently supported public channels.')
        : '感谢你愿意反馈想法，以下渠道都可以快速联系到作者。',
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
                        href: githubHref
                      },
                      {
                        title:
                          ctx.t?.('schemaResourceSuggestionsRedditTitle', 'Reddit') ?? 'Reddit',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceSuggestionsRedditDescription',
                            'Direct public discussion with the author'
                          ) ?? 'Direct public discussion with the author',
                        href: redditHref
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
