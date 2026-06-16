import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.dataUsage;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'data-usage',
      kind: 'modal',
      title: shouldLocalize ? tr('schemaResourceDataUsageTitle') : resource.hero.title,
      description: shouldLocalize
        ? tr('schemaResourceDataUsageDescription')
        : resource.hero.description,
      size: 'large',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(tr('schemaResourceDataUsageAnonymousUsageTitle'), [
                paragraph(tr('schemaResourceDataUsageAnonymousUsageBody'))
              ]),
              modalSection(tr('errorReportingDetailsTitle'), [
                paragraph(tr('errorReportingCollectedTitle')),
                {
                  kind: 'list',
                  items: [
                    tr('errorReportingCollectedError'),
                    tr('errorReportingCollectedBrowser'),
                    tr('errorReportingCollectedExtension'),
                    tr('errorReportingCollectedTimestamp')
                  ]
                }
              ]),
              modalSection(tr('schemaResourceDataUsageConfigMigrationTitle'), [
                paragraph(tr('schemaResourceDataUsageConfigMigrationBody'))
              ])
            ])
          : resourceModalStack(
              resource.sections.map((section) =>
                modalSection(section.title, [paragraph(section.body)])
              )
            )
      ]
    };
  }
};

export default schema;
