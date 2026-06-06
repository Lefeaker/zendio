import type {
  NodeSchema,
  RoutingRule,
  SchemaContext,
  TableRowSchema,
  VaultRecord
} from '../../types';
import { buttonNode, element, state, stack } from './primitives';
import { buttonCell, switchCell } from './table';
import { boundInput, boundSwitch, routingBoundInput, routingBoundSelect } from './controls';

export function vaultRow(
  vault: VaultRecord,
  index: number,
  current: SchemaContext
): TableRowSchema {
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
        node: localFolderCell(vault, index, current)
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

function localFolderCell(vault: VaultRecord, index: number, current: SchemaContext): NodeSchema {
  const hasFolder = Boolean(vault.localFolderId);
  const isConfirming = current.state.activeLocalFolderVaultIndex === index;
  const folderTitle = vault.localFolderName
    ? `${vault.localFolderName}\nChrome File System Access 不暴露完整本地路径。`
    : '选择本地目录';
  const buttonLabel =
    hasFolder && isConfirming ? '删除本地目录' : vault.localFolderName || '选择目录';
  const buttonAction =
    hasFolder && isConfirming ? 'storage:deleteLocalFolder' : 'storage:activateLocalFolder';

  return element('div', { className: 'local-folder-cell' }, [
    element(
      'button',
      {
        className: [
          'btn',
          hasFolder && isConfirming ? 'danger' : 'secondary',
          'local-folder-trigger',
          hasFolder && !isConfirming ? 'is-selected' : '',
          hasFolder && isConfirming ? 'is-delete' : ''
        ]
          .filter(Boolean)
          .join(' '),
        type: 'button',
        title: hasFolder && isConfirming ? '删除本地目录' : folderTitle,
        ariaLabel:
          hasFolder && isConfirming
            ? '删除本地目录'
            : hasFolder
              ? `${vault.localFolderName}，点击管理本地目录`
              : '选择本地目录',
        onClick: {
          id: buttonAction,
          args: [index]
        }
      },
      [buttonLabel]
    )
  ]);
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
