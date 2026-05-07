import type { ResourceSchema } from '../../types';
import { resourceCardGrid, resourceModalStack } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.contact;
    return {
      id: 'contact',
      kind: 'modal',
      title: '联系作者',
      description: resource.note,
      children: [
        resourceModalStack([
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
