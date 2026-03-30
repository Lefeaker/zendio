import TurndownService from 'turndown';
import { applyObsidianRules } from '@third-party/obsidian-clipper/markdownRules';

export function createClipperTurndown(baseUrl: string): TurndownService {
  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });
  applyObsidianRules(turndown);

  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content: string, node: Node) => {
      // Cast to Element to access getAttribute method
      const element = node as Element;
      const src = element.getAttribute('src');
      if (!src) {
        return '';
      }
      const absUrl = new URL(src, baseUrl).toString();
      const alt = (element.getAttribute('alt') || '').replace(/\|/g, '-');
      return `![${alt}](${absUrl})`;
    }
  });

  return turndown;
}
