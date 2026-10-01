import type { Messages } from '../i18n/messages';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { FragmentClipperOptions } from '../shared/types/options';
import type { StorageAreaService } from '../platform/interfaces/storage';
import {
  LEARNING_PROGRESS_KEY,
  LearningProgressSchema,
  emptyLearningProgress,
  type LearningReceipt
} from '../shared/learningProgress';
import { DOWNLOADS_DESTINATION_ID } from '../shared/exportDestination';
import { createPracticeCoachView, type PracticeHint } from './practiceCoachView';
import { createPracticeReaderLesson } from './practiceReaderLesson';
import { createPracticeVideoLesson } from './practiceVideoLesson';
import type { createPracticeView } from './practiceView';

export function matchesPracticeSource(source: string | undefined, current: string): boolean {
  if (!source) return false;
  try {
    const a = new URL(source),
      b = new URL(current);
    a.hash = '';
    b.hash = '';
    return a.href === b.href;
  } catch {
    return false;
  }
}

export function practiceSelectionHint(config: FragmentClipperOptions, messages: Messages): string {
  if (config.selectionTriggerMode === 'disabled') return messages.practiceDisabled;
  if (config.selectionTriggerMode === 'direct') return messages.practiceSelectDirect;
  return messages.practiceSelect.replace('{key}', practiceSelectionKeys(config));
}

function practiceSelectionKeys(config: FragmentClipperOptions): string {
  return config.selectionModifierKeys
    .map(
      (key) =>
        ({
          shift: 'Shift',
          alt: 'Alt',
          ctrl: 'Ctrl',
          meta: navigator.platform.includes('Mac') ? '⌘' : 'Meta'
        })[key]
    )
    .join(' + ');
}

