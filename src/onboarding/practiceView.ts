import type { Messages } from '../i18n/messages';
import type { LearningReceipt } from '../shared/learningProgress';
import { createPracticeVideo } from './practiceVideo';
import type { PracticeLesson } from './practiceLessonTypes';
import { element, learningButton } from './learningView';

export interface PracticeStep {
  title: string;
  text: string;
  phase:
    | 'select'
    | 'capture'
    | 'reading'
    | 'ready'
    | 'navigate'
    | 'video'
    | 'saving'
    | 'saved'
    | 'error';
  index?: number;
  disabled?: boolean;
  receipt?: LearningReceipt;
  shortcut?: string;
}

export function createPracticeView(
  root: HTMLElement,
  messages: Messages,
  actions: {
    enable: () => void;
    exit: () => void;
    next: () => void;
    locate: () => void;
  },
  lesson: PracticeLesson = 'fragment'
) {
  const reading = element('section', 'practice-reading');
  const brand = element('header', 'practice-brand');
  const symbol = element('img', 'practice-brand-symbol');
  symbol.src = '../icons/bannerlogo-48.png';
  symbol.alt = '';
  symbol.setAttribute('aria-hidden', 'true');
  brand.append(symbol, element('span', '', 'Zendio'));
  const article = element('article', 'practice-article');
  article.id = 'practiceArticle';
  const first = element('p', 'practice-passage', messages.practiceFirst);
  first.id = 'practiceFirst';
  const second = element('p', 'practice-passage', messages.practiceSecond);
  second.id = 'practiceSecond';
  const readerLesson = lesson === 'reader';
  const media = lesson === 'video' ? createPracticeVideo(messages) : undefined;
  const middle = element('section', 'practice-reading-middle');
  if (lesson !== 'video')
    messages.practiceReadingBody
      .split('\n\n')
      .forEach((text) => middle.append(element('p', '', text)));
  article.append(
    element(
      'p',
      'practice-article-eyebrow',
      lesson === 'video'
        ? messages.practiceStart
        : readerLesson
          ? messages.learningReaderTitle
          : messages.learningFragmentTitle
    ),
    element(
      'h1',
      '',
      lesson === 'video' ? messages.learningVideoTitle : messages.practiceArticleTitle
    ),
    ...(media ? [media.container] : [first, middle, second])
  );
  reading.append(brand, article);

  const lessonPane = element('aside', 'practice-lesson');
  const navigation = element('header', 'practice-navigation');
  const exit = learningButton(messages.practiceExit, actions.exit);
  navigation.append(
    element(
      'span',
      '',
      lesson === 'video'
        ? messages.learningVideoTitle
        : readerLesson
          ? messages.learningReaderTitle
          : messages.learningFirstSave
    ),
    exit
  );
  const content = element('div', 'practice-lesson-content');
  const progress = element('div', 'practice-stepper');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', messages.practiceTitle);
  progress.setAttribute('aria-valuemin', '0');
  let readingStarted = readerLesson;
  middle.hidden = !readingStarted;
  let total = lesson === 'video' ? 6 : readerLesson ? 5 : 3;
  progress.setAttribute('aria-valuemax', String(total));
  const tracks = Array.from({ length: total }, () => element('span', 'practice-step-track'));
  progress.append(...tracks);
  const counter = element('p', 'practice-step-count');
  const status = element('section', 'practice-status');
  status.id = 'practiceStatus';
  status.setAttribute('aria-live', 'polite');
  const badge = element('span', 'practice-success-mark', '✓');
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;
  const stage = element('h2', '');
  const instruction = element('p', 'practice-instruction');
  const enable = learningButton(
    lesson === 'video' ? messages.practiceStart : messages.practiceEnable,
    actions.enable,
    true
  );
  enable.id = lesson === 'video' ? 'practiceStartVideo' : 'practiceEnable';
  enable.hidden = true;
  status.append(badge, stage, instruction, enable);
  const result = element('section', 'practice-result');
  result.id = 'practiceResult';
  result.hidden = true;
  const resultLabel = element('p', 'practice-result-label');
  const resultPath = element('p', 'learning-path');
  resultPath.id = 'practiceSavedPath';
  const locate = learningButton(messages.learningShowResult, actions.locate);
  const next = learningButton(messages.practiceNext, actions.next, true);
  next.id = 'practiceNext';
  const resultActions = element('div', 'practice-result-actions');
  resultActions.append(locate, next);
  result.append(resultLabel, resultPath, resultActions);
  const error = element('p', 'learning-error');
  error.id = 'practiceError';
  error.setAttribute('role', 'alert');
  content.append(progress, counter, status, result, error);
  lessonPane.append(navigation, content);
  root.append(reading, lessonPane);
  let lastInstruction = '';
  const setText = (node: HTMLElement, value: string) => {
    if (node.textContent !== value) node.textContent = value;
  };
  const setHidden = (node: HTMLElement, value: boolean) => {
    if (node.hidden !== value) node.hidden = value;
  };
  return {
    setOverlayActive: (active: boolean) => {
      setHidden(exit, active);
      root.classList.toggle('practice-video-active', active && Boolean(media));
    },
    first,
    second,
    error,
    enable,
    readerLesson,
    lesson,
    video: media?.video,
    status,
    update(step: PracticeStep) {
      const { title, text, disabled = false, receipt, phase, shortcut } = step;
      const completed = phase === 'saved';
      if (phase === 'reading' || phase === 'navigate') readingStarted = true;
      setHidden(middle, !readingStarted);
      if (readingStarted && total === 3) {
        total = 5;
        progress.setAttribute('aria-valuemax', String(total));
        while (tracks.length < total) {
          const track = element('span', 'practice-step-track');
          tracks.push(track);
          progress.append(track);
        }
      }
      const index = completed
        ? total - 1
        : (step.index ??
          (phase === 'select' ? 0 : ['capture', 'reading'].includes(phase) ? 1 : total - 1));
      if (root.dataset.practicePhase !== phase) root.dataset.practicePhase = phase;
      if (progress.getAttribute('aria-valuenow') !== String(completed ? total : index))
        progress.setAttribute('aria-valuenow', String(completed ? total : index));
      tracks.forEach((track, i) => {
        const state = i < index || completed ? 'complete' : i === index ? 'current' : 'pending';
        if (track.dataset.state !== state) track.dataset.state = state;
      });
      setText(counter, String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'));
      setText(stage, title);
      const signature = text + '\0' + (shortcut ?? '');
      if (lastInstruction !== signature) {
        lastInstruction = signature;
        const start = shortcut ? text.indexOf(shortcut) : -1;
        if (start >= 0 && shortcut) {
          instruction.replaceChildren(
            document.createTextNode(text.slice(0, start)),
            element('kbd', 'practice-key', shortcut),
            document.createTextNode(text.slice(start + shortcut.length))
          );
        } else setText(instruction, text);
      }
      setHidden(enable, !disabled);
      setHidden(badge, !completed);
      setHidden(result, !receipt);
      first.classList.toggle('is-current', phase === 'select');
      second.classList.toggle('is-current', phase === 'reading');
      if (receipt) {
        setText(
          resultLabel,
          receipt.destination === 'downloads'
            ? messages.learningDownloadSaved
            : messages.learningVaultSaved
        );
        setText(resultPath, [receipt.vaultName, receipt.filePath].filter(Boolean).join(' / '));
        setText(
          next,
          receipt.course === 'reader' ? messages.learningVideoTitle : messages.practiceNext
        );
        setHidden(next, lesson === 'video');
      }
    }
  };
}
