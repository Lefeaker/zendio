import TurndownService from 'turndown';
import { applyObsidianRules } from '../../../third_party/obsidian-clipper/markdownRules';

export function createClipperTurndown(baseUrl: string): TurndownService {
  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });
  applyObsidianRules(turndown);

  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content, node: HTMLElement) => {
      const src = node.getAttribute('src');
      if (!src) {
        return '';
      }
      const absUrl = new URL(src, baseUrl).toString();
      const alt = (node.getAttribute('alt') || '').replace(/\|/g, '-');
      return `![${alt}](${absUrl})`;
    }
  });

  return turndown;
}
