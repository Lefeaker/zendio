import { completedLearningCount, learningCourseStatus } from './progress';
import type { Messages } from '../i18n/messages';
import { createPrimitiveButtonElement } from '../ui/primitives/button';
import {
  LEARNING_COURSES,
  type LearningCourse,
  type LearningProgress,
  type LearningReceipt
} from '../shared/learningProgress';

export type LearningTranslate = (key: keyof Messages) => string;
export const COURSE_COPY: Record<LearningCourse, [keyof Messages, keyof Messages]> = {
  fragment: ['learningFragmentTitle', 'learningFragmentSteps'],
  article: ['learningArticleTitle', 'learningArticleSteps'],
  reader: ['learningReaderTitle', 'learningReaderSteps'],
  video: ['learningVideoTitle', 'learningVideoSteps'],
  chat: ['learningChatTitle', 'learningChatSteps'],
  vault: ['learningVaultTitle', 'learningVaultSteps']
};

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function learningButton(
  label: string,
  action: () => void,
  primary = false
): HTMLButtonElement {
  return createPrimitiveButtonElement({
    label,
    onClick: action,
    classSlots: ['btn', primary ? 'primary' : 'secondary']
  });
}

export function createLearningView(
  root: HTMLElement,
  tr: LearningTranslate,
  actions: {
    select: (course: LearningCourse) => void;
    startPractice: () => void;
    openPage: () => void;
    showResult: () => void;
    configure: () => void;
    later: () => void;
    refreshTabs: () => void;
  }
) {
  const intro = element('header', 'learning-intro');
  intro.append(
    element('p', 'learning-eyebrow', 'Zendio'),
    element('h1', '', tr('learningTitle')),
    element('p', 'learning-description', tr('learningSubtitle'))
  );
  const progress = element('p', 'learning-count');
  progress.setAttribute('role', 'status');
  const grid = element('div', 'learning-grid');
  grid.hidden = true;
  const views = element('nav', 'learning-actions');
  let initializedNavigation = false;
  const setLibrary = (visible: boolean) => {
    grid.hidden = !visible;
    for (const [button, active] of [
      [first, !visible],
      [library, visible]
    ] as const) {
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('primary', active);
      button.classList.toggle('secondary', !active);
    }
  };
  const first = learningButton(tr('learningFirstSave'), () => {
    setLibrary(false);
    actions.select('fragment');
  });
  const library = learningButton(tr('learningLibrary'), () => setLibrary(true));
  library.id = 'learningLibraryButton';
  setLibrary(false);
  views.append(first, library);
  const cards = new Map<LearningCourse, { button: HTMLButtonElement; status: HTMLElement }>();
  for (const course of LEARNING_COURSES) {
    const button = learningButton(tr(COURSE_COPY[course][0]), () => actions.select(course));
    button.classList.add('learning-course');
    button.dataset.learningCourse = course;
    const status = element('span', 'learning-course-status', tr('learningNotStarted'));
    button.append(status);
    grid.append(button);
    cards.set(course, { button, status });
  }
  const lesson = element('section', 'learning-lesson');
  lesson.id = 'learningLesson';
  const title = element('h2', '');
  title.id = 'learningLessonTitle';
  lesson.setAttribute('aria-labelledby', title.id);
  const steps = element('ol', 'learning-instructions');
  const start = learningButton(tr('practiceStart'), actions.startPractice, true);
  start.id = 'learningStartPractice';
  const custom = element('details', 'learning-custom-page');
  custom.append(element('summary', '', tr('learningChoosePage')));
  const pageLabel = element('label', '', tr('learningChoosePage'));
  pageLabel.htmlFor = 'learningPage';
  const pages = element('select', 'learning-select');
  pages.id = 'learningPage';
  const urlLabel = element('label', '', tr('learningUrl'));
  urlLabel.htmlFor = 'learningUrl';
  const url = element('input', 'learning-input');
  url.id = 'learningUrl';
  url.type = 'url';
  url.placeholder = 'https://';
  const open = learningButton(tr('learningOpenPage'), actions.openPage, true);
  open.id = 'learningOpenPage';
  const configure = learningButton(tr('learningConfigure'), actions.configure);
  configure.id = 'learningConfigure';
  const pageActions = element('div', 'learning-actions');
  pageActions.append(
    open,
    learningButton(tr('learningRefreshPages'), actions.refreshTabs),
    configure
  );
  const error = element('p', 'learning-error');
  error.setAttribute('role', 'alert');
  const hint = element('p', 'learning-description', tr('learningContinueHint'));
  const later = learningButton(tr('learningLater'), actions.later);
  custom.append(pageLabel, pages, urlLabel, url, pageActions);
  lesson.append(title, start, steps, custom, error, hint, later);
  const result = element('section', 'learning-result');
  result.id = 'learningResult';
  result.setAttribute('aria-live', 'polite');
  const resultTitle = element('h2', '');
  const path = element('p', 'learning-path');
  const resultHint = element('p', 'learning-description');
  const show = learningButton(tr('learningShowResult'), actions.showResult, true);
  show.id = 'learningShowResult';
  result.append(resultTitle, path, resultHint, show);
  const advanced = element('details', 'learning-advanced');
  advanced.append(element('summary', '', tr('learningAdvanced')));
  const advancedList = element('ul', 'learning-instructions');
  for (const key of [
    'step4Detail1',
    'step4Detail2',
    'step4Detail3',
    'step4Detail4',
    'step3Section2Detail7'
  ] as const) {
    advancedList.append(element('li', '', tr(key)));
  }
  advanced.append(
    element('p', 'learning-description', tr('learningAdvancedHint')),
    advancedList,
    learningButton(tr('learningConfigure'), actions.configure)
  );
  root.append(intro, views, progress, result, grid, lesson, advanced);
  let renderedCourse: LearningCourse | undefined;
  return {
    pages,
    url,
    open,
    error,
    show,
    update(
      course: LearningCourse,
      state: LearningProgress,
      deferred: LearningCourse[],
      receipt?: LearningReceipt
    ) {
      if (!initializedNavigation) {
        setLibrary(course !== 'fragment');
        initializedNavigation = true;
      }
      const count = completedLearningCount(state);
      progress.textContent = tr('learningCount').replace('{count}', String(count));
      title.textContent = tr(COURSE_COPY[course][0]);
      steps.replaceChildren(
        ...tr(COURSE_COPY[course][1])
          .split('\n')
          .map((text) => element('li', '', text))
      );
      for (const [id, card] of cards) {
        card.button.setAttribute('aria-pressed', String(id === course));
        card.status.textContent = tr(learningCourseStatus(id, course, state, deferred));
      }
      configure.hidden = course !== 'vault';
      start.hidden = !['fragment', 'reader', 'video'].includes(course);
      if (renderedCourse !== course) custom.open = start.hidden;
      renderedCourse = course;
      steps.hidden = !start.hidden;
      hint.hidden = !start.hidden;
      const pending = state.pending[state.pending.length - 1];
      if (pending && (!receipt || pending.receipt.savedAt > receipt.savedAt)) receipt = undefined;
      result.hidden = !receipt && !pending;
      resultTitle.textContent = receipt
        ? tr(receipt.destination === 'downloads' ? 'learningDownloadSaved' : 'learningVaultSaved')
        : tr(pending?.failed ? 'learningDownloadFailed' : 'learningDownloadPending');
      path.textContent = receipt
        ? [receipt.vaultName, receipt.filePath].filter(Boolean).join(' / ')
        : (pending?.receipt.filePath ?? '');
      resultHint.textContent = receipt ? tr('learningResultHint') : tr('learningPendingHint');
      show.hidden = !receipt;
    }
  };
}
