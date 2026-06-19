import type { ResourceSchema } from '../../types';
import { createSetupGuideView } from './setup-guide';

const schema: ResourceSchema = {
  openMode: 'page',
  href: './onboarding.html',
  createView(ctx) {
    return createSetupGuideView(ctx, {
      id: 'onboarding',
      kind: 'standalone-page'
    });
  }
};

export default schema;
