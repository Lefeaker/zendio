import type { Language } from '../../i18n/locales';
import type { TextBudget } from './budgets';

export interface AdaptiveTextResult {
  value: string;
  usedShort: boolean;
  original?: string;
  budget?: TextBudget;
  overLimit?: boolean;
  language: Language;
  length: number;
  limit?: number;
}
