import { Check, ChevronRight, Moon, Sun, X, createElement } from 'lucide';
import type { IconNode } from 'lucide';

export interface IconOptions {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function createIcon(icon: IconNode, options: IconOptions = {}): SVGElement {
  const svg = createElement(icon);
  const { size = 20, color = 'currentColor', strokeWidth = 2, className } = options;

  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (className) {
    svg.setAttribute('class', className);
  }

  return svg;
}

export const Icons: Record<string, IconNode> = {
  Moon,
  Sun,
  X,
  Check,
  ChevronRight
};
