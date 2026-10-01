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
  const keys = config.selectionModifierKeys
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
  return messages.practiceSelect.replace('{key}', keys);
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
    attributeFilter: ['hidden', 'class', 'style', 'aria-busy']
  };
  const actionClick = (event: Event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-action-id]')
        : null;
    if (['clip', 'reader:finish'].includes(target?.dataset.actionId ?? '')) {
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
    const support = panel('aiob-support-prompt');
    const close = support?.querySelector<HTMLElement>('[data-action-id="resource:close"]');
    const supportFailed = Boolean(support?.querySelector('.task-progress-track.is-failure'));
    const disabled = config.selectionTriggerMode === 'disabled';
    const hints: PracticeHint[] = [];
    let container: HTMLElement | ShadowRoot = document.body;
    if (clipper) {
      container = clipper;
      saving = false;
      view.update(m.practicePopup, m.practiceComment, false);
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
      if (readerButton)
        hints.push({
          target: readerButton,
          title: readerButton.textContent?.trim() ?? '',
          body: reader ? m.practiceAddHighlight : m.practiceReader,
          side: 'left'
        });
      if (clipButton)
        hints.push({
          target: clipButton,
          title: clipButton.textContent?.trim() ?? '',
          body: m.practiceClip + '\n' + destination,
          side: 'right'
        });
    } else if (receipt && (receipt.course === 'reader' || !reader)) {
      saving = false;
      view.update(m.practiceSaved, m.practiceResult, false, receipt);
      if (support && close) {
        container = support;
        hints.push({
          target: close,
          title: m.practiceSaved,
          body: m.practiceCloseResult,
          side: 'left'
        });
      }
    } else if (supportFailed || failed) {
      saving = false;
      view.update(m.learningDownloadFailed, m.practiceRetry, false);
      if (support && close) {
        container = support;
        hints.push({
          target: close,
          title: m.learningDownloadFailed,
          body: m.practiceRetry,
          side: 'left'
        });
      }
    } else if (saving) {
      view.update(m.learningDownloadPending, m.learningPendingHint, false);
    } else if (reader) {
      container = reader;
      const count = reader.querySelectorAll('[data-role="highlight-item"]').length;
      const finish = reader.querySelector<HTMLElement>('[data-action-id="reader:finish"]');
      const collapse = reader.querySelector<HTMLElement>(
        '[data-action-id="session:toggleCollapse"]'
      );
      const collapsed = Boolean(reader.querySelector('.is-collapsed'));
      view.update(
        m.practiceReading,
        count >= 2
          ? m.practiceFinish
          : !collapsed && collapse
            ? m.practiceCollapse
            : m.practiceAnother,
        false
      );
      if (count < 2 && !collapsed && collapse) {
        hints.push({
          target: collapse,
          title: collapse.getAttribute('aria-label') ?? '',
          body: m.practiceCollapse,
          side: 'left'
        });
      } else if (count < 2) {
        // Keep the passage hint in the document; its target is outside the reader's shadow root.
        container = document.body;
        hints.push({
          target: view.second,
          title: m.practiceReading,
          body: m.practiceAnother,
          side: 'right'
        });
      } else if (finish) {
        hints.push({
          target: finish,
          title: finish.textContent?.trim() ?? '',
          body: m.practiceFinish,
          side: 'left'
        });
      }
    } else {
      view.update(m.practiceSelectTitle, practiceSelectionHint(config, m), disabled);
      hints.push({
        target: disabled ? view.enable : view.first,
        title: m.practiceSelectTitle,
        body: practiceSelectionHint(config, m),
        side: 'right'
      });
    }
    overlay.render(hints, container);
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
      stopOptions();
      stopProgress();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      overlay.dispose();
    }
  };
}
