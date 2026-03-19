import { generateYamlFrontMatter } from '../../shared/utils/yamlGenerator';

type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
};

/**
 * Format date to local timezone in format: YYYY-MM-DDTHH:mm:ss
 */
function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function buildChatMarkdown({
  platform,
  url,
  messages,
  model,
  createdAt,
  options
}: {
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
  let domain: string | undefined;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = undefined;
  }

  const frontMatter = generateYamlFrontMatter(
    'ai_chat',
    {
      type: 'ai_chat',
      platform,
      model,
      url,
      message_count: messages.length,
      ...(createdAtFormatted !== undefined && { created_at: createdAtFormatted }),
      clipped_at: clippedAtFormatted,
      tags: ['ai', 'chat', platform],
      ...(domain !== undefined && { domain })
    },
    {
      ...(domain !== undefined && { domain })
    }
  );

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

  return `${frontMatter}\n\n${body}\n`;
}
