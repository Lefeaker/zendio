import { createChangelogResource } from '../../changelogResourceData';
import type { ResourceSchema } from '../../types';
import { div } from '../builders/primitives';
import { releaseCard } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = createChangelogResource(ctx.messages);
    return {
      id: 'changelog',
      kind: 'modal',
      title: resource.hero.title,
      description: resource.hero.description,
      size: 'large',
      children: [
        div(
          'release-list',
          resource.entries.map((entry) => releaseCard({ ...entry }))
        )
      ]
    };
  }
};

export default schema;