export async function mountPracticeCoach(args: {
  view: ReturnType<typeof createPracticeView>;
  messages: Messages;
  options: IOptionsRepository;
  storage: StorageAreaService;
  exit: () => void;
}) {
  const { view, messages: m, options, storage } = args;
  let config = (await options.get()).fragmentClipper;
  let receipt: LearningReceipt | undefined;
  let failed = false;
  let saving = false;
  let disposed = false;
  let frame: number | null = null;
  let generation = 0;
  const overlay = createPracticeCoachView(m.practiceExit, args.exit);
  const readerLesson = createPracticeReaderLesson(m);
  const videoLesson = view.video ? createPracticeVideoLesson(view.video, m) : undefined;
  const watched = new Map<ShadowRoot, MutationObserver>();
  const schedule = () => {
    if (!disposed && frame === null)
      frame = requestAnimationFrame(() => {
        frame = null;
        render();
      });
  };
  const changed: MutationCallback = (records) => {
    if (records.some((record) => !overlay.portal.contains(record.target))) schedule();
  };
  const observerOptions: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'style', 'aria-busy', 'data-screenshot-state']
  };
  const actionClick = (event: Event) => {
    if (event.target instanceof Element) {
      readerLesson.onClick(event.target);
      videoLesson?.onClick(event.target);
    }
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-action-id]')
        : null;
    if (['clip', 'reader:finish', 'video:finish'].includes(target?.dataset.actionId ?? '')) {
      saving = true;
      schedule();
    }
  };
  const observe = (root: ShadowRoot) => {
    if (watched.has(root)) return;
    const observer = new MutationObserver(changed);
    observer.observe(root, observerOptions);
    watched.set(root, observer);
    root.addEventListener('click', actionClick, true);
  };
  const panel = (id: string) => {
    const host = document.getElementById(id);
    const root = host?.shadowRoot;
    if (!host || !root || host.hidden || host.getAttribute('aria-busy') === 'true') return null;
    observe(root);
    return root;
  };
  function render(): void {
    if (disposed) return;
    for (const [root, observer] of watched) {
      if (!root.host.isConnected) {
        observer.disconnect();
        root.removeEventListener('click', actionClick, true);
        watched.delete(root);
      }
    }
    const clipper = panel('obsidian-clipper-dialog');
    const reader = panel('aiob-reader-panel');
    const video = panel('aiob-video-panel');
    const support = panel('aiob-support-prompt');
    const close = support?.querySelector<HTMLElement>('[data-action-id="resource:close"]');
    const supportFailed = Boolean(support?.querySelector('.task-progress-track.is-failure'));
    const disabled = config.selectionTriggerMode === 'disabled';
    let hint: PracticeHint | undefined;
    let milestones: string[] = [];
    let container: HTMLElement | ShadowRoot = document.body;
    if (clipper) {
      container = clipper;
      saving = false;
      view.update({
        title: view.readerLesson ? m.learningReaderTitle : m.practicePopup,
        text: view.readerLesson ? m.practiceReader : m.practiceComment,
        phase: 'capture'
      });
      const readerButton = clipper.querySelector<HTMLElement>('[data-action-id="reader"]');
      const clipButton = clipper.querySelector<HTMLElement>('[data-action-id="clip"]');
      const selected = clipper.querySelector<HTMLElement>('.export-destination-option.is-selected');
      const downloads = selected?.dataset.destinationId === DOWNLOADS_DESTINATION_ID;
      const destination = downloads
        ? clipper.querySelector('.export-destination-setup-link')
          ? m.practiceNoVault
          : m.practiceDownloads
        : m.practiceVault.replace(
            '{name}',
            clipper.querySelector('.export-destination-label')?.textContent ?? ''
          );
      if (view.readerLesson && readerButton) {
        hint = {
          target: readerButton,
          title: readerButton.textContent?.trim() ?? '',
          body: m.practiceReader,
          side: 'left'
        };
      } else if (clipButton) {
        hint = {
          target: clipButton,
          title: clipButton.textContent?.trim() ?? '',
          body: m.practiceClip + '\n' + destination,
          side: 'right'
        };
      }
    } else if (
      receipt &&
      (receipt.course === 'reader' || receipt.course === 'video' || (!reader && !video))
    ) {
      saving = false;
      view.update({ title: m.practiceSaved, text: m.practiceResult, phase: 'saved', receipt });
      if (support && close) {
        container = support;
        hint = {
          target: close,
          title: m.practiceSaved,
          body: m.practiceCloseResult,
          side: 'left'
        };
      }
    } else if (supportFailed || failed) {
      saving = false;
      view.update({ title: m.learningDownloadFailed, text: m.practiceRetry, phase: 'error' });
      if (support && close) {
        container = support;
        hint = {
          target: close,
          title: m.learningDownloadFailed,
          body: m.practiceRetry,
          side: 'left'
        };
      }
    } else if (saving) {
      view.update({
        title: m.learningDownloadPending,
        text: m.learningPendingHint,
        phase: 'saving'
      });
    } else if (video && videoLesson) {
      container = video;
      const guidance = videoLesson.read(video);
      view.update(guidance.step);
      hint = guidance.hint;
      milestones = guidance.milestones;
    } else if (reader) {
      container = reader;
      const guidance = readerLesson.read(reader);
      view.update(guidance.step);
      hint = guidance.hint;
      milestones = guidance.milestones;
    } else if (view.video) {
      view.update({
        title: m.learningVideoTitle,
        text: m.practiceVideoIntro,
        phase: 'select',
        disabled: true,
        index: 0
      });
    } else {
      view.update({
        title: m.practiceSelectTitle,
        text: practiceSelectionHint(config, m),
        disabled,
        phase: 'select',
        shortcut:
          config.selectionTriggerMode === 'modifier' ? practiceSelectionKeys(config) : undefined
      });
    }
    overlay.render(hint, container);
    view.setOverlayActive(container instanceof ShadowRoot);
    if (clipper) milestones = ['selected'];
    else if (receipt && !reader && !video) milestones = ['selected', 'saved'];
    overlay.celebrate(milestones, hint?.target ?? view.status);
  }
  const readProgress = async () => {
    const current = ++generation;
    try {
      const state = LearningProgressSchema.parse(
        (await storage.get(LEARNING_PROGRESS_KEY)) ?? emptyLearningProgress()
      );
      if (disposed || current !== generation) return;
      if (state.latest && matchesPracticeSource(state.latest.sourceUrl, location.href))
        receipt = state.latest;
      failed = state.pending.some(
        (item) => item.failed && matchesPracticeSource(item.receipt.sourceUrl, location.href)
      );
      schedule();
    } catch {
      if (!disposed) view.error.textContent = m.learningProgressError;
    }
  };
  const documentObserver = new MutationObserver(changed);
  documentObserver.observe(document.body, observerOptions);

  const stopOptions = options.onChange((next) => {
    config = next.fragmentClipper;
    schedule();
  });
  const stopProgress = storage.watchKey(LEARNING_PROGRESS_KEY, () => {
    void readProgress();
  });
  const mediaEvents = ['seeked', 'loadeddata', 'timeupdate'];
  mediaEvents.forEach((name) => view.video?.addEventListener(name, schedule));
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  await readProgress();
  render();
  return {
    getReceipt: () => receipt,
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      documentObserver.disconnect();
      watched.forEach((observer, root) => {
        observer.disconnect();
        root.removeEventListener('click', actionClick, true);
      });
      watched.clear();
      mediaEvents.forEach((name) => view.video?.removeEventListener(name, schedule));
      stopOptions();
      stopProgress();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      overlay.dispose();
    }
  };
}
