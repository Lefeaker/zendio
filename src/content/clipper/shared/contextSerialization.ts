import TurndownService from 'turndown';

const LIST_INDENT = '  ';

export interface AncestorMarkdownInfo {
  markdown: string;
  depth: number;
}

export function buildAncestorListMarkdown(listPath: Element[], turndown: TurndownService): AncestorMarkdownInfo {
  if (listPath.length === 0) {
    return { markdown: '', depth: 0 };
  }

  const ancestors = listPath.slice(0, -1);
  if (ancestors.length === 0) {
    return { markdown: '', depth: listPath.length - 1 };
  }

  const lines: string[] = [];
  ancestors.forEach((li, index) => {
    const label = extractListItemLabel(li, turndown);
    if (!label) {
      return;
    }
    const indent = LIST_INDENT.repeat(index);
    lines.push(`${indent}- ${label}`);
  });

  return {
    markdown: lines.join('\n'),
    depth: listPath.length - 1
  };
}

export function wrapListFragment(listItem: Element, fragment: DocumentFragment): string {
  const parentTag = listItem.parentElement?.tagName?.toLowerCase() === 'ol' ? 'ol' : 'ul';
  const listWrapper = document.createElement(parentTag || 'ul');
  const listItemClone = listItem.cloneNode(false) as Element;
  listItemClone.appendChild(fragment.cloneNode(true));
  listWrapper.appendChild(listItemClone);
  return listWrapper.outerHTML;
}

export function serializeFragment(fragment: DocumentFragment): string {
  if (!fragment.hasChildNodes()) {
    return '';
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  return wrapper.innerHTML;
}

export function serializeElement(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  const tagName = clone.tagName.toLowerCase();

  if (tagName === 'li') {
    const parentTag = element.parentElement?.tagName?.toLowerCase() === 'ol' ? 'ol' : 'ul';
    const listWrapper = document.createElement(parentTag || 'ul');
    listWrapper.appendChild(clone);
    return listWrapper.outerHTML;
  }

  return clone.outerHTML;
}

export function extractListItemLabel(li: Element, turndown: TurndownService): string {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('ul, ol').forEach(el => el.remove());

  const wrapper = document.createElement('ul');
  wrapper.appendChild(clone);
  const markdown = turndown.turndown(wrapper.outerHTML).trim();

  return markdown.replace(/^[-*+]\s+/, '').trim();
}
