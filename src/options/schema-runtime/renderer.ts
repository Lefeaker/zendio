import { resolveBinding, resolveSchemaValue } from './binding';
import type {
  ActionDescriptor,
  CardNode,
  ElementNode,
  InputNode,
  NodeSchema,
  RowNode,
  SchemaContext,
  SelectNode,
  SwitchNode,
  TableCellSchema,
  TableNode,
  TokenRowNode,
  ViewSchema,
  WidgetFactory,
  WidgetMountContract,
  WidgetSchema,
  WidgetRuntime
} from './contracts';
import { el } from './dom';

interface SchemaRendererRuntime<State, AppData> {
  getContext: () => SchemaContext<State, AppData>;
  dispatch: (action: ActionDescriptor | string, payload?: unknown) => void;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  requestRerender: () => void;
  getWidgetFactory: (widgetType: string) => WidgetFactory<State, AppData> | null;
  notifyDirty?: (keys?: string[]) => void;
  reportError?: (scope: string, error: unknown) => void;
}

interface SchemaRendererExtensions {
  renderView?: (view: unknown) => HTMLElement | null | undefined;
}

export interface SchemaRenderer<State, AppData> {
  renderView: (view: ViewSchema<State, AppData>) => HTMLElement;
  collectWidgetState: () => unknown[];
  dispose: () => void;
}

