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
  const t = current.t ?? ((_key, fallback: string) => fallback);

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
          ? state(t('defaultVaultBadge', '默认'))
          : buttonNode(t('deleteVaultButton', '删除'), 'secondary', {
              id: 'storage:removeVault',
              args: [index]
            })
      }
    ]
  };
}

function localFolderCell(vault: VaultRecord, index: number, current: SchemaContext): NodeSchema {
  const t = current.t ?? ((_key, fallback: string) => fallback);
  const hasFolder = Boolean(vault.localFolderId);
  const isConfirming = current.state.activeLocalFolderVaultIndex === index;
  const chooseLocalFolderLabel = t('schemaStorageLocalFolderChooseAction', '选择目录');
  const deleteLocalFolderLabel = t('schemaStorageLocalFolderDeleteAction', '删除本地目录');
  const manageLocalFolderLabel = t('schemaStorageLocalFolderManageAction', '管理本地目录');
  const folderTitle = vault.localFolderName
    ? `${vault.localFolderName}\n${manageLocalFolderLabel}`
    : chooseLocalFolderLabel;
  const buttonLabel =
    hasFolder && isConfirming
      ? deleteLocalFolderLabel
      : vault.localFolderName || chooseLocalFolderLabel;
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
        title: hasFolder && isConfirming ? deleteLocalFolderLabel : folderTitle,
        ariaLabel:
          hasFolder && isConfirming
            ? deleteLocalFolderLabel
            : hasFolder
              ? `${vault.localFolderName}, ${manageLocalFolderLabel}`
              : chooseLocalFolderLabel,
        onClick: {
          id: buttonAction,
          args: [index]
        }
      },
      [buttonLabel]
    )
  ]);
}

export function routingField(
  index: number,
  field: keyof RoutingRule,
  value: string,
  current: SchemaContext
): NodeSchema {
  const t = current.t ?? ((_key, fallback: string) => fallback);

  return routingBoundInput(index, field, value, {
    mono: true,
    ...(field === 'pattern'
      ? {
          placeholder: t('rulePatternPlaceholder', '输入域名、关键词或 URL pattern')
        }
      : {})
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
  const t = current.t ?? ((_key, fallback: string) => fallback);

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
      { node: routingField(index, 'pattern', rule.pattern, current) },
      {
        node: routingBoundSelect(
          index,
          'target',
          rule.target,
          current.appData.storage.vaults.map((vault) => ({ value: vault.name, label: vault.name }))
        )
      },
      { node: routingPriorityInput(index, rule.priority) },
      buttonCell(t('deleteRuleButton', '删除'), 'secondary', {
        id: 'routing:remove',
        args: [index]
      })
    ]
  };
}
