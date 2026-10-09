import type { Messages } from '../i18n/messages';
import type { PracticeGuidance } from './practiceLessonTypes';

/** Learn the existing marker action; only observed movement counts as a completed jump. */
export function createPracticeReaderLesson(m: Messages) {
  const visited = new Set<string>();
  let pending: { id: string; from: number } | undefined;
  const wrapperFor = (id: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('mark[data-reader-highlight-id]')).find(
      (node) => node.dataset.readerHighlightId === id
    );
  return {
    onClick(target: Element) {
      const marker = target.closest('[data-role="session-item-marker"]');
      const id = marker?.closest<HTMLElement>('[data-highlight-id]')?.dataset.highlightId;
      if (id) pending = { id, from: window.scrollY };
    },
    read(root: ShadowRoot): PracticeGuidance {
      if (pending) {
        const wrapper = wrapperFor(pending.id);
        const box = wrapper?.getBoundingClientRect();
        if (
          box &&
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          Math.abs(window.scrollY - pending.from) > 80
        ) {
          visited.add(pending.id);
          pending = undefined;
        }
      }
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-role="highlight-item"]'));
      const milestones = [
        'selected',
        'reading',
        ...Array.from(visited, (id) => 'reader-jump-' + id)
      ];
      const collapse = root.querySelector<HTMLElement>('[data-action-id="session:toggleCollapse"]');
      const collapsed = Boolean(root.querySelector('.is-collapsed'));
      if (items.length < 2) {
        return {
          step: {
            title: m.practiceReading,
            text: !collapsed && collapse ? m.practiceCollapse : m.practiceAnother,
            phase: 'reading',
            index: 2
          },
          ...(!collapsed && collapse
            ? {
                hint: {
                  target: collapse,
                  title: collapse.getAttribute('aria-label') ?? '',
                  body: m.practiceCollapse,
                  side: 'left' as const
                }
              }
            : {}),
          milestones
        };
      }
      if (collapsed)
        return {
          step: {
            title: m.practiceReaderJumpTitle,
            text: m.practiceExpandPanel,
            phase: 'navigate',
            index: 3
          },
          hint: {
            target:
              root.querySelector<HTMLElement>('.surface-window') ??
              document.getElementById('aiob-reader-panel') ??
              document.body,
            title: m.practiceReaderJumpTitle,
            body: m.practiceExpandPanel,
            side: 'left'
          },
          milestones
        };
      const ends = [items[0], items.at(-1)].filter((item): item is HTMLElement => Boolean(item));
      const remaining = ends.filter((item) => !visited.has(item.dataset.highlightId ?? ''));
      if (remaining.length) {
        const item =
          remaining.find((item) => {
            const rect = wrapperFor(item.dataset.highlightId ?? '')?.getBoundingClientRect();
            return rect && (rect.top < 0 || rect.bottom > innerHeight);
          }) ?? remaining[0];
        const marker = item?.querySelector<HTMLElement>('.session-item-marker-index');
        const text = m.practiceReaderJump.replace('{number}', marker?.textContent?.trim() ?? '1');
        return {
          step: { title: m.practiceReaderJumpTitle, text, phase: 'navigate', index: 3 },
          ...(marker
            ? {
                hint: {
                  target: marker,
                  title: m.practiceReaderJumpTitle,
                  body: text,
                  side: 'left' as const
                }
              }
            : {}),
          milestones
        };
      }
      const finish = root.querySelector<HTMLElement>('[data-action-id="reader:finish"]');
      return {
        step: { title: m.readerPanelFinish, text: m.practiceFinish, phase: 'ready', index: 4 },
        ...(finish
          ? {
              hint: {
                target: finish,
                title: finish.textContent?.trim() ?? '',
                body: m.practiceFinish,
                side: 'left' as const
              }
            }
          : {}),
        milestones
      };
    }
  };
}
