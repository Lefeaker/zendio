import { ManagedShadowStyleHost } from '../ui/foundation/style-host';
import type { StyleAttachmentHandle } from '../ui/foundation/style-host';
import { element, learningButton } from './learningView';
import coachCss from './practiceCoach.css?inline';

export interface PracticeHint {
  target: HTMLElement;
  title: string;
  body: string;
  side: 'left' | 'right';
}

/** A page-owned overlay. It moves into the active panel's shadow root to share its focus scope. */
export function createPracticeCoachView(exitLabel: string, exit: () => void) {
  const portal = element('aside', 'practice-coach');
  portal.id = 'practiceCoach';
  const exitButton = learningButton(exitLabel, exit);
  exitButton.classList.add('practice-coach-exit');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('practice-coach-arrows');
  svg.setAttribute('aria-hidden', 'true');
  const styleHost = new ManagedShadowStyleHost();
  let style: StyleAttachmentHandle | undefined;
  let parent: HTMLElement | ShadowRoot | undefined;
  let current: PracticeHint[] = [];
  let cards: HTMLElement[] = [];
  let paths: SVGPathElement[] = [];
  const restoreDescriptions = new Map<HTMLElement, string | null>();
  const clear = () => {
    for (const [target, value] of restoreDescriptions) {
      target.classList.remove('practice-coached');
      if (value === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', value);
    }
    restoreDescriptions.clear();
  };
  const position = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    cards.forEach((card, index) => {
      const hint = current[index];
      const path = paths[index];
      if (!hint || !path) return;
      const target = hint.target.getBoundingClientRect();
      const surface = hint.target
        .closest<HTMLElement>('.clipper-surface-window, .surface-window')
        ?.getBoundingClientRect();
      const cardWidth = Math.min(224, width - 32);
      card.style.width = `${cardWidth}px`;
      const cardHeight = card.getBoundingClientRect().height;
      const left = hint.side === 'left';
      const sideSpace = surface
        ? left
          ? surface.left
          : width - surface.right
        : left
          ? target.left
          : width - target.right;
      const outside = sideSpace >= cardWidth + 28;
      let x: number;
      let y: number;
      if (outside) {
        x = left
          ? (surface?.left ?? target.left) - cardWidth - 18
          : (surface?.right ?? target.right) + 18;
        y = Math.max(64, Math.min(height - cardHeight - 16, target.top - cardHeight / 2));
      } else {
        x = 16;
        card.style.width = `${width - 32}px`;
        const measuredHeight = card.getBoundingClientRect().height;
        y = index === 0 ? 56 : height - measuredHeight - 12;
      }
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      const box = card.getBoundingClientRect();
      const tx = left ? target.left - 5 : target.right + 5;
      const ty = target.top + target.height / 2;
      const sx = outside ? (left ? box.right : box.left) : left ? box.left : box.right;
      const sy = box.top + box.height / 2;
      const edge = left ? 7 : width - 7;
      const d = outside
        ? `M ${sx} ${sy} L ${tx} ${ty}`
        : `M ${sx} ${sy} L ${edge} ${sy} L ${edge} ${ty} L ${tx} ${ty}`;
      const direction = left ? -1 : 1;
      path.setAttribute(
        'd',
        d + ` M ${tx + direction * 7} ${ty - 5} L ${tx} ${ty} L ${tx + direction * 7} ${ty + 5}`
      );
    });
  };
  return {
    portal,
    position,
    render(next: PracticeHint[], container: HTMLElement | ShadowRoot) {
      if (parent !== container || portal.parentNode !== container) {
        style?.dispose();
        style =
          container instanceof ShadowRoot
            ? styleHost.attach(container, [{ key: 'practice-coach', cssText: coachCss }])
            : undefined;
        container.append(portal);
        parent = container;
      }
      if (
        current.length === next.length &&
        current.every(
          (hint, index) =>
            hint.target === next[index]?.target &&
            hint.title === next[index]?.title &&
            hint.body === next[index]?.body
        )
      ) {
        position();
        return;
      }
      clear();
      current = next;
      svg.replaceChildren();
      cards = next.map((hint, index) => {
        const card = element('div', 'practice-coach-hint');
        card.id = 'practiceHint' + index;
        card.setAttribute('role', 'note');
        card.append(element('strong', '', hint.title), element('p', '', hint.body));
        hint.target.classList.add('practice-coached');
        restoreDescriptions.set(hint.target, hint.target.getAttribute('aria-describedby'));
        if (hint.target.getRootNode() === container)
          hint.target.setAttribute('aria-describedby', card.id);
        return card;
      });
      paths = next.map(() => {
        const path = document.createElementNS(ns, 'path');
        svg.append(path);
        return path;
      });
      portal.replaceChildren(svg, ...cards, exitButton);
      position();
    },
    dispose() {
      clear();
      style?.dispose();
      styleHost.destroy();
      portal.remove();
    }
  };
}
