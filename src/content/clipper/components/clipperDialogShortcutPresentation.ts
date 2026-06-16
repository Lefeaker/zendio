import type { Messages } from '@i18n';
import {
  addButtonShortcutHints,
  applyReadonlyTextareaPresentation,
  renderShortcutHint
} from './dialogPresenter';
import { getModifierLabel } from './dialogShortcuts';

interface DialogMessageResolver {
  getMessage<Key extends keyof Messages>(this: void, key: Key, fallback: string): string;
  getFallback<Key extends keyof Messages>(this: void, key: Key): string;
}

export function syncClipperTextareaHeight(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) {
    return;
  }

  const style = getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const padding =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const border =
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  const oneLineHeight = Math.ceil(lineHeight + padding + border);
  const twoLineHeight = Math.ceil(lineHeight * 2 + padding + border);

  textarea.style.height = `${oneLineHeight}px`;
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, oneLineHeight), twoLineHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > twoLineHeight ? 'auto' : 'hidden';
}

export function makeClipperTextareaReadonly(textarea: HTMLTextAreaElement | null): void {
  if (textarea) {
    applyReadonlyTextareaPresentation(textarea);
  }
}

export function renderClipperShortcutHint(
  hintElement: HTMLDivElement | null,
  resolver: DialogMessageResolver
): void {
  if (!hintElement) {
    return;
  }

  renderShortcutHint(hintElement, {
    header: resolver.getMessage(
      'clipperCommentEditCompleted',
      resolver.getFallback('clipperCommentEditCompleted')
    ),
    doubleEnterLabel: resolver.getMessage(
      'clipperShortcutHintDoubleEnter',
      resolver.getFallback('clipperShortcutHintDoubleEnter')
    ),
    doubleEnterAction: resolver.getMessage(
      'clipperShortcutDoubleEnter',
      resolver.getFallback('clipperShortcutDoubleEnter')
    ),
    modifierAction: resolver.getMessage(
      'clipperShortcutHintModifierEnter',
      resolver.getFallback('clipperShortcutHintModifierEnter')
    ),
    escapeAction: resolver.getMessage(
      'clipperShortcutHintEscape',
      resolver.getFallback('clipperShortcutHintEscape')
    )
  });
  hintElement.style.display = '';
}

export function addClipperButtonShortcutHints(
  dialogSurface: HTMLDivElement | null,
  resolver: DialogMessageResolver
): void {
  if (!dialogSurface) {
    return;
  }

  addButtonShortcutHints(dialogSurface, {
    doubleEnterAction: resolver.getMessage(
      'clipperShortcutDoubleEnter',
      resolver.getFallback('clipperShortcutDoubleEnter')
    ),
    modifierAction: getModifierLabel('button'),
    escapeAction: resolver.getMessage(
      'clipperShortcutEsc',
      resolver.getFallback('clipperShortcutEsc')
    )
  });
}
