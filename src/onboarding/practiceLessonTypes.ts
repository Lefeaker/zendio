import type { PracticeStep } from './practiceView';
import type { PracticeHint } from './practiceCoachView';
export type PracticeLesson = 'fragment' | 'reader' | 'video';
export interface PracticeGuidance {
  step: PracticeStep;
  hint?: PracticeHint;
  milestones: string[];
}
