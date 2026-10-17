import { z } from 'zod';
import { withRequestDeadline } from '../../shared/utils/requestDeadline';

/** Read-only status/authentication probe; this does not establish write permission. */
export function testConnection(url: string, apiKey: string, signal?: AbortSignal) {
  return withRequestDeadline(10_000, signal ? { signal } : {}, async (request) => {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: request.signal
    });
    request.check();
    const text = await response.text();
    request.check();
    if (response.ok) validateServiceStatus(text);
    return { response, text };
  });
}

// Stable in official 2.0.0, 3.2.0 and current status responses; newer fields are optional.
const serviceStatusSchema = z.object({
  status: z.literal('OK'),
  service: z.literal('Obsidian Local REST API'),
  authenticated: z.boolean()
});

function validateServiceStatus(text: string): void {
  let payload: z.infer<typeof serviceStatusSchema>;
  try {
    payload = serviceStatusSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('HTTP response is not Obsidian Local REST API status JSON');
  }
  if (!payload.authenticated) {
    throw new Error('HTTP Obsidian Local REST API authentication failed (API Key)');
  }
}
