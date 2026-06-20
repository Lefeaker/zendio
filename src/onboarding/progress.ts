type BrowserStorageLike = Partial<Pick<Storage, 'getItem' | 'setItem'>> & Record<string, unknown>;

const TOTAL_ONBOARDING_STEPS = 5;

function getBrowserLocalStorage(): BrowserStorageLike | null {
  const storage = globalThis.localStorage as BrowserStorageLike | undefined;
  return storage ?? null;
}

function getCompletedSteps(): number[] {
  try {
    const storage = getBrowserLocalStorage();
    const stored =
      typeof storage?.getItem === 'function' ? storage.getItem('onboardingCompletedSteps') : null;
    if (!stored) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => Number(value))
        .filter((value): value is number => Number.isFinite(value));
    }
    return [];
  } catch {
    return [];
  }
}

export function markStepCompleted(stepNumber: number): void {
  const step = document.getElementById(`step${stepNumber}`);
  step?.classList.add('step-completed');

  const completedSteps = getCompletedSteps();
  if (!completedSteps.includes(stepNumber)) {
    completedSteps.push(stepNumber);
    const storage = getBrowserLocalStorage();
    if (typeof storage?.setItem === 'function') {
      storage.setItem('onboardingCompletedSteps', JSON.stringify(completedSteps));
    }
  }
}

export function restoreCompletedSteps(): void {
  for (const stepNumber of getCompletedSteps()) {
    document.getElementById(`step${stepNumber}`)?.classList.add('step-completed');
  }
}

export function updateProgress(): void {
  const completedSteps = getCompletedSteps();
  const progress = (completedSteps.length / TOTAL_ONBOARDING_STEPS) * 100;
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (completedSteps.length === TOTAL_ONBOARDING_STEPS) {
    document.getElementById('skipOnboardingBtn')?.classList.add('hidden');
    document.getElementById('completeOnboardingBtn')?.classList.remove('hidden');
  }
}
