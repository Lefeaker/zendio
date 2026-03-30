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

describe('chatHtmlToMarkdown - mixed structures', () => {
  it('converts nested lists, blockquotes, and ordered list start offsets', () => {
    const html = `
      <ol start="3">
        <li>
          Step three
          <ul>
            <li>nested bullet</li>
          </ul>
        </li>
        <li>
          <blockquote><p>quoted note</p></blockquote>
        </li>
      </ol>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('3. Step three');
    expect(markdown).toContain('- nested bullet');
    expect(markdown).toContain('> quoted note');
  });

  it('converts tables with inline formatting and kimi labels', () => {
    const html = `
      <table data-kimi-label="Topic">
        <thead>
          <tr><th>Name</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Alpha</strong></td><td><code>x</code></td></tr>
          <tr><td><a href="https://example.com">Beta</a></td><td><em>soft</em></td></tr>
        </tbody>
      </table>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('| Topic | Name | Value |');
    expect(markdown).toContain('| **Alpha** | `x` |');
    expect(markdown).toContain('[Beta](https://example.com)');
    expect(markdown).toContain('*soft*');
  });

  it('falls back to unlabeled fences and preserves inline links and images', () => {
    const html = `
      <p>Use <a href="https://example.com/docs">docs</a> and screenshot below.</p>
      <pre>raw block</pre>
      <div class="image-container" data-image-url="https://example.com/image.png"></div>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('[docs](https://example.com/docs)');
    expect(markdown).toContain('```\nraw block\n```');
    expect(markdown).toContain('![Image](https://example.com/image.png)');
  });

  it('normalizes whitespace-heavy cells and ignores blob-backed images', () => {
    const html = `
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td> line 1 <br> line 2 </td><td><img alt="bad" src="blob:123"></td></tr>
      </table>
    `;

    const markdown = chatHtmlToMarkdown(html);

    expect(markdown).toContain('| A | B |');
    expect(markdown).toContain('| line 1 line 2 |');
    expect(markdown).toContain('[User uploaded image - not available]');
  });
});


it('keeps footnote indices and language labels when they are rendered as visible chips', () => {
  const html = `
    <div>
      <div class="language-chip" data-language="TSX">TSX</div>
      <pre><code>const Demo = () =&gt; &lt;div&gt;ok&lt;/div&gt;;</code></pre>
      <p>Source<source-footnote><sup data-turn-source-index="7"></sup></source-footnote></p>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);

  expect(markdown).toContain('```tsx');
  expect(markdown).toContain('const Demo = () => <div>ok</div>;');
  expect(markdown).toContain('Source[7]');
});

it('keeps nested quotes and fenced code blocks readable inside list items', () => {
  const html = `
    <ul>
      <li>
        outer item
        <blockquote><p>quoted context</p></blockquote>
        <pre><code>echo nested</code></pre>
      </li>
    </ul>
  `;

  const markdown = chatHtmlToMarkdown(html);

  expect(markdown).toContain('- outer item');
  expect(markdown).toContain('> quoted context');
  expect(markdown).toContain("```\necho nested\n```");
});

it('keeps escaped pipes and unlabeled code fences readable inside blockquotes', () => {
  const html = `
    <blockquote>
      <p>cell A | cell B</p>
      <pre><code>line 1
line 2</code></pre>
    </blockquote>
  `;

  const markdown = chatHtmlToMarkdown(html);

  expect(markdown).toContain('cell A | cell B');
  expect(markdown).toContain('```');
  expect(markdown).toContain('line 1');
});



it('returns empty markdown for empty html input', () => {
  expect(chatHtmlToMarkdown('')).toBe('');
  expect(chatHtmlToMarkdown('   ')).toBe('');
});


it('keeps unmatched language labels as plain text when no following code block exists', () => {
  const html = `
    <div>
      <div class="language-chip">TypeScript</div>
      <p>plain paragraph</p>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('TypeScript');
  expect(markdown).not.toContain('```TypeScript');
});

it('uses pre data-language attributes and data-src images when direct src is missing', () => {
  const html = `
    <div>
      <pre data-language="bash"><code>echo hi</code></pre>
      <img alt="Preview" data-src="https://example.com/preview.png" />
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```bash');
  expect(markdown).toContain('echo hi');
  expect(markdown).toContain('![Preview](https://example.com/preview.png)');
});

it('treats uppercase chips without an associated code block as plain text', () => {
  const html = `
    <section>
      <div class="language-chip">SQL</div>
      <p>select summary</p>
    </section>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('SQL');
  expect(markdown).not.toContain('```sql');
});


it('normalizes language aliases like Objective C and TS when fences are inferred', () => {
  const html = `
    <div>
      <div data-language="Objective C">Objective C</div>
      <pre><code>int main() { return 0; }</code></pre>
      <div data-language="TS">TS</div>
      <pre><code>const value: number = 1;</code></pre>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```objective-c');
  expect(markdown).toContain('```typescript');
});


it('skips copy-toolbar siblings when inferring language labels for nested pre blocks', () => {
  const html = `
    <div>
      <div class="language-chip">TS</div>
      <button class="copy-action">Copy</button>
      <div class="code-shell"><pre><code>const value = 1;</code></pre></div>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```typescript');
  expect(markdown).toContain('const value = 1;');
});

it('keeps label text plain when a following pre block has no code child', () => {
  const html = `
    <div>
      <div class="language-chip">SQL</div>
      <pre>select * from demo;</pre>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```');
  expect(markdown).toContain('select * from demo;');
  expect(markdown).not.toContain('```sql');
});


it('infers language labels from standalone text nodes before nested pre blocks', () => {
  const html = `
    <div>
      TSX
      <span class="toolbar-action">Copy</span>
      <section><pre><code>const App = () =&gt; null;</code></pre></section>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```tsx');
  expect(markdown).toContain('const App = () => null;');
});

it('uses data-original-src and skips empty custom image wrappers', () => {
  const html = `
    <div>
      <img alt="Fallback" data-original-src="https://example.com/original.png" />
      <div class="image-container"></div>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('![Fallback](https://example.com/original.png)');
  expect(markdown).not.toContain('![Image]()');
});

it('renders math-inline fallbacks and horizontal rules inside rich content', () => {
  const html = `
    <div>
      <span class="math-inline"><math>x+y</math></span>
      <hr />
      <table><tr><td><sup>2</sup></td><td><sub>n</sub></td></tr></table>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('x+y');
  expect(markdown).toContain('---');
  expect(markdown).toContain('^2^');
  expect(markdown).toContain('~n~');
});

it('normalizes escaped html entities and keeps plain language labels outside code blocks', () => {
  const html = `
    <div>
      <p>HTML &amp; entities &lt;stay&gt; visible</p>
      <div class="language-chip">JSON</div>
      <p>not actually code</p>
      <blockquote><p> spaced   quote </p></blockquote>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('HTML & entities <stay> visible');
  expect(markdown).toContain('JSON');
  expect(markdown).not.toContain('```json');
  expect(markdown).toContain('>  spaced   quote ');
});



it('normalizes trailing-colon language labels from data-code-language and ignores empty wrappers', () => {
  const html = `
    <div>
      <div data-code-language="Plain Text:">Plain Text:</div>
      <div class="empty-wrapper">   </div>
      <pre><code>alpha
beta</code></pre>
      <p></p>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('```text');
  expect(markdown).toContain('alpha');
  expect(markdown).toContain('beta');
  expect(markdown).not.toContain(`Plain Text:
\`\`\``);
});

it('keeps mixed table and fenced code content readable inside blockquotes with blank siblings', () => {
  const html = `
    <blockquote>
      <div>   </div>
      <table>
        <tr><th>Key</th><th>Value</th></tr>
        <tr><td>a &amp; b</td><td><code>x</code></td></tr>
      </table>
      <div class="language-chip">BASH</div>
      <pre><code>echo nested</code></pre>
    </blockquote>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('| Key | Value |');
  expect(markdown).toContain('| a & b | `x` |');
  expect(markdown).toContain('```bash');
  expect(markdown).toContain('echo nested');
});


it('converts tables nested inside pre blocks and keeps inline formatting', () => {
  const html = `
    <div>
      <pre>
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td><strong>Alpha</strong></td><td><code>1</code></td></tr>
        </table>
      </pre>
    </div>
  `;

  const markdown = chatHtmlToMarkdown(html);
  expect(markdown).toContain('| Name | Value |');
  expect(markdown).toContain('| **Alpha** | `1` |');
  expect(markdown).not.toContain('```');
});
