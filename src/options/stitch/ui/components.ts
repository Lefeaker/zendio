import { el, surfaceComponents, type RuntimeButtonOptions } from '@ui/stitch-runtime';
import { createPrimitiveButtonElement } from '@ui/primitives/button';
import { createCardElement } from '@ui/primitives/card';
import { createSelectElement } from '@ui/primitives/select';
import { createTableElement } from '@ui/primitives/table';
import { createToggleElement } from '@ui/primitives/toggle';
import {
  createUsageChartShell,
  renderUsageChart as renderUsageChartFromOwner,
  type UsageChartSeriesPoint
} from '@ui/domains/usage-chart';
import { createUiIcon, UI_ICONS } from '@ui/foundation/icons';
import type { SelectOption, UsageStat } from '../types';

type IconName = keyof typeof ICON_MAP;
type IconComponent = (typeof UI_ICONS)[keyof typeof UI_ICONS];

interface IconOptions {
  size?: number;
  strokeWidth?: number;
  fill?: boolean | undefined;
  className?: string | undefined;
}

interface ButtonOptions extends RuntimeButtonOptions {
  icon?: IconName | undefined;
  iconFill?: boolean | undefined;
}

interface CardOptions {
  title?: string | undefined;
  description?: string | undefined;
  actions?: HTMLElement[] | undefined;
  body: Node;
  extraClass?: string | undefined;
}

interface SelectConfig {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onChange?: ((event: Event) => void) | undefined;
}

interface SwitchRowOptions {
  checked?: boolean | undefined;
  disabled?: boolean | undefined;
  stateText?: string | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
}

interface RowOptions {
  title?: string | undefined;
  description?: string | undefined;
  control: Node;
}

interface TableCell {
  props?: Record<string, string | number | boolean> | undefined;
  node?: Node | null | undefined;
  html?: string | undefined;
  text?: string | number | undefined;
}

interface TableRow {
  rowProps?: Record<string, string | number | boolean> | undefined;
  cells: TableCell[];
}

interface TableOptions {
  columns: string[];
  rows: TableRow[];
  rowClassName?: string | undefined;
}

interface TokenRowOptions {
  activeToken?: string | undefined;
  onTokenClick?: ((token: string) => void) | undefined;
}

const ICON_MAP = {
  dashboard: UI_ICONS.LayoutDashboard,
  storage: UI_ICONS.Database,
  ads_click: UI_ICONS.MousePointerClick,
  menu_book: UI_ICONS.BookOpen,
  output: UI_ICONS.MonitorUp,
  science: UI_ICONS.FlaskConical,
  construction: UI_ICONS.Wrench,
  rocket_launch: UI_ICONS.Rocket,
  extension: UI_ICONS.Puzzle,
  favorite: UI_ICONS.Heart,
  lightbulb: UI_ICONS.Lightbulb,
  mail: UI_ICONS.Mail,
  history: UI_ICONS.History,
  content_cut: UI_ICONS.Scissors,
  auto_stories: UI_ICONS.BookOpen,
  smart_display: UI_ICONS.MonitorPlay,
  celebration: UI_ICONS.PartyPopper,
  search: UI_ICONS.Search,
  dark_mode: UI_ICONS.Moon,
  light_mode: UI_ICONS.Sun,
  sync: UI_ICONS.RefreshCw,
  notifications: UI_ICONS.Bell,
  settings: UI_ICONS.Settings,
  circle: UI_ICONS.Circle,
  link: UI_ICONS.ChevronRight
} satisfies Record<string, IconComponent>;

function Icon(name: string, options: IconOptions = {}): SVGElement {
  const iconNode = (ICON_MAP as Record<string, IconComponent>)[name] || UI_ICONS.Circle;
  const svg = createUiIcon(iconNode, {
    size: options.size || 18,
    strokeWidth: options.strokeWidth || (options.fill ? 2.25 : 2)
  });
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', ['preview-icon', options.className || ''].filter(Boolean).join(' '));
  return svg;
}

function Button(label: string, options: ButtonOptions = {}): HTMLButtonElement {
  return createPrimitiveButtonElement({
    label,
    disabled: options.disabled,
    onClick: options.onClick,
    classSlots: ['btn', options.variant ?? ''],
    onMouseDown: (event) => event.preventDefault(),
    leading: options.icon
      ? Icon(options.icon, { className: 'btn-icon', fill: options.iconFill })
      : null
  });
}

function Card({
  title,
  description,
  actions = [],
  body,
  extraClass = ''
}: CardOptions): HTMLElement {
  return createCardElement({
    title,
    description,
    actions,
    body,
    className: ['card', extraClass].filter(Boolean).join(' ')
  });
}

function Group(title: string, content: Node): HTMLElement {
  return el(
    'section',
    { className: 'group' },
    el('div', { className: 'group-title', text: title }),
    content
  );
}

function Hero({ title, description }: { title: string; description: string }): HTMLElement {
  return el(
    'header',
    { className: 'hero' },
    el('h1', { text: title }),
    el('p', { text: description })
  );
}

function StatsGrid(stats: UsageStat[]): HTMLDivElement {
  return el(
    'div',
    { className: 'stats-grid' },
    stats.map((stat) =>
      el(
        'div',
        { className: 'mini-card' },
        el('div', { className: 'stat-title', text: stat.label }),
        el('div', { className: 'stat-value', text: String(stat.value) })
      )
    )
  );
}

