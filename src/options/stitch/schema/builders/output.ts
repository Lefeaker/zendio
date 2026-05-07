import type { NodeSchema, SchemaContext, YamlDomainRule } from '../../types';
import { code, div, element, stack } from './primitives';
import { classNames } from './classNames';
import { codeOutputBox, sectionHelper } from './chrome';
import { templateBoundInput } from './controls';

export function templateInput(field: string): NodeSchema {
  return templateBoundInput(field);
}

export function templateTokenBlock(): NodeSchema {
  return stack(
    [
      sectionHelper('将鼠标放到上方任一路径输入框，再点击下方字段快速插入。', 'template-helper'),
      {
        kind: 'tokenRow',
        tokens: (current: SchemaContext) => current.appData.output.tokens,
        action: { id: 'template:insertToken' }
      }
    ],
    'u-mt-block'
  );
}

export function yamlFilterTabs(): NodeSchema {
  return element(
    'div',
    {
      className: classNames.yaml.filterRow,
      role: 'tablist',
      ariaLabel: 'YAML filter'
    },
    (current: SchemaContext) =>
      current.appData.output.yamlFilters.map((filter) =>
        element('button', {
          type: 'button',
          className: [
            classNames.yaml.filter,
            current.state.yamlFilter === filter.value ? classNames.yaml.active : ''
          ]
            .filter(Boolean)
            .join(' '),
          text: filter.label,
          onClick: { id: 'yaml:setFilter', args: [filter.value] }
        })
      )
  );
}

export function yamlStateCell(
  field: string,
  mode: string,
  fallbackState: string | undefined
): { node: NodeSchema } {
  const stateLabel = (current: SchemaContext) =>
    current.state.yamlFieldStates[`${field}:${mode}`] ?? fallbackState ?? 'Off';

  return {
    node: element('button', {
      type: 'button',
      className: (current: SchemaContext) =>
        [classNames.yaml.check, stateLabel(current) === 'On' ? classNames.yaml.checkOn : '']
          .filter(Boolean)
          .join(' '),
      text: stateLabel,
      disabled: true
    })
  };
}

export function yamlDomainRule(rule: YamlDomainRule): NodeSchema {
  return element('div', { className: classNames.yaml.domainRule }, [
    div(classNames.yaml.ruleMeta, [
      { kind: 'badge', label: rule.typeLabel },
      { kind: 'pill', label: rule.domain }
    ]),
    element('strong', { text: 'Domain Override' }),
    {
      kind: 'table',
      columns: ['Field', 'Enabled', 'Value Path', 'Default'],
      rows: rule.rows.map((row) => ({
        cells: [
          { node: code(row[0]) },
          {
            node: element('span', {
              className: [classNames.yaml.check, classNames.yaml.checkOn].join(' '),
              text: row[1]
            })
          },
          { node: code(row[2]) },
          { text: row[3] }
        ]
      }))
    }
  ]);
}

export function yamlPreviewBlock(): NodeSchema {
  return {
    kind: 'details',
    summary: 'Preview',
    className: 'u-mt-block',
    children: [
      codeOutputBox(
        (current: SchemaContext) => current.appData.output.yamlPreview,
        classNames.yaml.preview
      )
    ]
  };
}
