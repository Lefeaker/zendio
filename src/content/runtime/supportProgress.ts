import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';

export type SupportProgressVariant = 'progress' | 'success' | 'failure' | 'warning';

export interface SupportProgressUpdate {
  value: number;
  label?: string;
  message?: UserVisibleMessageDescriptor;
  variant?: SupportProgressVariant;
}

export type SupportProgressReporter = (progress: SupportProgressUpdate) => void;
