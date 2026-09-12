import { el } from './dom';
import type { SurfaceAction } from './types/surfaceTypes';
import { createBadgeElement } from '../primitives/badge';
import { createPrimitiveButtonElement } from '../primitives/button';
import { createInputElement } from '../primitives/input';
import { createTextareaElement } from '../primitives/textarea';

export interface RuntimeButtonOptions {
  variant?: SurfaceAction['variant'] | undefined;
  disabled?: boolean | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
}

export interface RuntimeInputOptions {
  mono?: boolean | undefined;
  className?: string | undefined;
  type?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  min?: string | number | undefined;
  max?: string | number | undefined;
  step?: string | number | undefined;
  dataset?: Record<string, string | number | boolean> | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onBlur?: ((event: Event) => void) | undefined;
  onClick?: ((event: MouseEvent) => void) | undefined;
  onKeyUp?: ((event: KeyboardEvent) => void) | undefined;
  onSelect?: ((event: Event) => void) | undefined;
  onMouseEnter?: ((event: MouseEvent) => void) | undefined;
}

export interface RuntimeTextareaOptions {
  className?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  dataset?: Record<string, string | number | boolean> | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onBlur?: ((event: Event) => void) | undefined;
}

function Badge(label: string, variant = ''): HTMLSpanElement {
  return createBadgeElement({ label, classSlots: ['badge', variant] });
}

function Pill(label: string): HTMLSpanElement {
  return el('span', { className: 'pill', text: label });
}

function Button(label: string, options: RuntimeButtonOptions = {}): HTMLButtonElement {
  return createPrimitiveButtonElement({
    label,
    disabled: options.disabled,
    onClick: options.onClick,
    classSlots: ['btn', options.variant ?? ''],
    onMouseDown: (event) => event.preventDefault()
  });
}

function Input(value: string | number, options: RuntimeInputOptions = {}): HTMLInputElement {
  return createInputElement({
    value: String(value),
    classSlots: ['input', options.mono ? 'code' : '', options.className || ''],
    type: options.type || 'text',
    placeholder: options.placeholder,
    disabled: options.disabled,
    readOnly: options.readOnly,
    min: options.min,
    max: options.max,
    step: options.step,
    dataset: options.dataset,
    onInput: options.onInput,
    onNativeChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: (_value, event) => options.onBlur?.(event),
    onClick: options.onClick,
    onKeyUp: options.onKeyUp,
    onSelect: options.onSelect,
    onMouseEnter: options.onMouseEnter
  });
}

function Textarea(
  value: string | number,
  options: RuntimeTextareaOptions = {}
): HTMLTextAreaElement {
  return createTextareaElement({
    classSlots: ['textarea', options.className || ''],
    value: String(value),
    placeholder: options.placeholder,
    disabled: options.disabled,
    dataset: options.dataset,
    onInput: options.onInput,
    onNativeChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: (_value, event) => options.onBlur?.(event)
  });
}

export const surfaceComponents = { Badge, Pill, Button, Input, Textarea } as const;
