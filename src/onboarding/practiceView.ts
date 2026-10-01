import type { Messages } from '../i18n/messages';
import type { LearningReceipt } from '../shared/learningProgress';
import { element, learningButton } from './learningView';

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
  const header = element('header', 'practice-header');
  header.append(
    element('p', 'learning-eyebrow', 'Zendio'),
    element('h1', '', readerLesson ? messages.learningReaderTitle : messages.practiceTitle)
  );
  const status = element('section', 'practice-status');
  status.id = 'practiceStatus';
  status.setAttribute('aria-live', 'polite');
  const stage = element('h2', '');
  const instruction = element('p', '');
  const enable = learningButton(messages.practiceEnable, actions.enable);
  enable.id = 'practiceEnable';
  enable.hidden = true;
  status.append(stage, instruction, enable);
  const article = element('article', 'practice-article');
  article.id = 'practiceArticle';
  const first = element('p', 'practice-passage', messages.practiceFirst);
  first.id = 'practiceFirst';
  const second = element('p', 'practice-passage', messages.practiceSecond);
  second.id = 'practiceSecond';
  article.append(element('h2', '', messages.practiceArticleTitle), first, second);
  const result = element('section', 'practice-result');
  result.id = 'practiceResult';
  result.hidden = true;
  const resultTitle = element('h2', '', messages.practiceSaved);
  const resultPath = element('p', 'learning-path');
  resultPath.id = 'practiceSavedPath';
  const locate = learningButton(messages.learningShowResult, actions.locate);
  const next = learningButton(messages.practiceNext, actions.next, true);
  next.id = 'practiceNext';
  const resultActions = element('div', 'learning-actions');
  resultActions.append(locate, next);
  result.append(resultTitle, resultPath, resultActions);
  const exit = learningButton(messages.practiceExit, actions.exit);
  const error = element('p', 'learning-error');
  error.id = 'practiceError';
  error.setAttribute('role', 'alert');
  root.append(header, status, article, result, error, exit);
  return {
    first,
    second,
    error,
    enable,
    update(title: string, text: string, disabled: boolean, receipt?: LearningReceipt) {
      if (stage.textContent !== title) stage.textContent = title;
      if (instruction.textContent !== text) instruction.textContent = text;
      if (enable.hidden !== !disabled) enable.hidden = !disabled;
      if (result.hidden !== !receipt) result.hidden = !receipt;
      if (receipt) {
        const path = [receipt.vaultName, receipt.filePath].filter(Boolean).join(' / ');
        if (resultPath.textContent !== path) resultPath.textContent = path;
        const complete = receipt.course === 'reader';
        if (next.hidden !== complete) next.hidden = complete;
      }
    }
  };
}
