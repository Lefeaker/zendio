// Obsidian Web Clipper - Markdown Rules
// Migrated from: https://github.com/obsidianmd/obsidian-clipper
// License: MIT

import TurndownService from 'turndown';
import { registerMarkdownCodeRules } from './markdownCodeRules';
import { registerMarkdownListRules } from './markdownListRules';
import { registerMarkdownTableRules } from './markdownTableRules';

/**
 * Apply Obsidian-specific Turndown rules to a TurndownService instance
 */
export function applyObsidianRules(turndownService: TurndownService): void {
  // Highlight rule (mark -> ==text==)
  turndownService.addRule('highlight', {
    filter: 'mark',
    replacement: function (content: string) {
      return '==' + content + '==';
    }
  });

  // Strikethrough rule (del/s/strike -> ~~text~~)
  turndownService.addRule('strikethrough', {
    filter: (node: Node) =>
      node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE',
    replacement: function (content: string) {
      return '~~' + content + '~~';
    }
  });

  registerMarkdownListRules(turndownService);
  registerMarkdownTableRules(turndownService);
  registerMarkdownCodeRules(turndownService);

  // Callouts/Alerts (GitHub-style alerts -> Obsidian callouts)
  turndownService.addRule('callout', {
    filter: (node: HTMLElement) => {
      return node.nodeName.toLowerCase() === 'div' && node.classList.contains('markdown-alert');
    },
    replacement: (content: string, node: Node) => {
      const element = node as HTMLElement;

      // Get alert type from the class (e.g., markdown-alert-note -> NOTE)
      const alertClasses = Array.from(element.classList);
      const typeClass = alertClasses.find(
        (c) => c.startsWith('markdown-alert-') && c !== 'markdown-alert'
      );
      const type = typeClass ? typeClass.replace('markdown-alert-', '').toUpperCase() : 'NOTE';

      // Find the title element and content
      const titleElement = element.querySelector('.markdown-alert-title');
      const contentElement = element.querySelector('p:not(.markdown-alert-title)');

      // Extract content, removing the title from it if present
      let alertContent = content;
      if (titleElement && titleElement.textContent) {
        alertContent = contentElement?.textContent || content.replace(titleElement.textContent, '');
      }

      // Format as Obsidian callout
      return `\n> [!${type}]\n> ${alertContent.trim().replace(/\n/g, '\n> ')}\n`;
    }
  });

  // YouTube and Twitter embeds -> clickable links
  turndownService.addRule('embedToMarkdown', {
    filter: function (node: Node): boolean {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute('src');
        return (
          !!src &&
          (!!src.match(/(?:youtube\.com|youtu\.be)/) || !!src.match(/(?:twitter\.com|x\.com)/))
        );
      }
      return false;
    },
    replacement: function (content: string, node: Node): string {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute('src');
        if (src) {
          const youtubeMatch = src.match(
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/
          );
          if (youtubeMatch) {
            return `[YouTube Video](https://www.youtube.com/watch?v=${youtubeMatch[1]})`;
          }

          const twitterMatch = src.match(/(?:twitter\.com|x\.com)/);
          if (twitterMatch) {
            return `[Twitter/X Embed](${src})`;
          }
        }
      }
      return content;
    }
  });

  // Remove unwanted elements
  turndownService.remove(['style', 'script', 'button']);

  // Keep certain elements as HTML
  const keepElements: Array<keyof HTMLElementTagNameMap> = [
    'iframe',
    'video',
    'audio',
    'sup',
    'sub'
  ];
  turndownService.keep(keepElements);
  turndownService.keep((node: HTMLElement) => isSvgElement(node));
}

function isSvgElement(node: unknown): node is Element {
  if (!node || typeof node !== 'object') {
    return false;
  }
  const element = node as Element;
  const nodeName = typeof element.nodeName === 'string' ? element.nodeName : '';
  return nodeName.toLowerCase() === 'svg';
}
