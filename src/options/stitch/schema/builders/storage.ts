import type {
  NodeSchema,
  RoutingRule,
  SchemaContext,
  TableRowSchema,
  VaultRecord
} from '../../types';
import { buttonNode, state, stack } from './primitives';
import { buttonCell, switchCell } from './table';
import { boundInput, boundSwitch, routingBoundInput, routingBoundSelect } from './controls';

export function vaultRow(vault: VaultRecord, index: number): TableRowSchema {
  return {
    cells: [
      switchCell(
        boundSwitch({
          checked: vault.isDefault ? true : vault.enabled,
          disabled: vault.isDefault,
          onChange: {
            id: 'storage:updateVaultField',
            args: [index, 'enabled'],
            valueFrom: 'target.checked'
          },
          compact: true
        })
      ),
      {
        node: stack([
          {
            kind: 'input',
            value: vault.name,
            onInput: {
              id: 'storage:updateVaultField',
              args: [index, 'name'],
              valueFrom: 'target.value'
            }
          }
        ])
      },
      {
        node: {
          kind: 'input',
          value: vault.https,
          mono: true,
          onInput: {
            id: 'storage:updateVaultField',
            args: [index, 'https'],
            valueFrom: 'target.value'
          }
        }
      },
      {
        node: {
          kind: 'input',
          value: vault.http,
          mono: true,
          onInput: {
            id: 'storage:updateVaultField',
            args: [index, 'http'],
            valueFrom: 'target.value'
          }
        }
      },
      {
        node: {
          kind: 'input',
          value: vault.key,
          mono: true,
          type: 'password',
          onInput: {
            id: 'storage:updateVaultField',
            args: [index, 'key'],
            valueFrom: 'target.value'
          }
        }
      },
      {
        node: vault.isDefault
          ? state('默认')
          : buttonNode('删除', 'secondary', { id: 'storage:removeVault', args: [index] })
      }
    ]
  };
}

export function routingField(index: number, field: keyof RoutingRule, value: string): NodeSchema {
  return routingBoundInput(index, field, value, {
    mono: true,
    ...(field === 'pattern' ? { placeholder: '输入域名、关键词或 URL pattern' } : {})
  });
}

export function routingPriorityInput(index: number, value: RoutingRule['priority']): NodeSchema {
  return boundInput({
    value: String(value),
    mono: true,
    type: 'number',
    min: 0,
    step: 10,
    onChange: {
      id: 'routing:updatePriority',
      args: [index],
      valueFrom: 'target.value',
      transform: (rawValue) => (rawValue === '' ? '' : Number(rawValue))
    }
  });
}

export function routingRuleRow(
  rule: RoutingRule,
  index: number,
  current: SchemaContext
): TableRowSchema {
  return {
    cells: [
      switchCell(
        boundSwitch({
          checked: rule.enabled,
          compact: true,
          onChange: {
            id: 'routing:updateField',
            args: [index, 'enabled'],
            valueFrom: 'target.checked'
          }
        })
      ),
      {
        node: routingBoundSelect(
          index,
          'type',
          rule.type,
          current.appData.storage.routingTypeOptions
        )
      },
      { node: routingField(index, 'pattern', rule.pattern) },
      {
        node: routingBoundSelect(
          index,
          'target',
          rule.target,
          current.appData.storage.vaults.map((vault) => ({ value: vault.name, label: vault.name }))
        )
      },
      { node: routingPriorityInput(index, rule.priority) },
      buttonCell('删除', 'secondary', { id: 'routing:remove', args: [index] })
    ]
  };
}
