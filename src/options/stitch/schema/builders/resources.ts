import type {
  ChangelogEntry,
  DynamicValue,
  NodeChild,
  NodeSchema,
  ResourceStep,
  SupportChannel
} from '../../types';
import { div, element, grid, span, strong } from './primitives';
import { classNames } from './classNames';

export function resourceModalStack(children: DynamicValue<NodeChild[]>): NodeSchema {
  return div('resource-modal-stack', children);
}

export function resourceCardGrid(
  children: DynamicValue<NodeChild[]>,
  columns: 2 | 3 = 2,
  className = 'resource-card-grid single-row'
): NodeSchema {
  return grid(columns, children, className);
}

export function resourceCard(item: SupportChannel): NodeSchema {
  return {
    kind: 'resourceCard',
    title: item.title,
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    ...(item.detail ? { detail: item.detail } : {}),
    ...(item.note ? { note: item.note } : {}),
    ...(item.href ? { href: item.href } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(item.imageAlt ? { imageAlt: item.imageAlt } : {}),
    ...(item.imagePresentation ? { imagePresentation: item.imagePresentation } : {})
  };
}

export function heroPills(pills: string[]): NodeSchema {
  return div(
    'hero-pills',
    pills.map((pill) => ({ kind: 'pill', label: pill }))
  );
}

export function modalSection(title: string, children: NodeChild[]): NodeSchema {
  return element('section', { className: classNames.resource.modalSection }, [
    element('div', { className: classNames.resource.modalSectionTitle, text: title }),
    ...children
  ]);
}

export function modalSectionRaw(children: DynamicValue<NodeChild[]>): NodeSchema {
  return element('section', { className: classNames.resource.modalSection }, children);
}

export function modalSectionHead(title: string, action: NodeSchema): NodeSchema {
  return div(classNames.resource.modalSectionHead, [
    element('div', { className: classNames.resource.modalSectionTitle, text: title }),
    action
  ]);
}

export function stepGrid(children: DynamicValue<NodeChild[]>, compact = false): NodeSchema {
  return grid(2, children, ['step-grid', compact ? 'compact' : ''].filter(Boolean).join(' '));
}

export function stepCard(step: ResourceStep): NodeSchema {
  return element('article', { className: 'step-card' }, [
    div('step-header-inline', [
      step.number ? span('step-index', step.number) : null,
      div('step-copy', [
        strong(step.title),
        step.description ? element('p', { text: step.description }) : null
      ])
    ]),
    step.bullets?.length ? { kind: 'list', compact: true, items: step.bullets } : null
  ]);
}

export function releaseCard(entry: ChangelogEntry): NodeSchema {
  return element('article', { className: 'release-card' }, [
    div('release-header', [strong(entry.version), span('release-date', entry.date)]),
    entry.summary ? element('p', { className: 'release-summary', text: entry.summary }) : null,
    { kind: 'list', items: entry.bullets, compact: true }
  ]);
}
