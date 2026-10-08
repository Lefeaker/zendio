import type { Messages } from '../i18n/messages';
import {
  LEARNING_COURSES,
  type LearningCourse,
  type LearningProgress
} from '../shared/learningProgress';

export const PRACTICE_COURSES = LEARNING_COURSES.filter((course) => course !== 'chat');

export function completedLearningCount(state: LearningProgress): number {
  return PRACTICE_COURSES.filter((id) => state.completed[id]).length;
}

export function learningCourseStatus(
  id: LearningCourse,
  selected: LearningCourse,
  state: LearningProgress,
  deferred: LearningCourse[]
): keyof Messages {
  if (state.completed[id]) return 'learningDone';
  if (deferred.includes(id)) return 'learningDeferred';
  return id === selected ? 'learningInProgress' : 'learningNotStarted';
}
