import type { ResourceSchema } from '../../types';
import { resourceCard, resourceCardGrid, resourceModalStack } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.support;
    return {
      id: 'support',
      kind: 'modal',
      title: '感谢支持',
      description: '开发不易，如果这个插件对你有帮助，欢迎通过以下方式支持。',
      children: [
        resourceModalStack([
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
