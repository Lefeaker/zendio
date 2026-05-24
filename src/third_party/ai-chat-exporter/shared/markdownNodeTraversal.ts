export interface MarkdownRenderer {
  (node: Node, indent?: string): string;
}

export interface MarkdownChildrenProcessor {
  (elem: HTMLElement, indent?: string): string;
}

export function processChildNodes(
  elem: HTMLElement,
  renderNode: MarkdownRenderer,
  indent = ''
): string {
  let result = '';
  for (const child of Array.from(elem.childNodes)) {
    result += renderNode(child, indent);
  }
  return result;
}
