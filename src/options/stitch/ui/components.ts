import { el } from './dom';
import { renderUsageChart } from './usageChartRenderer';
import { createUiIcon, UI_ICONS } from '@ui/foundation/icons';
import type { SelectOption, SurfaceAction, UsageStat } from '../types';

type IconName = keyof typeof ICON_MAP;
type IconComponent = (typeof UI_ICONS)[keyof typeof UI_ICONS];

interface IconOptions {
  size?: number;
  strokeWidth?: number;
  fill?: boolean | undefined;
  className?: string | undefined;
}

interface ButtonOptions {
  variant?: SurfaceAction['variant'] | undefined;
  icon?: IconName | undefined;
  iconFill?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
}

interface CardOptions {
  title?: string | undefined;
  description?: string | undefined;
  actions?: HTMLElement[] | undefined;
  body: Node;
  extraClass?: string | undefined;
}

interface InputOptions {
  mono?: boolean | undefined;
  className?: string | undefined;
  type?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  min?: string | number | undefined;
  max?: string | number | undefined;
  step?: string | number | undefined;
  dataset?: Record<string, string | number | boolean> | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onBlur?: ((event: Event) => void) | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onKeyUp?: ((event: KeyboardEvent) => void) | undefined;
  onSelect?: ((event: Event) => void) | undefined;
  onMouseEnter?: ((event: MouseEvent) => void) | undefined;
}

interface SelectConfig {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onChange?: ((event: Event) => void) | undefined;
}

interface TextareaOptions {
  className?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  dataset?: Record<string, string | number | boolean> | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onBlur?: ((event: Event) => void) | undefined;
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

function Badge(label: string, variant = ''): HTMLSpanElement {
  return el('span', {
    className: ['badge', variant].filter(Boolean).join(' '),
    text: label
  });
}

function Pill(label: string): HTMLSpanElement {
  return el('span', { className: 'pill', text: label });
}

function Button(label: string, options: ButtonOptions = {}): HTMLButtonElement {
  return el(
    'button',
    {
      type: 'button',
      className: ['btn', options.variant].filter(Boolean).join(' '),
      disabled: options.disabled,
      onMousedown: (event: MouseEvent) => event.preventDefault(),
      onClick: options.onClick
    },
    options.icon ? Icon(options.icon, { className: 'btn-icon', fill: options.iconFill }) : null,
    el('span', { text: label })
  );
}

function Card({
  title,
  description,
  actions = [],
  body,
  extraClass = ''
}: CardOptions): HTMLElement {
  const header = el(
    'div',
    { className: 'card-header' },
    el(
      'div',
      {},
      title ? el('h2', { text: title }) : null,
      description ? el('p', { text: description }) : null
    ),
    actions.length ? el('div', { className: 'toolbar' }, actions) : null
  );

  return el(
    'section',
    { className: ['card', extraClass].filter(Boolean).join(' ') },
    title || description || actions.length ? header : null,
    body
  );
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

function Input(value: string | number, options: InputOptions = {}): HTMLInputElement {
  return el('input', {
    className: ['input', options.mono ? 'code' : '', options.className || '']
      .filter(Boolean)
      .join(' '),
    value,
    type: options.type || 'text',
    placeholder: options.placeholder,
    disabled: options.disabled,
    readOnly: options.readOnly,
    min: options.min,
    max: options.max,
    step: options.step,
    dataset: options.dataset,
    onInput: options.onInput,
    onChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: options.onBlur,
    onClick: options.onClick,
    onKeyup: options.onKeyUp,
    onSelect: options.onSelect,
    onMouseenter: options.onMouseEnter
  });
}

function Select(
  options: SelectOption[],
  value: string | number | undefined,
  config: SelectConfig = {}
): HTMLSelectElement {
  const select = el('select', {
    className: ['select', config.className || ''].filter(Boolean).join(' '),
    disabled: config.disabled,
    onChange: config.onChange
  });
  options.forEach((option) => {
    select.append(
      el('option', {
        value: option.value,
        selected: option.value === value,
        text: option.label
      })
    );
  });
  return select;
}

function Textarea(value: string | number, options: TextareaOptions = {}): HTMLTextAreaElement {
  return el('textarea', {
    className: ['textarea', options.className || ''].filter(Boolean).join(' '),
    value,
    placeholder: options.placeholder,
    disabled: options.disabled,
    dataset: options.dataset,
    onInput: options.onInput,
    onChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: options.onBlur
  });
}

function SwitchRow({
  checked = false,
  disabled = false,
  onClick,
  onChange
}: SwitchRowOptions): HTMLDivElement {
  const input = el('input', { type: 'checkbox', checked, disabled, onChange });
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
  return el(
    'div',
    { className: ['table-wrap', rowClassName].filter(Boolean).join(' ') },
    el(
      'table',
      {},
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          columns.map((column) => el('th', { text: column }))
        )
      ),
      el(
        'tbody',
        {},
        rows.map((row) =>
          el(
            'tr',
            row.rowProps || {},
            row.cells.map((cell) =>
              el(
                'td',
                cell.props || {},
                cell.node !== undefined
                  ? cell.node
                  : cell.html
                    ? el('span', { html: cell.html })
                    : cell.text
              )
            )
          )
        )
      )
    )
  );
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
  onChange: (value: string) => void
): HTMLDivElement {
  return el(
    'div',
    { className: 'chips', dataset: active !== undefined ? { activeValue: active } : undefined },
    items.map((item) =>
      el('button', {
        type: 'button',
        className: 'chip',
        'aria-pressed': active === item.value ? 'true' : 'false',
        dataset: { value: item.value },
        text: item.label,
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: () => onChange(item.value)
      })
    )
  );
}

export const previewUi = {
  Icon,
  Badge,
  Pill,
  Button,
  Card,
  Group,
  Hero,
  StatsGrid,
  Field,
  Input,
  Select,
  Textarea,
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
