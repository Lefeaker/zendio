import TurndownService from 'turndown';

export function registerMarkdownListRules(turndownService: TurndownService): void {
  turndownService.addRule('taskListItem', {
    filter: 'li',
    replacement: function (content: string, node: Node, options: TurndownService.Options) {
      if (!(node instanceof HTMLElement)) return content;

      const isTaskListItem = node.classList.contains('task-list-item');
      const checkbox = node.querySelector('input[type="checkbox"]');
      let taskListMarker = '';

      if (isTaskListItem && checkbox) {
        content = content.replace(/<input[^>]*>/, '');
        taskListMarker = (checkbox as HTMLInputElement).checked ? '[x] ' : '[ ] ';
      }

      content = content
        .replace(/\n+$/, '')
        .split('\n')
        .filter((line) => line.length > 0)
        .join('\n\t');

      let prefix = options.bulletListMarker + ' ';
      const parent = node.parentNode;

      let level = 0;
      let currentParent = node.parentNode;
      while (
        currentParent &&
        (currentParent.nodeName === 'UL' || currentParent.nodeName === 'OL')
      ) {
        level++;
        currentParent = currentParent.parentNode;
      }

      const indentLevel = Math.max(0, level - 1);
      prefix = '\t'.repeat(indentLevel) + prefix;

      if (parent instanceof HTMLOListElement) {
        const start = parent.getAttribute('start');
        const index = Array.from(parent.children).indexOf(node) + 1;
        prefix = '\t'.repeat(level - 1) + (start ? Number(start) + index - 1 : index) + '. ';
      }

      return (
        prefix +
        taskListMarker +
        content.trim() +
        (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
      );
    }
  });
}
