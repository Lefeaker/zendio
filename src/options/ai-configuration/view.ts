import type { Messages } from '@i18n';
import { createPrimitiveButtonElement } from '@ui/primitives/button';
import { createTextareaElement } from '@ui/primitives/textarea';
import { createInputElement } from '@ui/primitives/input';
import type { AiConfigChange, AiConfigReview } from './types';
import { AI_CONFIG_VALUE_LABELS } from './catalog';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '') {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
function display(value: AiConfigChange['before'], field: string, m: Messages): string {
  if (value === undefined || value === null || value === '') return m.aiConfigNotSet;
  const label = typeof value === 'string' ? AI_CONFIG_VALUE_LABELS[field]?.[value] : undefined;
  if (label) return m[label];
  if (typeof value === 'boolean')
    return value ? m.schemaCommonEnabledState : m.schemaCommonDisabledState;
  if (field === 'fragmentClipper.selectionModifierKeys' && Array.isArray(value))
    return value
      .map((key) => String(key).replace(/^./, (letter) => letter.toUpperCase()))
      .join(' + ');
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function createAiConfigView(actions: {
  copy: () => void;
  input: () => void;
  refresh: () => void;
  apply: () => void;
  undo: () => void;
  copyError: () => void;
  prompt: () => void;
}) {
  const root = node('section', 'card ai-config-widget');
  root.id = 'aiConfiguration';
  const title = node('h2');
  title.id = 'aiConfigHeading';
  root.setAttribute('aria-labelledby', title.id);
  const description = node('p', 'ai-config-description');
  const button = (id: string, action: () => void, primary = false) => {
    const element = createPrimitiveButtonElement({
      label: '',
      onClick: action,
      classSlots: ['btn', primary ? 'primary' : 'secondary']
    });
    element.id = id;
    return element;
  };
  const copy = button('aiConfigCopy', actions.copy);
  const include = createInputElement({
    type: 'checkbox',
    id: 'aiConfigIncludeCurrent',
    classSlots: ['ai-config-checkbox'],
    onNativeChange: actions.prompt
  });
  const includeLabel = node('label', 'ai-config-include');
  includeLabel.htmlFor = include.id;
  const includeText = node('span');
  includeLabel.append(include, includeText);
  const promptDetails = node('details');
  const promptSummary = node('summary');
  const prompt = createTextareaElement({
    id: 'aiConfigPrompt',
    rows: 7,
    readOnly: true,
    classSlots: ['ai-config-textarea']
  });
  promptDetails.append(promptSummary, prompt);
  promptDetails.addEventListener('toggle', () => {
    if (promptDetails.open) actions.prompt();
  });
  const inputLabel = node('label', 'ai-config-input-label');
  inputLabel.htmlFor = 'aiConfigInput';
  const input = createTextareaElement({
    id: 'aiConfigInput',
    rows: 7,
    classSlots: ['ai-config-textarea'],
    onInput: actions.input
  });
  input.spellcheck = false;
  input.setAttribute('aria-describedby', 'aiConfigStatus');
  const status = node('p', 'ai-config-status');
  status.id = 'aiConfigStatus';
  status.setAttribute('role', 'status');
  const diff = node('div', 'ai-config-diff');
  diff.id = 'aiConfigChanges';
  const apply = button('aiConfigApply', actions.apply, true);
  const refresh = button('aiConfigRefresh', actions.refresh);
  const undo = button('aiConfigUndo', actions.undo);
  const copyError = button('aiConfigCopyError', actions.copyError);
  const buttons = node('div', 'ai-config-actions');
  buttons.append(apply, refresh, undo, copyError);
  const manual = node('p', 'ai-config-description');
  const manualLink = node('a');
  manualLink.href = 'index.html?guide=vault#section-storage';
  manualLink.target = '_blank';
  manualLink.rel = 'noopener';
  root.append(
    title,
    description,
    copy,
    includeLabel,
    promptDetails,
    inputLabel,
    input,
    status,
    diff,
    buttons,
    manual,
    manualLink
  );
  let renderedRows: AiConfigChange[] | undefined;
  let renderedMessages: Messages | undefined;
  return {
    root,
    input,
    include,
    prompt,
    promptDetails,
    render(
      m: Messages,
      state: {
        review?: AiConfigReview | undefined;
        busy: boolean;
        undo: boolean;
        feedback: string;
        error: boolean;
      }
    ) {
      title.textContent = m.aiConfigTitle;
      description.textContent = m.aiConfigDescription;
      copy.textContent = m.aiConfigCopy;
      includeText.textContent = m.aiConfigIncludeCurrent;
      promptSummary.textContent = m.aiConfigShowPrompt;
      prompt.setAttribute('aria-label', m.aiConfigShowPrompt);
      inputLabel.textContent = m.aiConfigPaste;
      input.placeholder = m.aiConfigPasteHint;
      input.setAttribute(
        'aria-invalid',
        String(Boolean(input.value.trim()) && state.error && !state.review)
      );
      status.textContent = state.feedback;
      status.classList.toggle('is-error', state.error);
      status.setAttribute('role', state.error ? 'alert' : 'status');
      const count = state.review?.rows.length ?? 0;
      apply.textContent = m.aiConfigApply.replace('{count}', String(count));
      refresh.textContent = m.aiConfigRefresh;
      undo.textContent = m.aiConfigUndo;
      copyError.textContent = m.aiConfigCopyError;
      input.disabled = include.disabled = state.busy;
      for (const control of [copy, apply, refresh, undo, copyError]) control.disabled = state.busy;
      apply.disabled = state.busy || count === 0;
      apply.setAttribute('aria-busy', String(state.busy));
      undo.hidden = !state.undo;
      copyError.hidden = !state.error;
      manual.textContent = m.aiConfigManual;
      manualLink.textContent = m.settingsConnectVault;
      if (renderedRows === state.review?.rows && renderedMessages === m) return;
      renderedRows = state.review?.rows;
      renderedMessages = m;
      diff.replaceChildren(
        ...(renderedRows ?? []).map((change) => {
          const row = node('div', 'ai-config-change');
          row.dataset.field = change.field;
          const heading = node('strong', 'ai-config-field');
          heading.textContent = m[change.label];
          row.append(heading);
          for (const [caption, value] of [
            [m.aiConfigBefore, change.before],
            [m.aiConfigAfter, change.after]
          ]) {
            const cell = node('div');
            const label = node('p', 'ai-config-caption');
            label.textContent = String(caption);
            const content = node('pre');
            content.textContent = display(value, change.field, m);
            cell.append(label, content);
            row.append(cell);
          }
          return row;
        })
      );
    }
  };
}
