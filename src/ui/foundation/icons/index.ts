import {
  Bell,
  BookOpen,
  Activity,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Database,
  FlaskConical,
  FolderOpen,
  Heart,
  History,
  Info,
  LayoutDashboard,
  Lightbulb,
  Mail,
  MonitorPlay,
  MonitorUp,
  Moon,
  MousePointerClick,
  PartyPopper,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Rocket,
  Save,
  Scissors,
  Search,
  Settings,
  Sun,
  Trash2,
  Wrench,
  X,
  XCircle,
  createElement
} from 'lucide';
import type { IconNode } from 'lucide';

export interface IconOptions {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export const UI_ICONS = {
  Bell,
  BookOpen,
  Activity,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Database,
  FlaskConical,
  FolderOpen,
  Heart,
  History,
  Info,
  LayoutDashboard,
  Lightbulb,
  Mail,
  MonitorPlay,
  MonitorUp,
  Moon,
  MousePointerClick,
  PartyPopper,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Rocket,
  Save,
  Scissors,
  Search,
  Settings,
  Sun,
  Trash2,
  Wrench,
  X,
  XCircle
} as const;

export type UiIconName = keyof typeof UI_ICONS;

export function getUiIconNode(name?: UiIconName): IconNode | null {
  if (!name) {
    return null;
  }
  return UI_ICONS[name] ?? null;
}

export function createUiIcon(icon: IconNode, options: IconOptions = {}): SVGElement {
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

export function createUiIconByName(name: UiIconName, options: IconOptions = {}): SVGElement | null {
  const icon = getUiIconNode(name);
  return icon ? createUiIcon(icon, options) : null;
}