function toArray<State, AppData>(
  value: NodeSchema<State, AppData>[] | NodeSchema<State, AppData> | undefined
): NodeSchema<State, AppData>[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function joinClassNames(parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export function createSchemaRenderer<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  extensions: SchemaRendererExtensions = {}
): SchemaRenderer<State, AppData> {
  const widgetInstances = new Set<WidgetMountContract<unknown, State, AppData>>();

  function collectWidgetState(): unknown[] {
    const collected: unknown[] = [];
    widgetInstances.forEach((widget) => {
      if (typeof widget.collect !== 'function') {
        return;
      }
      try {
        const value = widget.collect();
        if (value !== undefined) {
          collected.push(value);
        }
      } catch (error) {
        runtime.reportError?.('collect', error);
      }
    });
    return collected;
  }

  function dispose(): void {
    widgetInstances.forEach((widget) => {
      try {
        widget.destroy();
      } catch (error) {
        console.warn('[SchemaRenderer] Failed to destroy widget instance:', error);
      }
    });
    widgetInstances.clear();
  }

  function renderHero(view: ViewSchema<State, AppData>): HTMLElement | null {
    if (!view.hero) {
      return null;
    }
    const ctx = runtime.getContext();
    const title = resolveSchemaValue(view.hero.title, ctx);
    if (!title) {
      return null;
    }
    const description = resolveSchemaValue(view.hero.description, ctx);
    const pills = resolveSchemaValue(view.hero.pills, ctx) ?? [];

    return el(
      'header',
      { className: 'schema-hero' },
      el(
        'div',
        { className: 'schema-hero-copy' },
        el('h2', { className: 'schema-hero-title', text: asString(title) }),
        description
          ? el('p', { className: 'schema-hero-description', text: asString(description) })
          : null
      ),
      pills.length
        ? el(
            'div',
            { className: 'schema-hero-pills' },
            pills.map((pill) => el('span', { className: 'schema-hero-pill', text: pill }))
          )
        : null
    );
  }

  function renderInput(node: InputNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const value =
      (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.value, ctx)) ?? '';
    const className = joinClassNames([
      node.kind === 'textarea' ? 'schema-textarea' : 'schema-input',
      asString(resolveSchemaValue(node.className, ctx) ?? '')
    ]);
    const baseProps = {
      className,
      placeholder: resolveSchemaValue(node.placeholder, ctx),
      disabled: asBoolean(resolveSchemaValue(node.disabled, ctx))
    };

    if (node.kind === 'textarea') {
      return el('textarea', {
        ...baseProps,
        value: asString(value),
        onInput: node.action
          ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
          : undefined
      });
    }

    return el('input', {
      ...baseProps,
      type: resolveSchemaValue(node.type, ctx) ?? 'text',
      value: asString(value),
      onInput: node.action
        ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
        : undefined
    });
  }

  function renderSelect(node: SelectNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const value =
      (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.value, ctx)) ?? '';
    const select = el('select', {
      className: joinClassNames([
        'schema-select',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ]),
      disabled: asBoolean(resolveSchemaValue(node.disabled, ctx)),
      onChange: node.action
        ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
        : undefined
    });

    const options = resolveSchemaValue(node.options, ctx) ?? [];
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

  function renderSwitch(node: SwitchNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const checked =
      (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.checked, ctx)) ?? false;
    const stateText = resolveSchemaValue(node.stateText, ctx);

    return el(
      'label',
      { className: 'schema-switch-line' },
      el('input', {
        type: 'checkbox',
        className: 'schema-switch-input',
        checked: asBoolean(checked),
        disabled: asBoolean(resolveSchemaValue(node.disabled, ctx)),
        onChange: node.action
          ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
          : undefined
      }),
      el('span', { className: 'schema-switch-slider' }),
      stateText ? el('span', { className: 'schema-switch-state', text: asString(stateText) }) : null
    );
  }

  function isTableCellSchema<State, AppData>(
    value: TableCellSchema<State, AppData> | NodeSchema<State, AppData>
  ): value is TableCellSchema<State, AppData> {
    return Boolean(
      value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !('kind' in value) &&
        ('text' in value || 'node' in value)
    );
  }

  function renderTableCell(
    cell: TableCellSchema<State, AppData> | NodeSchema<State, AppData>
  ): HTMLElement {
    if (isTableCellSchema(cell)) {
      const typedCell = cell;
      const ctx = runtime.getContext();
      const contentNode = typedCell.node ? renderNode(typedCell.node) : null;
      return el(
        'td',
        {
          className: asString(resolveSchemaValue(typedCell.className, ctx) ?? '')
        },
        contentNode ?? asString(resolveSchemaValue(typedCell.text, ctx) ?? '')
      );
    }

    return el('td', {}, renderNode(cell));
  }

  function renderTable(node: TableNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const columns = resolveSchemaValue(node.columns, ctx) ?? [];
    const rows = resolveSchemaValue(node.rows, ctx) ?? [];

    return el(
      'div',
      {
        className: joinClassNames([
          'schema-table-wrap',
          asString(resolveSchemaValue(node.className, ctx) ?? '')
        ])
      },
      el(
        'table',
        { className: 'schema-table' },
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
              {
                className: asString(resolveSchemaValue(row.className, ctx) ?? '')
              },
              row.cells.map((cell) => renderTableCell(cell))
            )
          )
        )
      )
    );
  }

  function renderTokenRow(node: TokenRowNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const tokens = resolveSchemaValue(node.tokens, ctx) ?? [];
    return el(
      'div',
      {
        className: joinClassNames([
          'schema-token-row',
          asString(resolveSchemaValue(node.className, ctx) ?? '')
        ])
      },
      tokens.map((token) =>
        el('button', {
          type: 'button',
          className: 'schema-token',
          text: token,
          onMouseDown: (event: Event) => event.preventDefault(),
          onClick: node.action
            ? () => runtime.dispatch(node.action as ActionDescriptor, token)
            : undefined
        })
      )
    );
  }

  function renderWidget(node: WidgetSchema<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const host = el('div', {
      className: joinClassNames([
        'schema-widget-host',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    });
    const factory = runtime.getWidgetFactory(node.widgetType);
    if (!factory) {
      host.append(
        el('div', {
          className: 'schema-widget-missing',
          text: `[Missing widget] ${node.widgetType}`
        })
      );
      return host;
    }

    const widget = factory();
    const widgetRuntime: WidgetRuntime<State, AppData> = {
      getContext: runtime.getContext,
      dispatch: runtime.dispatch,
      requestRerender: runtime.requestRerender,
      mutate: runtime.mutate,
      ...(runtime.notifyDirty ? { notifyDirty: runtime.notifyDirty } : {}),
      ...(runtime.reportError ? { reportError: runtime.reportError } : {})
    };
    const resolvedProps = resolveSchemaValue(node.props, ctx);
    void widget.mount(host, resolvedProps, widgetRuntime);
    widgetInstances.add(widget);
    return host;
  }

  function renderRow(node: RowNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    return el(
      'div',
      {
        className: joinClassNames([
          'schema-row',
          asString(resolveSchemaValue(node.className, ctx) ?? '')
        ])
      },
      el(
        'div',
        { className: 'schema-row-label' },
        el('strong', { text: asString(resolveSchemaValue(node.title, ctx)) }),
        node.description
          ? el('span', { text: asString(resolveSchemaValue(node.description, ctx)) })
          : null
      ),
      el(
        'div',
        { className: 'schema-row-control' },
        toArray(node.control).map((item) => renderNode(item))
      )
    );
  }

  function renderCard(node: CardNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    return el(
      'section',
      {
        className: joinClassNames([
          'schema-card',
          asString(resolveSchemaValue(node.className, ctx) ?? '')
        ])
      },
      node.title || node.description || node.actions?.length
        ? el(
            'header',
            { className: 'schema-card-header' },
            el(
              'div',
              { className: 'schema-card-copy' },
              node.title ? el('h3', { text: asString(resolveSchemaValue(node.title, ctx)) }) : null,
              node.description
                ? el('p', { text: asString(resolveSchemaValue(node.description, ctx)) })
                : null
            ),
            node.actions?.length
              ? el(
                  'div',
                  { className: 'schema-card-actions' },
                  node.actions.map((item) => renderNode(item))
                )
              : null
          )
        : null,
      el(
        'div',
        { className: 'schema-card-body' },
        toArray(node.children).map((item) => renderNode(item))
      )
    );
  }

  function renderElement(node: ElementNode<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const attrs = node.attrs ?? {};
    const props: Record<string, unknown> = {
      className: asString(resolveSchemaValue(node.className, ctx) ?? '')
    };
    Object.entries(attrs).forEach(([key, value]) => {
      props[key] = asString(resolveSchemaValue(value, ctx));
    });
    if (node.text) {
      props.text = asString(resolveSchemaValue(node.text, ctx));
    }
    if (node.html) {
      props.html = asString(resolveSchemaValue(node.html, ctx));
    }
    return el(
      node.tag,
      props,
      toArray(node.children).map((child) => renderNode(child))
    );
  }

  function renderNode(node: NodeSchema<State, AppData>): HTMLElement {
    if (node === null || node === undefined || node === false) {
      return el('div');
    }

    if (typeof node === 'string' || typeof node === 'number') {
      return el('span', { text: String(node) });
    }

    switch (node.kind) {
      case 'group': {
        const ctx = runtime.getContext();
        return el(
          'section',
          {
            className: joinClassNames([
              'schema-group',
              asString(resolveSchemaValue(node.className, ctx) ?? '')
            ])
          },
          el('div', {
            className: 'schema-group-title',
            text: asString(resolveSchemaValue(node.title, ctx))
          }),
          el(
            'div',
            { className: 'schema-group-body' },
            toArray(node.children).map((item) => renderNode(item))
          )
        );
      }
      case 'card':
        return renderCard(node);
      case 'stack': {
        const ctx = runtime.getContext();
        return el(
          'div',
          {
            className: joinClassNames([
              'schema-stack',
              asString(resolveSchemaValue(node.className, ctx) ?? '')
            ])
          },
          toArray(node.children).map((item) => renderNode(item))
        );
      }
      case 'row':
        return renderRow(node);
      case 'field': {
        const ctx = runtime.getContext();
        return el(
          'div',
          {
            className: joinClassNames([
              'schema-field',
              asString(resolveSchemaValue(node.className, ctx) ?? '')
            ])
          },
          el('label', {
            className: 'schema-field-label',
            text: asString(resolveSchemaValue(node.label, ctx))
          }),
          el(
            'div',
            { className: 'schema-field-control' },
            toArray(node.control).map((item) => renderNode(item))
          )
        );
      }
      case 'input':
      case 'textarea':
        return renderInput(node);
      case 'select':
        return renderSelect(node);
      case 'switch':
        return renderSwitch(node);
      case 'button': {
        const ctx = runtime.getContext();
        return el('button', {
          type: 'button',
          className: joinClassNames([
            'schema-button',
            asString(resolveSchemaValue(node.variant, ctx) ?? ''),
            asString(resolveSchemaValue(node.className, ctx) ?? '')
          ]),
          text: asString(resolveSchemaValue(node.label, ctx)),
          onClick: node.action ? () => runtime.dispatch(node.action as ActionDescriptor) : undefined
        });
      }
      case 'notice': {
        const ctx = runtime.getContext();
        return el(
          'div',
          {
            className: joinClassNames([
              'schema-notice',
              asString(resolveSchemaValue(node.variant, ctx) ?? 'info'),
              asString(resolveSchemaValue(node.className, ctx) ?? '')
            ])
          },
          el('strong', { text: asString(resolveSchemaValue(node.title, ctx)) }),
          node.body ? el('p', { text: asString(resolveSchemaValue(node.body, ctx)) }) : null
        );
      }
      case 'table':
        return renderTable(node);
      case 'tokenRow':
        return renderTokenRow(node);
      case 'widget':
        return renderWidget(node);
      case 'element':
        return renderElement(node);
      default:
        return el('div');
    }
  }

  function renderView(view: ViewSchema<State, AppData>): HTMLElement {
    const customView = extensions.renderView?.(view);
    if (customView) {
      return customView;
    }

    const ctx = runtime.getContext();

    if (view.kind === 'modal') {
      return el(
        'div',
        {
          className: 'schema-modal-overlay',
          onClick: () => runtime.dispatch('resource:close')
        },
        el(
          'div',
          {
            className: joinClassNames(['schema-modal', view.size ?? 'medium']),
            role: 'dialog',
            ariaModal: 'true',
            onClick: (event: Event) => event.stopPropagation()
          },
          el(
            'div',
            { className: 'schema-modal-header' },
            el(
              'div',
              { className: 'schema-modal-copy' },
              view.title ? el('h3', { text: asString(resolveSchemaValue(view.title, ctx)) }) : null,
              view.description
                ? el('p', { text: asString(resolveSchemaValue(view.description, ctx)) })
                : null
            ),
            el('button', {
              type: 'button',
              className: 'schema-modal-close',
              text: '×',
              onClick: () => runtime.dispatch('resource:close')
            })
          ),
          el(
            'div',
            { className: 'schema-modal-body' },
            toArray(view.children).map((item) => renderNode(item))
          )
        )
      );
    }

    return el(
      'section',
      {
        className: joinClassNames([
          'schema-view',
          view.kind === 'standalone-page' ? 'standalone' : ''
        ])
      },
      renderHero(view),
      el(
        'div',
        { className: 'schema-view-body' },
        toArray(view.children).map((item) => renderNode(item))
      )
    );
  }

  return {
    collectWidgetState,
    renderView,
    dispose
  };
}
