import { resolveRepository } from '../di/serviceRegistry';
import { DI_TOKENS } from '../di/tokens';
import type { IMessagingRepository } from '../repositories';
import { TRACK_USAGE_EVENT, type TrackUsageEventPayload } from '../types/analytics';
import type { AdaptiveTextResult } from './textAdaptation';

const loggedOverflowTokens = new WeakMap<HTMLElement, Set<string>>();

function registerToken(element: HTMLElement, token: string): boolean {
  let tokens = loggedOverflowTokens.get(element);
  if (!tokens) {
    tokens = new Set();
    loggedOverflowTokens.set(element, tokens);
  }
  if (tokens.has(token)) {
    return false;
  }
  tokens.add(token);
  return true;
}

export function logTextOverflowEvent(element: HTMLElement, result: AdaptiveTextResult): void {
  if (typeof window === 'undefined') {
    return;
  }

  const key =
    element.dataset.budgetKey ?? element.getAttribute('data-i18n') ?? element.getAttribute('data-i18n-html');
  if (!key) {
    return;
  }

  const token = `${result.language}|${key}`;
  if (!registerToken(element, token)) {
    return;
  }

  let messaging: IMessagingRepository | undefined;
  try {
    messaging = resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  } catch {
    return;
  }

  if (!messaging || typeof messaging.send !== 'function') {
    return;
  }

  const paramsEntries = Object.entries({
    key,
    language: result.language,
    component: element.dataset.component ?? result.budget?.component,
    priority: element.dataset.priority ?? result.budget?.priority,
    length: result.length,
    limit: result.limit,
    used_short: result.usedShort,
    page: window.location?.pathname ?? ''
  }).filter(([, value]) => value !== undefined && value !== null);

  const params = Object.fromEntries(paramsEntries) as Record<string, string | number | boolean>;

  const payload: TrackUsageEventPayload = {
    type: TRACK_USAGE_EVENT,
    event: 'i18n_text_overflow',
    params
  };

  void messaging.send(payload).catch(() => {
    // 忽略打点失败，避免影响主流程
  });
}
