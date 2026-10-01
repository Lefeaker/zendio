import { ManagedShadowStyleHost, type StyleAttachmentHandle } from '../ui/foundation/style-host';
import { element, learningButton } from './learningView';
import { createPracticeCelebration } from './practiceCelebration';
import coachCss from './practiceCoach.css?inline';

export interface PracticeHint {
  target: HTMLElement;
  title: string;
  body: string;
  side: 'left' | 'right';
}

/** Keep the single coach note and its exit action inside the active modal's focus scope. */
export function createPracticeCoachView(exitLabel: string, exit: () => void) {
  const portal = element('aside', 'practice-coach');
  portal.id = 'practiceCoach';
  const exitButton = learningButton(exitLabel, exit);
  exitButton.classList.add('practice-coach-exit');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('practice-coach-arrows');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  svg.append(path);
  const celebration = createPracticeCelebration();
  svg.style.display = 'none';
  portal.append(svg, celebration.layer, exitButton);
  const styleHost = new ManagedShadowStyleHost();
  let style: StyleAttachmentHandle | undefined;
  let parent: HTMLElement | ShadowRoot | undefined;
  let current: PracticeHint | undefined;
  let card: HTMLElement | undefined;
  let originalDescription: string | null = null;
  const clear = () => {
    if (!current) return;
    current.target.classList.remove('practice-coached');
    if (originalDescription === null) current.target.removeAttribute('aria-describedby');
    else current.target.setAttribute('aria-describedby', originalDescription);
  };
  const position = () => {
    if (!current || !card) return;
    const width = innerWidth,
      height = innerHeight;
    const target = current.target.getBoundingClientRect();
    const surface =
      current.target
        .closest<HTMLElement>('.clipper-surface-window, .surface-window')
        ?.getBoundingClientRect() ?? target;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    card.style.width = `${Math.min(288, width - 32)}px`;
    const box = card.getBoundingClientRect();
    const left = current.side === 'left';
    const below = surface.bottom + box.height + 36 <= height;
    const outside = (left ? surface.left : width - surface.right) >= box.width + 32;
    let x: number, y: number, sx: number, sy: number, tx: number, ty: number;
    if (below) {
      x = Math.max(
        16,
        Math.min(width - box.width - 16, target.left + target.width / 2 - box.width / 2)
      );
      y = surface.bottom + 30;
      sx = x + box.width / 2;
      sy = y - 5;
      tx = target.left + target.width / 2;
      ty = target.bottom + 7;
    } else if (outside) {
      x = left ? surface.left - box.width - 24 : surface.right + 24;
      y = Math.max(56, Math.min(height - box.height - 16, target.top - box.height / 2));
      sx = left ? x + box.width + 5 : x - 5;
      sy = y + box.height / 2;
      tx = left ? target.left - 7 : target.right + 7;
      ty = target.top + target.height / 2;
    } else {
      // On short/narrow viewports use the space above the dialog, never its action row.
      x = Math.max(
        16,
        Math.min(width - box.width - 16, target.left + target.width / 2 - box.width / 2)
      );
      y = Math.max(52, surface.top - box.height - 26);
      sx = left ? x - 4 : x + box.width + 4;
      sy = y + box.height / 2;
      tx = left ? target.left - 7 : target.right + 7;
      ty = target.top + target.height / 2;
    }
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    const edge = left ? 7 : width - 7;
    const cx = !below && !outside ? edge : sx + (tx - sx) * 0.3 + (left ? -18 : 18);
    const cy = below ? sy - 10 : sy;
    const endX = !below && !outside ? edge : tx + (left ? -22 : 22);
    const endY = below ? ty + 12 : ty - 16;
    const angle = Math.atan2(ty - endY, tx - endX);
    const wing = (offset: number) =>
      `${tx - 8 * Math.cos(angle + offset)} ${ty - 8 * Math.sin(angle + offset)}`;
    path.setAttribute(
      'd',
      `M ${sx} ${sy} C ${cx} ${cy}, ${endX} ${endY}, ${tx} ${ty} M ${wing(-0.5)} L ${tx} ${ty} L ${wing(0.5)}`
    );
  };
  return {
    portal,
    celebrate: celebration.sync,
    render(hint: PracticeHint | undefined, container: HTMLElement | ShadowRoot) {
      if (parent !== container || portal.parentNode !== container) {
        style?.dispose();
        style =
          container instanceof ShadowRoot
            ? styleHost.attach(container, [{ key: 'practice-coach', cssText: coachCss }])
            : undefined;
        container.append(portal);
        parent = container;
      }
      exitButton.hidden = !(container instanceof ShadowRoot);
      if (
        current?.target === hint?.target &&
        current?.title === hint?.title &&
        current?.body === hint?.body
      ) {
        position();
        return;
      }
      clear();
      current = hint;
      card?.remove();
      card = undefined;
      svg.style.display = hint ? '' : 'none';
      if (hint) {
        card = element('div', 'practice-coach-hint');
        card.id = 'practiceHint';
        card.setAttribute('role', 'note');
        card.append(element('strong', '', hint.title), element('p', '', hint.body));
        hint.target.classList.add('practice-coached');
        originalDescription = hint.target.getAttribute('aria-describedby');
        if (hint.target.getRootNode() === container)
          hint.target.setAttribute(
            'aria-describedby',
            [originalDescription, card.id].filter(Boolean).join(' ')
          );
      }
      portal.replaceChildren(svg, ...(card ? [card] : []), celebration.layer, exitButton);
      position();
    },
    dispose() {
      clear();
      celebration.dispose();
      style?.dispose();
      styleHost.destroy();
      portal.remove();
    }
  };
}
