import type { NodeSchema } from './contracts';
import { el } from './dom';
import { renderInput, renderSelect, renderSwitch } from './rendererControls';
import { renderElement } from './rendererElementNode';
import { type RenderNode, type SchemaRendererRuntime } from './rendererContext';
import {
  renderButton,
  renderCard,
  renderField,
  renderGroup,
  renderNotice,
  renderRow,
  renderStack,
  renderTokenRow
} from './rendererStructuralNodes';
import { renderTable } from './rendererTable';
import type { RendererWidgetLifecycle } from './rendererWidgetLifecycle';

export function createRendererNodeDispatcher<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  widgetLifecycle: RendererWidgetLifecycle<State, AppData>
): RenderNode<State, AppData> {
  function renderNode(node: NodeSchema<State, AppData>): HTMLElement {
    if (node === null || node === undefined || node === false) {
      return el('div');
    }

    if (typeof node === 'string' || typeof node === 'number') {
      return el('span', { text: String(node) });
    }

    switch (node.kind) {
      case 'group':
        return renderGroup(runtime, renderNode, node);
      case 'card':
        return renderCard(runtime, renderNode, node);
      case 'stack':
        return renderStack(runtime, renderNode, node);
      case 'row':
        return renderRow(runtime, renderNode, node);
      case 'field':
        return renderField(runtime, renderNode, node);
      case 'input':
      case 'textarea':
        return renderInput(runtime, node);
      case 'select':
        return renderSelect(runtime, node);
      case 'switch':
        return renderSwitch(runtime, node);
      case 'button':
        return renderButton(runtime, node);
      case 'notice':
        return renderNotice(runtime, node);
      case 'table':
        return renderTable(runtime, renderNode, node);
      case 'tokenRow':
        return renderTokenRow(runtime, node);
      case 'widget':
        return widgetLifecycle.renderWidget(node);
      case 'element':
        return renderElement(runtime, renderNode, node);
      default:
        return el('div');
    }
  }

  return renderNode;
}
