import type { Messages } from '../i18n/messages';
import type { LearningReceipt } from '../shared/learningProgress';
import { element, learningButton } from './learningView';

export interface PracticeStep {
  title: string;
  text: string;
  phase: 'select' | 'capture' | 'reading' | 'ready' | 'saving' | 'saved' | 'error';
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
  readerLesson = false
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
  article.append(
    element('p', 'practice-article-eyebrow', messages.learningFragmentTitle),
    element('h1', '', messages.practiceArticleTitle),
    first,
    second
  );
  reading.append(brand, article);

  const lesson = element('aside', 'practice-lesson');
  const navigation = element('header', 'practice-navigation');
  navigation.append(
    element('span', '', readerLesson ? messages.learningReaderTitle : messages.learningFirstSave),
    learningButton(messages.practiceExit, actions.exit)
  );
  const content = element('div', 'practice-lesson-content');
  const progress = element('div', 'practice-stepper');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', messages.practiceTitle);
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '3');
  const tracks = Array.from({ length: 3 }, () => element('span', 'practice-step-track'));
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
  const enable = learningButton(messages.practiceEnable, actions.enable, true);
  enable.id = 'practiceEnable';
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
  lesson.append(navigation, content);
  root.append(reading, lesson);
  let lastInstruction = '';
  const setText = (node: HTMLElement, value: string) => {
    if (node.textContent !== value) node.textContent = value;
  };
  const setHidden = (node: HTMLElement, value: boolean) => {
    if (node.hidden !== value) node.hidden = value;
  };
  return {
    first,
    second,
    error,
    enable,
    readerLesson,
    status,
    update(step: PracticeStep) {
      const { title, text, disabled = false, receipt, phase, shortcut } = step;
      const completed = phase === 'saved';
      const index = phase === 'select' ? 0 : ['capture', 'reading'].includes(phase) ? 1 : 2;
      if (root.dataset.practicePhase !== phase) root.dataset.practicePhase = phase;
      if (progress.getAttribute('aria-valuenow') !== String(completed ? 3 : index))
        progress.setAttribute('aria-valuenow', String(completed ? 3 : index));
      tracks.forEach((track, i) => {
        const state = i < index || completed ? 'complete' : i === index ? 'current' : 'pending';
        if (track.dataset.state !== state) track.dataset.state = state;
      });
      setText(counter, String(index + 1).padStart(2, '0') + ' / 03');
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
        setHidden(next, receipt.course === 'reader');
      }
    }
  };
}
