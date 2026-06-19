import type { ResourceSchema } from '../../types';
import { createSetupGuideView } from './setup-guide';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    return createSetupGuideView(ctx, {
      id: 'plugin-setup',
      kind: 'modal'
    });
  }
};

export default schema;
