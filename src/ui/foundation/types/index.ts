export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'error';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type InputValidationState = 'default' | 'success' | 'error';
export type DialogSize = 'md' | 'lg';
export type DismissReason = 'close-button' | 'backdrop' | 'escape' | 'programmatic';
export type MountLifecycle = 'mount' | 'update' | 'destroy';

export interface DataAttributes {
  [key: string]: string;
}

export interface MountableHost {
  mount(target?: HTMLElement): void;
  update?(): void;
  destroy(): void;
}
