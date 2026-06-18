import type { ResourceSchema } from '../../types';
import { htmlParagraph } from '../builders/primitives';
import { resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'contact',
      kind: 'modal',
      title: tr('schemaResourceContactTitle'),
      description: '',
      children: [resourceModalStack([htmlParagraph(tr('schemaResourceContactDescription'))])]
    };
  }
};

export default schema;
