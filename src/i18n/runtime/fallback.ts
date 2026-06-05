import { getLanguageFallbackChain, resolveLanguage, type LangCode } from '../config';

export interface LanguageFallbackPolicy {
  getLanguageFallbackChain(input?: string): LangCode[];
  resolveLanguage(input?: string): LangCode;
}

export function createLanguageFallbackPolicy(
  overrides: Partial<LanguageFallbackPolicy> = {}
): LanguageFallbackPolicy {
  return {
    getLanguageFallbackChain: overrides.getLanguageFallbackChain ?? getLanguageFallbackChain,
    resolveLanguage: overrides.resolveLanguage ?? resolveLanguage
  };
}

const defaultLanguageFallbackPolicy = createLanguageFallbackPolicy();

export function getRuntimeLanguageFallbackChain(input?: string): LangCode[] {
  return defaultLanguageFallbackPolicy.getLanguageFallbackChain(input);
}

export function resolveRuntimeLanguage(input?: string): LangCode {
  return defaultLanguageFallbackPolicy.resolveLanguage(input);
}
