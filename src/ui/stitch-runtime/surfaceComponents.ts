import { el } from './dom';
import type { SurfaceAction } from './types/surfaceTypes';

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
  dataset?: Record<string, string | number | boolean> | undefined;
  onInput?: ((event: Event) => void) | undefined;
  onChange?: ((event: Event) => void) | undefined;
  onFocus?: ((event: Event) => void) | undefined;
  onBlur?: ((event: Event) => void) | undefined;
}

function Badge(label: string, variant = ''): HTMLSpanElement {
  return el('span', { className: ['badge', variant].filter(Boolean).join(' '), text: label });
}

function Pill(label: string): HTMLSpanElement {
  return el('span', { className: 'pill', text: label });
}

function Button(label: string, options: RuntimeButtonOptions = {}): HTMLButtonElement {
  return el(
    'button',
    {
      type: 'button',
      className: ['btn', options.variant].filter(Boolean).join(' '),
      disabled: options.disabled,
      onMousedown: (event: MouseEvent) => event.preventDefault(),
      onClick: options.onClick
    },
    el('span', { text: label })
  );
}

function Input(value: string | number, options: RuntimeInputOptions = {}): HTMLInputElement {
  return el('input', {
    className: ['input', options.mono ? 'code' : '', options.className || '']
      .filter(Boolean)
      .join(' '),
    value,
    type: options.type || 'text',
    placeholder: options.placeholder,
    disabled: options.disabled,
    readOnly: options.readOnly,
    min: options.min,
    max: options.max,
    step: options.step,
    dataset: options.dataset,
    onInput: options.onInput,
    onChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: options.onBlur,
    onClick: options.onClick,
    onKeyup: options.onKeyUp,
    onSelect: options.onSelect,
    onMouseenter: options.onMouseEnter
  });
}

function Textarea(
  value: string | number,
  options: RuntimeTextareaOptions = {}
): HTMLTextAreaElement {
  return el('textarea', {
    className: ['textarea', options.className || ''].filter(Boolean).join(' '),
    value,
    placeholder: options.placeholder,
    disabled: options.disabled,
    dataset: options.dataset,
    onInput: options.onInput,
    onChange: options.onChange,
    onFocus: options.onFocus,
    onBlur: options.onBlur
  });
}

export const surfaceComponents = { Badge, Pill, Button, Input, Textarea } as const;
