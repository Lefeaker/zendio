import type { ResourceSchema } from '../../types';
import { htmlParagraph } from '../builders/primitives';
import { modalSection, resourceCardGrid, resourceModalStack } from '../builders/resources';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.contact;
    const shouldLocalize = Boolean(ctx.messages);
    const redditHref = resource.entries.find((item) => item.href?.includes('reddit.com'))?.href;
    const githubHref = resource.entries.find((item) => item.href?.includes('github.com'))?.href;
    const emailHref = resource.entries.find((item) => item.href?.startsWith('mailto:'))?.href;
    return {
      id: 'contact',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceContactTitle', 'Contact') ?? 'Contact')
        : 'Contact',
      description: shouldLocalize
        ? (ctx.t?.('schemaResourceContactHint', 'Contact the author') ?? 'Contact the author')
        : 'Contact the author',
      children: [
        shouldLocalize
          ? resourceModalStack([
              htmlParagraph(
                ctx.t?.(
                  'schemaResourceContactDescription',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceContactDescription
                ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceContactDescription
              ),
              modalSection(
                ctx.t?.('schemaResourceContactChannelsGroupTitle', 'Public Channels') ??
                  'Public Channels',
                [
                  resourceCardGrid(
                    [
                      {
                        kind: 'resourceCard',
                        title: ctx.t?.('schemaResourceContactRedditTitle', 'Reddit') ?? 'Reddit',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceContactRedditDescription',
                            'https://www.reddit.com/user/sxnian/'
                          ) ?? 'https://www.reddit.com/user/sxnian/',
                        ...(redditHref ? { href: redditHref } : {})
                      },
                      {
                        kind: 'resourceCard',
                        title:
                          ctx.t?.('schemaResourceContactGithubTitle', 'GitHub Repository') ??
                          'GitHub Repository',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceContactGithubDescription',
                            'https://github.com/Lefeaker/AllinOB'
                          ) ?? 'https://github.com/Lefeaker/AllinOB',
                        ...(githubHref ? { href: githubHref } : {})
                      },
                      {
                        kind: 'resourceCard',
                        title:
                          ctx.t?.('schemaResourceContactEmailTitle', 'Support Email') ??
                          'Support Email',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceContactEmailDescription',
                            'allinobsidian@outlook.com'
                          ) ?? 'allinobsidian@outlook.com',
                        ...(emailHref ? { href: emailHref } : {})
                      }
                    ],
                    3
                  )
                ]
              )
            ])
          : resourceModalStack([
              resourceCardGrid(
                resource.entries.map((item) => ({
                  kind: 'resourceCard',
                  title: item.title,
                  ...(item.subtitle ? { subtitle: item.subtitle } : {}),
                  ...(item.href ? { href: item.href } : {})
                })),
                3
              )
            ])
      ]
    };
  }
};

export default schema;
