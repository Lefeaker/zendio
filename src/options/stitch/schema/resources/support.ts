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
    const koFi = resource.channels.find((item) => item.href?.includes('ko-fi'));
    const weChatReward = resource.channels.find(
      (item) =>
        item.image?.includes('wechat-reward') ||
        item.icon?.includes('wechat-reward') ||
        item.title.toLowerCase().includes('wechat')
    );
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
                      ...(koFi?.href !== undefined ? { href: koFi.href } : {}),
                      ...(koFi?.icon !== undefined ? { icon: koFi.icon } : {})
                    },
                    {
                      title: tr('schemaResourceSupportAfdianTitle'),
                      subtitle: tr('schemaResourceSupportAfdianDescription'),
                      ...(weChatReward?.icon !== undefined ? { icon: weChatReward.icon } : {}),
                      ...(weChatReward?.image !== undefined ? { image: weChatReward.image } : {}),
                      ...(weChatReward?.imageAlt !== undefined
                        ? { imageAlt: weChatReward.imageAlt }
                        : {}),
                      imagePresentation: 'modal' as const
                    }
                  ].map((item) => resourceCard(item)),
                  2
                )
              ])
            ])
          : resourceModalStack([
              resourceCardGrid(
                resource.channels.map((item) =>
                  resourceCard({
                    ...item,
                    ...(item.icon && item.image ? { imagePresentation: 'modal' as const } : {})
                  })
                ),
                2
              )
            ])
      ]
    };
  }
};

export default schema;