function Field(label: string, control: Node): HTMLDivElement {
  return el('div', { className: 'field' }, el('label', { text: label }), control);
}

function Select(
  options: SelectOption[],
  value: string | number | undefined,
  config: SelectConfig = {}
): HTMLSelectElement {
  return createSelectElement({
    value: value === undefined ? undefined : String(value),
    disabled: config.disabled,
    classSlots: ['select', config.className || ''],
    options: options.map((option) => ({ value: String(option.value), label: option.label })),
    onChange: (_value, event) => config.onChange?.(event)
  });
}

function SwitchRow({
  checked = false,
  disabled = false,
  onClick,
  onChange
}: SwitchRowOptions): HTMLDivElement {
  const input = createToggleElement({
    checked,
    disabled,
    classSlots: [],
    onChange: (_checked, event) => onChange?.(event)
  });
  return el(
    'div',
    { className: 'switch-line' },
    el('label', { className: 'switch', onClick }, input, el('span', { className: 'slider' }))
  );
}

function Row({ title, description, control }: RowOptions): HTMLDivElement {
  return el(
    'div',
    { className: 'row' },
    el(
      'div',
      { className: 'label' },
      el('strong', { text: title }),
      el('span', { text: description })
    ),
    control
  );
}

function Rows(items: Node[]): HTMLDivElement {
  return el('div', { className: 'rows' }, items);
}

function Table({ columns, rows, rowClassName }: TableOptions): HTMLDivElement {
  return createTableElement({
    columns,
    rows,
    wrapperClassName: ['table-wrap', rowClassName].filter(Boolean).join(' ')
  });
}

function MiniCard(title: string, content: Node): HTMLDivElement {
  return el('div', { className: 'mini-card' }, el('strong', { text: title }), content);
}

function Notice({
  title,
  body,
  variant = 'info'
}: {
  title: string;
  body: string | Node;
  variant?: string;
}): HTMLDivElement {
  return el(
    'div',
    { className: ['notice', variant].join(' ') },
    el('strong', { text: title }),
    typeof body === 'string' ? el('p', { text: body }) : body
  );
}

function TokenRow(tokens: string[], options: TokenRowOptions = {}): HTMLDivElement {
  const onTokenClick = options.onTokenClick;
  return el(
    'div',
    { className: 'token-row' },
    tokens.map((token) => {
      if (!onTokenClick) {
        return el('span', { className: 'token', text: token });
      }

      return el('button', {
        type: 'button',
        className: ['token', 'token-button', options.activeToken === token ? 'is-active' : '']
          .filter(Boolean)
          .join(' '),
        text: token,
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: () => onTokenClick(token)
      });
    })
  );
}

function YAMLFilterRow(
  filters: SelectOption[],
  active: string,
  onChange: (value: string) => void
): HTMLDivElement {
  return el(
    'div',
    { className: 'yaml-filter-row', role: 'tablist', 'aria-label': 'YAML filter' },
    filters.map((filter) =>
      el('button', {
        type: 'button',
        className: ['yaml-filter', active === filter.value ? 'is-active' : '']
          .filter(Boolean)
          .join(' '),
        text: filter.label,
        dataset: { filter: filter.value },
        onClick: () => onChange(filter.value)
      })
    )
  );
}

function SegmentedNav(
  items: SelectOption[],
  active: string | number | undefined,
  onChange: (value: string) => void,
  className = ''
): HTMLDivElement {
  const group = el(
    'div',
    {
      className: ['chips', className].filter(Boolean).join(' '),
      dataset: active !== undefined ? { activeValue: active } : undefined,
      style: {
        '--segment-count': items.length,
        '--segment-index': Math.max(
          0,
          items.findIndex((item) => item.value === active)
        )
      }
    },
    items.map((item, index) =>
      el('button', {
        type: 'button',
        className: 'chip',
        'aria-pressed': active === item.value ? 'true' : 'false',
        dataset: { value: item.value },
        text: item.label,
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: () => {
          group.dataset.activeValue = item.value;
          group.style.setProperty('--segment-index', String(index));
          group.querySelectorAll<HTMLButtonElement>('button[data-value]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.value === item.value));
          });
          onChange(item.value);
        }
      })
    )
  );
  return group;
}

function renderUsageChart(root: HTMLElement, history: UsageChartSeriesPoint[]): void {
  const { host, chart } = createUsageChartShell(
    (tagName) => document.createElement(tagName),
    'stitch'
  );
  root.replaceChildren(...Array.from(host.childNodes));
  renderUsageChartFromOwner(chart, history);
}

export const previewUi = {
  Icon,
  Badge: surfaceComponents.Badge,
  Pill: surfaceComponents.Pill,
  Button,
  Card,
  Group,
  Hero,
  StatsGrid,
  Field,
  Input: surfaceComponents.Input,
  Select,
  Textarea: surfaceComponents.Textarea,
  SwitchRow,
  Row,
  Rows,
  Table,
  MiniCard,
  Notice,
  TokenRow,
  YAMLFilterRow,
  SegmentedNav,
  renderUsageChart
};
