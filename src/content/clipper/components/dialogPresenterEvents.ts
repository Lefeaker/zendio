import { getModifierLabel } from './dialogShortcuts';

export function applyReadonlyTextareaPresentation(textarea: HTMLTextAreaElement): void {
  textarea.readOnly = true;
  textarea.style.opacity = '0.8';
  textarea.setAttribute('aria-readonly', 'true');
}

export function renderShortcutHint(
  hintElement: HTMLDivElement,
  messages: {
    header: string;
    doubleEnterLabel: string;
    doubleEnterAction: string;
    modifierAction: string;
    escapeAction: string;
  },
  platform?: string
): void {
  hintElement.hidden = false;
  hintElement.innerHTML = `
      ${messages.header}<br>
      <strong>${messages.doubleEnterLabel}</strong> ${messages.doubleEnterAction} |
      <strong>${getModifierLabel('hint', platform)}</strong> ${messages.modifierAction} |
      <strong>Esc</strong> ${messages.escapeAction}
    `;
}

export function addButtonShortcutHints(
  dialog: ParentNode,
  messages: {
    doubleEnterAction: string;
    modifierAction: string;
    escapeAction: string;
  }
): void {
  const buttons = dialog.querySelectorAll<HTMLButtonElement>(
    '.clipper-dialog-actions .clipper-btn'
  );
  buttons.forEach((element) => {
    if (element.parentElement?.classList.contains('clipper-btn-wrapper')) {
      return;
    }

    let hintText = '';
    if (element.classList.contains('clipper-btn--ghost')) {
      hintText = messages.doubleEnterAction;
    } else if (element.classList.contains('clipper-btn--primary')) {
      hintText = messages.modifierAction;
    } else if (element.classList.contains('clipper-btn--secondary')) {
      hintText = messages.escapeAction;
    }

    if (!hintText) {
      return;
    }

    wrapButtonWithHint(element, hintText);
  });
}

function wrapButtonWithHint(element: HTMLButtonElement, hintText: string): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'clipper-btn-wrapper';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '4px';

  const parent = element.parentElement;
  if (!parent) {
    return;
  }

  parent.insertBefore(wrapper, element);
  wrapper.appendChild(element);

  const hint = document.createElement('div');
  hint.className = 'clipper-shortcut-hint';
  hint.textContent = hintText;
  hint.style.fontSize = '10px';
  hint.style.color = 'var(--accent-solid, #8B5CF6)';
  hint.style.textAlign = 'center';
  hint.style.fontWeight = '500';
  hint.style.opacity = '0.8';
  hint.style.whiteSpace = 'nowrap';
  wrapper.appendChild(hint);
}
