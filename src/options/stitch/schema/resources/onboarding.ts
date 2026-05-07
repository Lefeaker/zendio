import type { ResourceSchema } from '../../types';
import { stepCard, stepGrid } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'page',
  href: './onboarding.html',
  createView(ctx) {
    return {
      id: 'onboarding',
      kind: 'standalone-page',
      hero: ctx.appData.resources.onboarding.hero,
      children: [
        {
          kind: 'group',
          title: 'Guide Flow',
          children: [
            {
              kind: 'card',
              title: 'Onboarding Steps',
              description: '内容来自项目当前 onboarding 页面，不再是抽象占位。',
              actions: [
                {
                  kind: 'button',
                  label: '跳到 Storage',
                  variant: 'secondary',
                  action: { id: 'navigation:openMainAtPanel', args: ['storage'] }
                }
              ],
              body: [
                stepGrid((current) =>
                  current.appData.resources.onboarding.steps.map((step) => stepCard(step))
                )
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
