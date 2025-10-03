import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import { applyObsidianRules } from '../../third_party/obsidian-clipper/markdownRules';
import { preprocessDocument } from '../../third_party/obsidian-clipper/domPrep';

export async function extractArticle(doc: Document, url: string) {
  const cloned = preprocessDocument(doc.cloneNode(true) as Document, url);
  const rd = new Readability(cloned).parse();

  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });

  // Apply Obsidian-specific rules first
  applyObsidianRules(turndown);

  // Override with our external image rule (must be last to take precedence)
  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content, node: any) => {
      const src = node.getAttribute('src'); if (!src) return '';
      const abs = new URL(src, url).toString();
      const alt = (node.getAttribute('alt') || '').replace(/\|/g,'-');
      return `![${alt}](${abs})`;
    }
  });

  const bodyMd = turndown.turndown(rd?.content || doc.body.innerHTML);
  const title = (rd?.title || doc.title || new URL(url).hostname).trim();

  const fm = `---\ntype: article\ntitle: "${esc(title)}"\nurl: "${url}"\nclipped_at: "${new Date().toISOString()}"\ntags: [clipping]\n---`;
  return {
    type: 'article',
    title,
    markdown: `${fm}\n\n${bodyMd}\n`,
    meta: { url, domain: new URL(url).hostname, clippedAtISO: new Date().toISOString() }
  };
}
const esc = (s:string)=>s.replace(/"/g,'\\"');