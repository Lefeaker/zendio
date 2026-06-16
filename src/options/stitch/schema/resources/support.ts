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
    const resource = ctx.appData.resources.support;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    const koFiHref = resource.channels.find((item) => item.href?.includes('ko-fi'))?.href;
    const afdianHref = resource.channels.find((item) => item.href?.includes('afdian'))?.href;
    return {
      id: 'support',
      kind: 'modal',
      title: tr('schemaResourceSupportTitle'),
      description: tr('schemaResourceSupportDescription'),
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(tr('schemaResourceSupportChannelsGroupTitle'), [
                resourceCardGrid(
                  [
                    {
                      title: tr('schemaResourceSupportKoFiTitle'),
                      subtitle: tr('schemaResourceSupportKoFiDescription'),
                      ...(koFiHref !== undefined ? { href: koFiHref } : {})
                    },
                    {
                      title: tr('schemaResourceSupportAfdianTitle'),
                      subtitle: tr('schemaResourceSupportAfdianDescription'),
                      ...(afdianHref !== undefined ? { href: afdianHref } : {})
                    }
                  ].map((item) => resourceCard(item)),
                  2
                )
              ]),
              modalSection(tr('schemaResourceSupportScopeGroupTitle'), [
                {
                  kind: 'list',
                  items: [
                    tr('schemaResourceSupportScope1'),
                    tr('schemaResourceSupportScope2'),
                    tr('schemaResourceSupportScope3'),
                    tr('schemaResourceSupportScope4')
                  ]
                }
              ])
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
