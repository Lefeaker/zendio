import type { ResourceSchema } from '../../types';
import { div } from '../builders/primitives';
import { releaseCard } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.changelog;
    return {
      id: 'changelog',
      kind: 'modal',
      title: '更新日志',
      description: '这里直接使用项目中的更新日志重点内容。',
      size: 'large',
      children: [
        div(
          'release-list',
          resource.entries.map((entry) => releaseCard(entry))
        )
      ]
    };
  }
};

export default schema;
