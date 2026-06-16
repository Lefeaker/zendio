import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.privacyPolicy;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'privacy-policy',
      kind: 'modal',
      title: shouldLocalize ? tr('schemaResourcePrivacyPolicyTitle') : resource.hero.title,
      description: shouldLocalize
        ? tr('schemaResourcePrivacyPolicyDescription')
        : resource.hero.description,
      size: 'large',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(tr('errorReportingNotCollectedTitle'), [
                {
                  kind: 'list',
                  items: [
                    tr('errorReportingNotCollectedContent'),
                    tr('errorReportingNotCollectedUrls'),
                    tr('errorReportingNotCollectedPasswords'),
                    tr('errorReportingNotCollectedPersonal')
                  ]
                }
              ]),
              modalSection(tr('analyticsConsentTitle'), [
                paragraph(tr('analyticsConsentDescription'))
              ]),
              modalSection(tr('errorReportingConsentTitle'), [
                paragraph(tr('errorReportingConsentDescription'))
              ]),
              modalSection(tr('schemaResourcePrivacyLocalConfigTitle'), [
                paragraph(tr('schemaResourcePrivacyLocalConfigBody'))
              ])
            ])
          : resourceModalStack(
              resource.sections.map((section) =>
                modalSection(section.title, [
                  paragraph(section.body),
                  section.bullets?.length ? { kind: 'list', items: section.bullets } : null
                ])
              )
            )
      ]
    };
  }
};

export default schema;
