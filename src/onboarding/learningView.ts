import { completedLearningCount, learningCourseStatus } from './progress';
import type { Messages } from '../i18n/messages';
import { createPrimitiveButtonElement } from '../ui/primitives/button';
import {
  LEARNING_COURSES,
  type LearningCourse,
  type LearningProgress,
  type LearningReceipt
} from '../shared/learningProgress';
import type { SettingsGuideStep } from '../shared/settingsGuide';

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
    copyPath: () => void;
    configure: (step: SettingsGuideStep) => void;
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
  const library = element('details', 'learning-library');
  const librarySummary = element('summary', '', tr('learningLibrary'));
  librarySummary.id = 'learningLibraryButton';
  library.append(librarySummary, progress, grid);
  let initializedNavigation = false;
  const cards = new Map<LearningCourse, { button: HTMLButtonElement; status: HTMLElement }>();
  for (const course of LEARNING_COURSES) {
    const button = learningButton(tr(COURSE_COPY[course][0]), () => {
      library.open = false;
      actions.select(course);
    });
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
  custom.append(element('summary', '', tr('learningOwnPage')));
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
  const configure = learningButton(tr('settingsConnectVault'), () => actions.configure('vault'));
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
  const later = learningButton(tr('learningLater'), () => {
    library.open = true;
    actions.later();
  });
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
  const copy = learningButton(tr('learningCopyPath'), actions.copyPath);
  copy.id = 'learningCopyPath';
  const resultFeedback = element('p', 'learning-description');
  resultFeedback.setAttribute('role', 'status');
  const resultActions = element('div', 'learning-actions');
  resultActions.append(show, copy);
  result.append(resultTitle, path, resultHint, resultActions, resultFeedback);
  const advanced = element('section', 'learning-advanced');
  const configureActions = element('div', 'learning-actions');
  for (const [label, step] of [
    ['settingsConnectVault', 'vault'],
    ['settingsTourTitle', 'overview'],
    ['aiConfigTitle', 'ai']
  ] as const) {
    configureActions.append(learningButton(tr(label), () => actions.configure(step)));
  }
  advanced.append(
    element('h2', '', tr('learningAdvanced')),
    element('p', 'learning-description', tr('learningAdvancedHint')),
    configureActions
  );
  root.append(intro, lesson, result, library, advanced);
  let renderedCourse: LearningCourse | undefined;
  return {
    pages,
    url,
    open,
    error,
    show,
    resultFeedback,
    update(
      course: LearningCourse,
      state: LearningProgress,
      deferred: LearningCourse[],
      receipt?: LearningReceipt
    ) {
      if (!initializedNavigation) {
        library.open = course !== 'fragment';
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
      later.hidden = course === 'fragment';
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
      copy.hidden = !receipt;
      if (receipt)
        show.textContent = tr(
          receipt.destination === 'downloads' ? 'learningRevealDownload' : 'learningOpenObsidian'
        );
    }
  };
}
