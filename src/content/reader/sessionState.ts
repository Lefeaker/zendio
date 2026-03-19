import type { ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderSessionMessages } from './sessionMessages';
import { DEFAULT_SESSION_MESSAGES } from './sessionMessages';
import type { ReaderHighlightTheme, ReadingSessionOptions } from '../../shared/types/options';
import { DEFAULT_READING_CONFIG } from './sessionTypes';

const AVAILABLE_HIGHLIGHT_THEMES: ReadonlyArray<ReaderHighlightTheme> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

export class ReaderSessionState {
  highlights: ReaderHighlightRecord[] = [];
  exporting = false;
  handlingSelection = false;
  readingConfig: ReadingSessionOptions = { ...DEFAULT_READING_CONFIG };
  messages: ReaderSessionMessages = DEFAULT_SESSION_MESSAGES;
  highlightFocusTimeout: number | null = null;
  stopReadingConfigWatcher: (() => void) | null = null;
}

export function createReaderHighlightId(): string {
  return `aiob-reader-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function resolveHighlightTheme(theme: unknown): ReaderHighlightTheme {
  return AVAILABLE_HIGHLIGHT_THEMES.includes(theme as ReaderHighlightTheme)
    ? (theme as ReaderHighlightTheme)
    : DEFAULT_READING_CONFIG.highlightTheme;
}

export function resolveReadingConfig(
  raw?: Partial<ReadingSessionOptions> | null
): ReadingSessionOptions {
  if (!raw) {
    return { ...DEFAULT_READING_CONFIG };
  }

  return {
    exportMode: raw.exportMode === 'full' ? 'full' : DEFAULT_READING_CONFIG.exportMode,
    highlightTheme: resolveHighlightTheme(raw.highlightTheme)
  };
}
