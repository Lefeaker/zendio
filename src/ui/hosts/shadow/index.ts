export * from './ShadowDialogHost';
export { ManagedShadowStyleHost } from '../../foundation/style-host';

export function createShadowHost(tag = 'div'): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  return { host, shadow };
}
