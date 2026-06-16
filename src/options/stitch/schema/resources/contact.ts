import type { ResourceSchema } from '../../types';
import { htmlParagraph } from '../builders/primitives';
import { modalSection, resourceCardGrid, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.contact;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    const redditHref = resource.entries.find((item) => item.href?.includes('reddit.com'))?.href;
    const githubHref = resource.entries.find((item) => item.href?.includes('github.com'))?.href;
    const emailHref = resource.entries.find((item) => item.href?.startsWith('mailto:'))?.href;
    return {
      id: 'contact',
      kind: 'modal',
      title: tr('schemaResourceContactTitle'),
      description: tr('schemaResourceContactHint'),
      children: [
        shouldLocalize
          ? resourceModalStack([
              htmlParagraph(tr('schemaResourceContactDescription')),
              modalSection(tr('schemaResourceContactChannelsGroupTitle'), [
                resourceCardGrid(
                  [
                    {
                      kind: 'resourceCard',
                      title: tr('schemaResourceContactRedditTitle'),
                      subtitle: tr('schemaResourceContactRedditDescription'),
                      ...(redditHref ? { href: redditHref } : {})
                    },
                    {
                      kind: 'resourceCard',
                      title: tr('schemaResourceContactGithubTitle'),
                      subtitle: tr('schemaResourceContactGithubDescription'),
                      ...(githubHref ? { href: githubHref } : {})
                    },
                    {
                      kind: 'resourceCard',
                      title: tr('schemaResourceContactEmailTitle'),
                      subtitle: tr('schemaResourceContactEmailDescription'),
                      ...(emailHref ? { href: emailHref } : {})
                    }
                  ],
                  3
                )
              ])
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
