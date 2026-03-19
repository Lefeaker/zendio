import type { Messages, Language } from './locales';

export interface I18nResource {
  readonly language: Language;
  readonly messages: Messages;
  get<T extends keyof Messages>(key: T): Messages[T];
}

export interface I18nBindingHandle {
  dispose(): void;
}

export interface I18nBindingAdapter {
  bindText(element: HTMLElement, key: keyof Messages): I18nBindingHandle;
  bindAttribute(element: HTMLElement, attribute: string, key: keyof Messages): I18nBindingHandle;
  bindHtml(element: HTMLElement, key: keyof Messages): I18nBindingHandle;
  refresh(resource: I18nResource): void;
  clear(): void;
}

export interface I18nBinder {
  bindText(element: HTMLElement, key: keyof Messages): I18nBindingHandle;
  bindAttr(element: HTMLElement, attribute: string, key: keyof Messages): I18nBindingHandle;
  bindHtml(element: HTMLElement, key: keyof Messages): I18nBindingHandle;
}
