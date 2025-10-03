type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
};

/**
 * Format date to local timezone in format: YYYY-MM-DD HH:mm:ss
 */
function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function buildChatMarkdown({
  title,
  platform,
  url,
  messages,
  model,
  createdAt,
  options
}: {
  title: string;
  platform: string;
  url: string;
  messages: Msg[];
  model?: string;
  createdAt?: string;
  options?: {
    includeTimestamps?: boolean;
    userName?: string;
  };
}) {
  const includeTimestamps = options?.includeTimestamps ?? false;
  const userName = options?.userName || 'USER';

  // Format timestamps to local timezone
  const clippedAtFormatted = formatLocalDateTime(new Date());
  const createdAtFormatted = createdAt ? formatLocalDateTime(new Date(createdAt)) : null;

  const fm = [
    '---',
    'type: ai_chat',
    `platform: ${platform}`,
    model ? `model: ${model}` : null,
    `url: "${url}"`,
    `message_count: ${messages.length}`,
    createdAtFormatted ? `created_at: "${createdAtFormatted}"` : null,
    `clipped_at: "${clippedAtFormatted}"`,
    'tags: [ai, chat, ' + platform + ']',
    '---',
    ''
  ].filter(line => line !== null).join('\n');

  const body = messages.map((m, i) => {
    // Use h1 for USER/ASSISTANT headings
    // Put number first to avoid confusion with model names ending in numbers (e.g., GPT-5)
    let heading = '';
    if (m.role === 'user') {
      heading = `# ${i+1} ${userName}`;
    } else {
      const modelName = model || 'ASSISTANT';
      heading = `# ${i+1} ${modelName}`;
    }

    // Add timestamp if available and enabled
    if (includeTimestamps && m.timestamp) {
      const date = new Date(m.timestamp);
      const timeStr = formatLocalDateTime(date);
      heading += ` _[${timeStr}]_`;
    }

    const content = m.role === 'user'
      ? m.text.split('\n').map(l => `> ${l}`).join('\n')
      : m.text;
    return `${heading}\n\n${content}\n`;
  }).join('\n');

  return `${fm}\n${body}\n`;
}