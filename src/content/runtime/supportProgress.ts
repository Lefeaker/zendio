export type SupportProgressVariant = 'progress' | 'success' | 'failure' | 'warning';

export interface SupportProgressUpdate {
  value: number;
  label: string;
  variant?: SupportProgressVariant;
}

export type SupportProgressReporter = (progress: SupportProgressUpdate) => void;
