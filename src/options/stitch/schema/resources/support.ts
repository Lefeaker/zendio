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
    const resource = ctx.appData.resources.support;
    const shouldLocalize = Boolean(ctx.messages);
    const koFiHref = resource.channels.find((item) => item.href?.includes('ko-fi'))?.href;
    const afdianHref = resource.channels.find((item) => item.href?.includes('afdian'))?.href;
    return {
      id: 'support',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceSupportTitle', 'Support') ?? 'Support')
        : 'Support',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceSupportDescription',
            'Support the project through the available public channels.'
          ) ?? 'Support the project through the available public channels.')
        : 'Support the project through the available public channels.',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(
                ctx.t?.('schemaResourceSupportChannelsGroupTitle', 'Channels') ?? 'Channels',
                [
                  resourceCardGrid(
                    [
                      {
                        title: ctx.t?.('schemaResourceSupportKoFiTitle', 'Ko-fi') ?? 'Ko-fi',
                        subtitle:
                          ctx.t?.('schemaResourceSupportKoFiDescription', 'Buy me a coffee') ??
                          'Buy me a coffee',
                        ...(koFiHref !== undefined ? { href: koFiHref } : {})
                      },
                      {
                        title: ctx.t?.('schemaResourceSupportAfdianTitle', 'Afdian') ?? 'Afdian',
                        subtitle:
                          ctx.t?.(
                            'schemaResourceSupportAfdianDescription',
                            'Support the project in Chinese'
                          ) ?? 'Support the project in Chinese',
                        ...(afdianHref !== undefined ? { href: afdianHref } : {})
                      }
                    ].map((item) => resourceCard(item)),
                    2
                  )
                ]
              ),
              modalSection(
                ctx.t?.('schemaResourceSupportScopeGroupTitle', 'Support Scope') ?? 'Support Scope',
                [
                  {
                    kind: 'list',
                    items: [
                      ctx.t?.(
                        'schemaResourceSupportScope1',
                        'Install, upgrade, and environment setup questions.'
                      ) ?? 'Install, upgrade, and environment setup questions.',
                      ctx.t?.(
                        'schemaResourceSupportScope2',
                        'Clip failure, AI parsing, and Obsidian write troubleshooting.'
                      ) ?? 'Clip failure, AI parsing, and Obsidian write troubleshooting.',
                      ctx.t?.(
                        'schemaResourceSupportScope3',
                        'API token, permission, and connection guidance.'
                      ) ?? 'API token, permission, and connection guidance.',
                      ctx.t?.(
                        'schemaResourceSupportScope4',
                        'Privacy, permission, and data safety clarification.'
                      ) ?? 'Privacy, permission, and data safety clarification.'
                    ]
                  }
                ]
              )
            ])
          : resourceModalStack([
              resourceCardGrid(
                resource.channels.map((item) => resourceCard(item)),
                2
              )
            ])
      ]
    };
  }
};

export default schema;
