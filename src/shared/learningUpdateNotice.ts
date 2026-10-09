/** One campaign shared by all capture panels, independent of user options and lesson progress. */
export const LEARNING_UPDATE_AVAILABLE_KEY = 'learningUpdate.0.3.3.available';
export const LEARNING_UPDATE_DISMISSED_KEY = 'learningUpdate.0.3.3.dismissed';

export function crossesLearningUpdate(previous: string | undefined, current: string | undefined) {
  const compare = (version: string | undefined): number | null => {
    if (!version || !/^\d+(\.\d+){2,3}$/.test(version)) return null;
    const parts = version.split('.').map(Number);
    const target = [0, 3, 3, 0];
    for (let index = 0; index < target.length; index++) {
      const difference = (parts[index] ?? 0) - (target[index] ?? 0);
      if (difference) return difference;
    }
    return 0;
  };
  const before = compare(previous);
  const after = compare(current);
  return before !== null && after !== null && before < 0 && after >= 0;
}
