import { defaultOptionsState, type OptionsState } from '../state/types';
import { DEFAULT_USAGE_STATS, normalizeUsageStats } from '../../shared/constants';
import type { UsageStats } from '../../shared/types/usage';

interface ShellWindow extends Window {
  aiobUsageStats?: UsageStats & { total?: number };
}

export function buildInitialShellState(language: string, usage: UsageStats): OptionsState {
  return {
    ...defaultOptionsState,
    language,
    usage,
    isInitialized: false
  };
}

export function getInitialShellUsageStats(): UsageStats {
  const globalUsage = (window as ShellWindow).aiobUsageStats;
  if (globalUsage) {
    return normalizeUsageStats(globalUsage);
  }
  return { ...DEFAULT_USAGE_STATS };
}

export function resolveInitialShellSection(): string {
  if (typeof window === 'undefined') {
    return 'usage';
  }
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('section-')) {
    const sectionId = hash.slice('section-'.length);
    return sectionId.trim() || 'usage';
  }
  return 'usage';
}
