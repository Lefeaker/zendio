/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import TurndownService from 'turndown';

import { applyObsidianRules } from '../../../src/third_party/obsidian-clipper/markdownRules';

describe('markdownRules', () => {
  const convert = (html: string): string => {
    const service = new TurndownService();
    applyObsidianRules(service);
    return service.turndown(html);
  };

  it('converts marks, strikethrough, task lists, and embeds', () => {
    const markdown = convert(
      '<mark>Hi</mark><del>Gone</del><ul><li class="task-list-item"><input type="checkbox" checked>Task</li></ul><iframe src="https://www.youtube.com/embed/abc123"></iframe>'
    );
    expect(markdown).toContain('==Hi==');
    expect(markdown).toContain('~~Gone~~');
    expect(markdown).toContain('[x] Task');
    expect(markdown).toContain('[YouTube Video](https://www.youtube.com/watch?v=abc123)');
  });

  it('converts simple tables, math, and callouts', () => {
    const markdown = convert(
      '<table><tr><th>A</th></tr><tr><td>B</td></tr></table><div class="mwe-math-element"><annotation encoding="application/x-tex">x+y</annotation></div><div class="markdown-alert markdown-alert-note"><div class="markdown-alert-title">Note</div><p>Body</p></div>'
    );
    expect(markdown).toContain('| A |');
    expect(markdown).toContain('| --- |');
    expect(markdown).toContain('$x+y$');
    expect(markdown).toContain('> [!NOTE]');
  });

  it('converts github alerts into obsidian callouts and keeps youtube embeds clickable', () => {
    const html = `
      <div class="markdown-alert markdown-alert-note">
        <p class="markdown-alert-title">Note</p>
        <p>Important reminder</p>
      </div>
      <iframe src="https://www.youtube.com/embed/abc123"></iframe>
    `;
    const markdown = convert(html);
    expect(markdown).toContain('[!NOTE]');
    expect(markdown).toContain('Important reminder');
    expect(markdown).toContain('[YouTube Video](https://www.youtube.com/watch?v=abc123)');
  });
});
