export const DESIGN_TOKEN_SOURCE = 'src/styles/design-tokens.css';
export const REMOVED_OPTIONS_TOKEN_WRAPPER = 'src/options/styles/design-tokens.css';

export function isLegacyOptionsTokenWrapperRemoved(wrapperPath: string): boolean {
  return wrapperPath === REMOVED_OPTIONS_TOKEN_WRAPPER;
}
