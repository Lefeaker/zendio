/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { chatHtmlToMarkdown } from '../../../src/third_party/ai-chat-exporter/shared/markdown';

describe('chatHtmlToMarkdown - code fences', () => {
  it('uses toolbar language chip before code block', () => {
    const html = `
      <div class="code-toolbar">
        <div class="language-chip">TypeScript</div>
        <div class="toolbar-actions">Copy</div>
        <pre><code>// comment\nconst x: number = 1;</code></pre>
      </div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('```TypeScript');
    expect(markdown).toContain('const x: number = 1;');
    expect(markdown).not.toMatch(/TypeScript\s*\n```/);
  });

  it('converts uppercase language badge into lowercase fence label', () => {
    const html = `
      <div class="code-toolbar">
        <div class="badge">HTML</div>
        <pre><code>&lt;!DOCTYPE html&gt;\n&lt;body&gt;&lt;/body&gt;</code></pre>
      </div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('```html');
    expect(markdown).not.toContain('HTML\n');
  });

  it('handles plain text language label preceding the code fence', () => {
    const html = `
      <div class="code-container">
        JavaScript
        <button class="copy-button">Copy</button>
        <pre><code>console.log('hi');</code></pre>
      </div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('```JavaScript');
    expect(markdown).not.toMatch(/JavaScript\s*\n```/);
  });

  it('preserves camel-case labels like TypeScript when provided as text nodes', () => {
    const html = `
      <div>
        TypeScript
        <pre><code>// comment\nlet value: number = 42;</code></pre>
      </div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('```TypeScript');
    expect(markdown).not.toMatch(/TypeScript\s*\n```/);
  });

  it('fixes dangling language labels when structural capture fails', () => {
    const html = `
      <div class="block">
        <p>Python</p>
        <div class="gap"></div>
        <pre><code>print('deepseek')</code></pre>
      </div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('```Python');
    expect(markdown).not.toMatch(/Python\s*\n```/);
  });
});
