import type { ResourceSchema } from '../../types';
import { code } from '../builders/primitives';
import {
  heroPills,
  modalSection,
  modalSectionHead,
  modalSectionRaw,
  resourceModalStack,
  stepCard,
  stepGrid
} from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const guide = ctx.appData.resources.pluginSetup;
    return {
      id: 'plugin-setup',
      kind: 'modal',
      title: 'Plugin Setup Guide',
      description: '围绕 Obsidian Local REST API 的真实配置流程整理。',
      size: 'large',
      children: [
        resourceModalStack([
          heroPills(guide.hero.pills),
          modalSection('Recommended Values', [
            {
              kind: 'table',
              columns: ['Field', 'Value'],
              rows: guide.ports.map(([label, value]) => ({
                cells: [{ text: label }, { node: code(value) }]
              }))
            }
          ]),
          modalSectionRaw([
            modalSectionHead('Setup Flow', {
              kind: 'button',
              label: '跳到 Storage',
              variant: 'primary',
              action: { id: 'navigation:closeResourceAndScrollToPanel', args: ['storage'] }
            }),
            stepGrid(
              guide.steps.map((step, index) =>
                stepCard({
                  number: String(index + 1),
                  title: step.title,
                  description: step.body
                })
              ),
              true
            )
          ]),
          modalSection('Checklist', [{ kind: 'list', items: guide.checks }])
        ])
      ]
    };
  }
};

export default schema;
