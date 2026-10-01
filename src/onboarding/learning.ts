import { DEFAULT_RUNTIME_MESSAGES } from '../i18n';
import type { Messages } from '../i18n/messages';
import type { OnboardingControllerDependencies } from './dependencies';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';
import type { DownloadsService } from '../platform/interfaces/downloads';
import {
  LEARNING_COURSES,
  LEARNING_PROGRESS_KEY,
  emptyLearningProgress,
  isLearningPageUrl,
  LearningProgressSchema,
  type LearningCourse,
  type LearningReceipt
} from '../shared/learningProgress';
import { createLearningView, element } from './learningView';
import { copyLearningPath, revealLearningResult } from './learningResult';
import { settingsGuidePath, type SettingsGuideStep } from '../shared/settingsGuide';

const PREFERENCE_KEY = 'learningPreference.v1';
interface Preference {
  course: LearningCourse;
  url: string;
  deferred: LearningCourse[];
}
function readPreference(raw: unknown): Preference {
  const value = raw as Partial<Preference> | null;
  return {
    course:
      value && LEARNING_COURSES.includes(value.course as LearningCourse)
        ? (value.course as LearningCourse)
        : 'fragment',
    url: typeof value?.url === 'string' && isLearningPageUrl(value.url) ? value.url : '',
    deferred: Array.isArray(value?.deferred)
      ? value.deferred.filter((id) => LEARNING_COURSES.includes(id))
      : []
  };
}

export async function mountLearningCenter(
  root: HTMLElement,
  deps: OnboardingControllerDependencies,
  navigation: INavigationRepository,
  messages: Partial<Messages>,
  downloads?: DownloadsService
): Promise<() => void> {
  const tr = (key: keyof Messages): string =>
    String(messages[key] ?? DEFAULT_RUNTIME_MESSAGES[key]);
  let preference = readPreference(null);
  let preferenceReadFailed = false;
  try {
    preference = readPreference(await deps.storage.local.get(PREFERENCE_KEY));
  } catch {
    preferenceReadFailed = true;
  }
  let state = emptyLearningProgress();
  let receipt: LearningReceipt | undefined;
  let disposed = false;
  let refreshGeneration = 0;
  let preferenceWrites = Promise.resolve();
  const persistPreference = () => {
    const snapshot = { ...preference, deferred: [...preference.deferred], url: view.url.value };
    preferenceWrites = preferenceWrites
      .catch(() => undefined)
      .then(() => deps.storage.local.set(PREFERENCE_KEY, snapshot))
      .catch(() => {
        if (!disposed) view.error.textContent = tr('learningProgressError');
      });
    return preferenceWrites;
  };
  const configure = (step: SettingsGuideStep) => {
    const url = deps.runtime?.getURL(settingsGuidePath(step));
    void (url ? deps.tabs.create({ url, active: true }) : navigation.openOptions()).catch(() => {
      view.error.textContent = tr('learningActionError');
    });
  };
  const view = createLearningView(root, tr, {
    select(course) {
      preference.course = course;
      preference.deferred = preference.deferred.filter((id) => id !== course);
      view.error.textContent = '';
      update();
      void persistPreference();
      root.querySelector('#learningLesson')?.scrollIntoView?.({ block: 'nearest' });
    },
    startPractice() {
      const url = deps.runtime?.getURL('onboarding/practice.html');
      if (!url) return;
      void deps.tabs
        .create({
          url: url + '?lesson=' + preference.course + '&run=' + crypto.randomUUID(),
          active: true
        })
        .catch(() => {
          view.error.textContent = tr('learningActionError');
        });
    },
    openPage() {
      void openPage();
    },
    showResult() {
      void showResult();
    },
    copyPath() {
      if (!receipt) return;
      void copyLearningPath(receipt)
        .then(() => {
          view.resultFeedback.textContent = tr('learningPathCopied');
        })
        .catch(() => {
          view.resultFeedback.textContent = tr('learningRevealFailed');
        });
    },
    configure,
    later() {
      if (!preference.deferred.includes(preference.course))
        preference.deferred.push(preference.course);
      update();
      void persistPreference();
      root.querySelector('.learning-grid')?.scrollIntoView?.({ block: 'nearest' });
    },
    refreshTabs() {
      void refreshTabs();
    }
  });
  const update = () => {
    receipt = state.latest ?? state.completed[preference.course];
    view.update(preference.course, state, preference.deferred, receipt);
  };
  async function refreshProgress(): Promise<void> {
    const generation = ++refreshGeneration;
    try {
      const raw = await deps.storage.local.get(LEARNING_PROGRESS_KEY);
      if (disposed || generation !== refreshGeneration) return;
      state = LearningProgressSchema.parse(raw ?? emptyLearningProgress());
      update();
    } catch {
      if (!disposed && generation === refreshGeneration)
        view.error.textContent = tr('learningProgressError');
    }
  }
  async function refreshTabs(): Promise<void> {
    try {
      const tabs = await deps.tabs.query({});
      if (disposed) return;
      const placeholder = element('option', '', tr('learningChoosePage'));
      placeholder.value = '';
      const options = tabs
        .filter((tab) => tab.url && isLearningPageUrl(tab.url))
        .map((tab) => {
          const option = element('option', '', tab.title || tab.url);
          option.value = tab.url ?? '';
          return option;
        });
      view.pages.replaceChildren(placeholder, ...options);
    } catch {
      if (!disposed) view.error.textContent = tr('learningActionError');
    }
  }
  async function openPage(): Promise<void> {
    const url = view.url.value.trim();
    if (!isLearningPageUrl(url)) {
      view.error.textContent = tr('learningInvalidUrl');
      view.url.focus();
      return;
    }
    view.error.textContent = '';
    view.open.disabled = true;
    view.open.setAttribute('aria-busy', 'true');
    try {
      preference.url = url;
      await persistPreference();
      await deps.tabs.create({ url, active: true });
    } catch {
      view.error.textContent = tr('learningActionError');
    } finally {
      view.open.disabled = false;
      view.open.setAttribute('aria-busy', 'false');
    }
  }
  async function showResult(): Promise<void> {
    if (!receipt) return;
    try {
      await revealLearningResult(receipt, navigation, downloads);
      view.resultFeedback.textContent = tr('learningRevealRequested');
    } catch {
      view.resultFeedback.textContent = tr('learningRevealFailed');
    }
  }
  view.pages.addEventListener('change', () => {
    view.url.value = view.pages.value;
    void persistPreference();
  });
  view.url.addEventListener('change', () => {
    void persistPreference();
  });
  const stopWatch = deps.storage.local.watchKey(LEARNING_PROGRESS_KEY, () => {
    void refreshProgress();
  });
  const onFocus = () => {
    void refreshProgress();
  };
  window.addEventListener('focus', onFocus);
  view.url.value = preference.url;
  if (preferenceReadFailed) view.error.textContent = tr('learningProgressError');
  await Promise.all([refreshProgress(), refreshTabs()]);
  return () => {
    disposed = true;
    stopWatch();
    window.removeEventListener('focus', onFocus);
  };
}
