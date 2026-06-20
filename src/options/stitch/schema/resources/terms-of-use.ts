import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'terms-of-use',
      kind: 'modal',
      title: tr('schemaResourceTermsTitle'),
      description: tr('schemaResourceTermsDescription'),
      size: 'large',
      children: [
        resourceModalStack([
          modalSection(tr('schemaResourceTermsLocalFirstTitle'), [
            paragraph(tr('schemaResourceTermsLocalFirstBody'))
          ]),
          modalSection(tr('schemaResourceTermsUserResponsibilityTitle'), [
            paragraph(tr('schemaResourceTermsUserResponsibilityBody'))
          ]),
          modalSection(tr('schemaResourceTermsServiceLimitTitle'), [
            paragraph(tr('schemaResourceTermsServiceLimitBody'))
          ])
        ])
      ]
    };
  }
};

export default schema;
