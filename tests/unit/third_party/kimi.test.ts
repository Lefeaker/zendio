/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { kimiParser } from '../../../src/third_party/ai-chat-exporter/platforms/kimi';

function parseImages(html: string) {
  const doc = new DOMParser().parseFromString(
    `<title>Boundary regression - Kimi</title>${html}`,
    'text/html'
  );
  const images = kimiParser.collectImages?.(doc);
  if (!images) throw new Error('Kimi collector missing');
  images.forEach((image, index) =>
    image.node.setAttribute('data-aiob-image-token', `kimi-${index}`)
  );
  const result = kimiParser.parse(doc, {
    imageResolver(node) {
      const token = node.getAttribute('data-aiob-image-token');
      if (!token) throw new Error('Unregistered image');
      return `![test](aiob-attachment:${token})`;
    }
  });
  const references = result.messages.flatMap((message) =>
    Array.from((message.md ?? '').matchAll(/aiob-attachment:kimi-\d+/g), (match) => match[0])
  );
  return { images, result, references };
}

const image = '<img src="/image.png" alt="test">';
function modernMessage(role: 'user' | 'assistant', content: string): string {
  return `<div class="chat-content-item chat-content-item-${role}"><div class="message-content">${content}</div></div>`;
}

describe('Kimi non-overlapping message roots', () => {
  it('does not parse nested message-content as another message or image occurrence', () => {
    const { images, result, references } = parseImages(
      modernMessage('user', `${image}Question`) + modernMessage('assistant', 'Answer')
    );
    expect(images).toHaveLength(1);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(result.messages[0]?.md).toContain('Question');
    expect(result.messages[1]?.md).toBe('Answer');
    expect(references).toEqual(['aiob-attachment:kimi-0']);
    expect(images[0]?.messageRoot?.classList.contains('chat-content-item-user')).toBe(true);
  });

  it.each(['message-list', 'MessageList', 'kimi-message-list', 'chat-content-item-list'])(
    'does not merge a %s conversation list or deduplicate identical turns',
    (wrapper) => {
      const turn = modernMessage('user', `${image}Repeat`) + modernMessage('assistant', 'Repeat');
      const { images, result, references } = parseImages(
        `<div class="${wrapper}"><p>LIST_CHROME</p>${turn}${turn}</div>`
      );
      expect(images).toHaveLength(2);
      expect(result.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant'
      ]);
      expect(result.messages.map((message) => message.md).join('\n')).not.toContain('LIST_CHROME');
      expect(result.messages[1]?.md).toBe('Repeat');
      expect(result.messages[3]?.md).toBe('Repeat');
      expect(references).toEqual(['aiob-attachment:kimi-0', 'aiob-attachment:kimi-1']);
    }
  );

  it('preserves legacy role wrappers and sibling images outside a nested body', () => {
    const { images, result, references } = parseImages(
      `<div class="Message UserMessage"><div class="message-content">${image}Question</div>${image}</div><div class="Message kimi-assistant"><div class="MessageBody">Answer</div></div>`
    );
    expect(images).toHaveLength(2);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(references).toEqual(['aiob-attachment:kimi-0', 'aiob-attachment:kimi-1']);
  });

  it('keeps image-only roles when the same resource appears in separate messages', () => {
    const { images, result, references } = parseImages(
      modernMessage('user', image) + modernMessage('assistant', image)
    );
    expect(images).toHaveLength(2);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(references).toEqual(['aiob-attachment:kimi-0', 'aiob-attachment:kimi-1']);
  });

  it('retains a legacy unlabelled assistant wrapper and its outside-body image', () => {
    const { result, references } = parseImages(
      `<div class="message user"><div class="content">Question</div></div><div class="message"><div class="message-content">Answer</div>${image}</div>`
    );
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(result.messages[1]?.md).toContain('Answer');
    expect(references).toEqual(['aiob-attachment:kimi-0']);
  });

  it('keeps separate assistant replies inside a generic list after a user message', () => {
    const { result } = parseImages(
      `<div class="message user">Question</div><div class="kimi-message-list"><div class="message assistant">Repeat</div><div class="message assistant">Repeat</div></div>`
    );
    expect(result.messages.map((message) => [message.role, message.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Repeat'],
      ['assistant', 'Repeat']
    ]);
  });

  it('keeps unlabelled legacy message siblings separate when neither has a role class', () => {
    const { result, references } = parseImages(
      `<div class="message-list"><div class="message">${image}Repeat</div><div class="message">${image}Repeat</div></div>`
    );
    expect(result.messages.map((message) => message.role)).toEqual(['assistant', 'assistant']);
    expect(references).toEqual(['aiob-attachment:kimi-0', 'aiob-attachment:kimi-1']);
  });

  it('does not lose unlabelled legacy siblings while ignoring a list with a named user', () => {
    const { result, references } = parseImages(
      `<div class="message-list"><div class="message user">Question</div><div class="message"><div class="message-content">${image}Answer</div></div></div>`
    );
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(references).toEqual(['aiob-attachment:kimi-0']);
  });

  it('recognizes named messages inside an unlabelled wrapper with the legacy message class', () => {
    const { result } = parseImages(
      '<div class="message"><div class="message user">Question</div><div class="message assistant">Answer</div></div>'
    );
    expect(result.messages.map((message) => [message.role, message.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ]);
  });

  it('does not treat an assistant-labelled list containing separate message items as one reply', () => {
    const { result } = parseImages(
      '<div class="message user">Question</div><div class="assistant-message-list"><div class="message">First reply</div><div class="message">Second reply</div></div>'
    );
    expect(result.messages.map((message) => [message.role, message.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'First reply'],
      ['assistant', 'Second reply']
    ]);
  });

  it.each([1, 2])(
    'keeps %i independent items when a list also has the generic message class',
    (count) => {
      for (const list of [
        'message-list',
        'MessageList',
        'kimi-message-list',
        'assistant-message-list',
        'user-message-list',
        'chat-content-item-list'
      ]) {
        const { result, images, references } = parseImages(
          `<div class="message user">Question</div><div class="message ${list}"><p>LIST_CHROME</p>${Array.from({ length: count }, (_, index) => `<div class="message">REPLY_${index}${image}</div>`).join('')}</div>`
        );
        expect(result.messages).toHaveLength(count + 1);
        expect(result.messages[0]?.role).toBe('user');
        for (let index = 0; index < count; index++) {
          expect(result.messages[index + 1]?.role).toBe('assistant');
          expect(result.messages[index + 1]?.md).toContain(`REPLY_${index}`);
        }
        expect(result.messages.map((message) => message.md).join('\n')).not.toContain(
          'LIST_CHROME'
        );
        expect(new Set(images.map((candidate) => candidate.messageRoot)).size).toBe(count);
        expect(references).toHaveLength(count);
      }
    }
  );

  it('retains all sibling content fragments under one message without repeating nested fragments', () => {
    const { result } = parseImages(
      '<div class="chat-content-item chat-content-item-user"><div class="message-content"><div class="message-content">First fragment</div></div><div class="message-content">Second fragment</div></div>' +
        modernMessage('assistant', 'Answer')
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.md).toContain('First fragment');
    expect(result.messages[0]?.md).toContain('Second fragment');
    expect(result.messages[0]?.md?.match(/First fragment/g)).toHaveLength(1);
  });

  it('keeps mixed supported body fragments while excluding native tool and action contexts', () => {
    const { result, references } = parseImages(
      `<div class="chat-content-item chat-content-item-user"><div class="segment-text">First fragment</div><div class="message-content">Second fragment</div><div class="search-plus"><div class="message-content">EXCLUDED_SEARCH</div></div><div class="segment-user-actions"><span class="action-text">EXCLUDED_ACTION</span></div>${image}</div>` +
        modernMessage('assistant', 'Answer')
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.md).toContain('First fragment');
    expect(result.messages[0]?.md).toContain('Second fragment');
    expect(result.messages[0]?.md).not.toMatch(/EXCLUDED_SEARCH|EXCLUDED_ACTION/);
    expect(references).toEqual(['aiob-attachment:kimi-0']);
  });
});

describe('Kimi owner evidence and visibility', () => {
  const owners = [
    'class="chat-content-item chat-content-item-user" data-conversation-turn-id="turn"',
    'class="chat-content-item-user"',
    'class="message user" data-message-id="turn"',
    'class="message user"',
    'class="message" data-archer-id="turn"',
    'class="message"'
  ];

  it.each(owners)('keeps the whole owner (%s) independently of generic fragment count', (owner) => {
    for (const count of [0, 1, 2]) {
      const fragments = Array.from(
        { length: count },
        (_, index) => `<div class="message">FRAGMENT_${index}${image}</div>`
      ).join('');
      const { result, images, references } = parseImages(
        modernMessage('user', 'Earlier question') +
          modernMessage('assistant', 'Earlier answer') +
          `<div ${owner}><p>OUTER_BEGIN</p><div class="segment-content">BODY${fragments}</div><p>OUTER_END</p>${image}</div>` +
          modernMessage('assistant', 'Answer')
      );
      expect(result.messages).toHaveLength(4);
      expect(result.messages[2]?.role).toBe(owner.includes('user') ? 'user' : 'assistant');
      expect(result.messages[2]?.md).toMatch(/OUTER_BEGIN[\s\S]*BODY[\s\S]*OUTER_END/);
      for (let index = 0; index < count; index++)
        expect(result.messages[2]?.md?.match(new RegExp(`FRAGMENT_${index}`, 'g'))).toHaveLength(1);
      expect(images).toHaveLength(count + 1);
      expect(new Set(images.map((candidate) => candidate.messageRoot)).size).toBe(1);
      expect(references).toHaveLength(count + 1);
    }
  });

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="display: none"'])(
    'ignores %s copies and conflicting roles before resolving a message',
    (hidden) => {
      const { result, images, references } = parseImages(
        modernMessage('user', 'Earlier question') +
          modernMessage('assistant', 'Earlier answer') +
          `<div class="message user"><p>VISIBLE_QUESTION</p>${image}<div ${hidden}><div class="message">HIDDEN_FIRST${image}</div><div class="message assistant" data-message-id="hidden">HIDDEN_SECOND${image}</div></div></div>` +
          modernMessage('assistant', 'Answer')
      );
      expect(result.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant'
      ]);
      expect(result.messages[2]?.md).toContain('VISIBLE_QUESTION');
      expect(result.messages.map((message) => message.md).join('\n')).not.toContain('HIDDEN_');
      expect(images).toHaveLength(1);
      expect(references).toEqual(['aiob-attachment:kimi-0']);
    }
  );

  it('retains supported role-named message items without promoting the enclosing list', () => {
    const { result } = parseImages(
      '<div class="message-list"><div class="user-message">Question</div><div class="assistant-message">Answer</div></div>'
    );
    expect(result.messages.map((message) => [message.role, message.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ]);
  });

  it('folds a nested representation with the same identity and role into its outer owner', () => {
    const { result, images, references } = parseImages(
      `<div class="chat-content-item-user" data-message-id="same">BEGIN${image}<div class="message user" data-message-id="same">INNER${image}</div>END</div>` +
        modernMessage('assistant', 'Answer')
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.md).toMatch(/BEGIN[\s\S]*INNER[\s\S]*END/);
    expect(new Set(images.map((candidate) => candidate.messageRoot)).size).toBe(1);
    expect(references).toHaveLength(2);
  });

  it.each(['message', 'custom-message'])(
    'uses the explicit user role inside an identity-only %s owner at any turn',
    (className) => {
      for (const earlier of [
        '',
        modernMessage('user', 'Earlier question') + modernMessage('assistant', 'Earlier answer')
      ]) {
        const { result, images, references } = parseImages(
          earlier +
            `<div class="${className}" data-message-id="owner">OUTER_BEGIN<div class="message user">QUESTION${image}</div>OUTER_END</div>` +
            modernMessage('assistant', 'Answer')
        );
        expect(result.messages.map((message) => message.role)).toEqual(
          earlier ? ['user', 'assistant', 'user', 'assistant'] : ['user', 'assistant']
        );
        expect(result.messages.at(-2)?.md).toMatch(/OUTER_BEGIN[\s\S]*QUESTION[\s\S]*OUTER_END/);
        expect(images[0]?.messageRoot?.getAttribute('data-message-id')).toBe('owner');
        expect(references).toEqual(['aiob-attachment:kimi-0']);
      }
    }
  );

  it('rejects mixed explicit roles inside an identity-only owner', () => {
    const { result, images } = parseImages(
      `<div class="message" data-message-id="owner"><div class="message user">Question${image}</div><div class="message assistant">Answer</div></div>`
    );
    expect(result.messages).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      code: 'kimi_message_ownership_conflict',
      severity: 'error'
    });
    expect(images).toEqual([]);
  });

  it.each([
    'class="message assistant" data-message-id="same"',
    'class="message user" data-message-id="different"'
  ])(
    'rejects visible conflicting nested ownership (%s), including after a complete turn',
    (nested) => {
      const { result, images } = parseImages(
        modernMessage('user', 'Earlier question') +
          modernMessage('assistant', 'Earlier answer') +
          `<div class="chat-content-item-user" data-message-id="same">OUTER<div ${nested}>INNER${image}</div></div>` +
          modernMessage('assistant', 'Answer')
      );
      expect(result.messages).toEqual([]);
      expect(result.diagnostics).toContainEqual({
        code: 'kimi_message_ownership_conflict',
        severity: 'error'
      });
      expect(images).toEqual([]);
    }
  );
});

describe('kimi parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses an injected fallback title when no product title is available', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = kimiParser.parse(doc, { fallbackTitle: 'Catalog Kimi Title' });

    expect(result.title).toBe('Catalog Kimi Title');
    expect(result.messages).toHaveLength(2);
  });

  it('throws when no source title or injected fallback title is available', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    expect(() => kimiParser.parse(doc)).toThrow('Missing fallback title for kimi export');
  });

  it('preserves user-provided Chinese titles instead of replacing them', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="conversation-title">创意草稿</div>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = kimiParser.parse(doc, { fallbackTitle: 'Catalog Kimi Title' });

    expect(result.title).toBe('创意草稿');
  });
});
