import type { ResourceSchema } from '../../types';
import { resourceCard, resourceCardGrid } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.suggestions;
    return {
      id: 'suggestions',
      kind: 'modal',
      title: '提出建议',
      description: '感谢你愿意反馈想法，以下渠道都可以快速联系到作者。',
      children: [
        resourceCardGrid(
          resource.channels.map((item) => resourceCard(item)),
          2
        )
      ]
    };
  }
};

export default schema;
