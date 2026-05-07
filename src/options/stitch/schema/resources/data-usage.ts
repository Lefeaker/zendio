import type { ResourceSchema } from '../../types';
import { div, paragraph, strong } from '../builders/primitives';
import { resourceModalStack } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.dataUsage;
    return {
      id: 'data-usage',
      kind: 'modal',
      title: resource.hero.title,
      description: resource.hero.description,
      size: 'large',
      children: [
        resourceModalStack(
          resource.sections.map((section) =>
            div('resource-section', [
              strong(section.title),
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
