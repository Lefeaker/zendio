/**
 * Internationalization (i18n) utilities
 */

import { Language, messages, Messages } from './locales';

const DEFAULT_LANGUAGE: Language = 'zh-CN';

/**
 * Get the current language from storage
 */
export async function getCurrentLanguage(): Promise<Language> {
  try {
    const result = await chrome.storage.sync.get('language');
    return (result.language as Language) || DEFAULT_LANGUAGE;
  } catch (error) {
    console.error('Failed to get language:', error);
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Set the current language
 */
export async function setCurrentLanguage(language: Language): Promise<void> {
  try {
    await chrome.storage.sync.set({ language });
  } catch (error) {
    console.error('Failed to set language:', error);
  }
}

/**
 * Get messages for the current language
 */
export async function getMessages(): Promise<Messages> {
  const language = await getCurrentLanguage();
  return messages[language];
}

/**
 * Get a specific message by key
 */
export async function getMessage(key: keyof Messages): Promise<string> {
  const msgs = await getMessages();
  return msgs[key];
}

/**
 * Initialize i18n for a page
 * This function will:
 * 1. Load the current language
 * 2. Update all elements with data-i18n attribute
 * 3. Update all elements with data-i18n-placeholder attribute
 * 4. Update all elements with data-i18n-title attribute
 */
export async function initI18n(): Promise<void> {
  const msgs = await getMessages();
  
  // Update text content
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n') as keyof Messages;
    if (key && msgs[key]) {
      element.textContent = msgs[key];
    }
  });
  
  // Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder') as keyof Messages;
    if (key && msgs[key]) {
      (element as HTMLInputElement).placeholder = msgs[key];
    }
  });
  
  // Update titles
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title') as keyof Messages;
    if (key && msgs[key]) {
      element.setAttribute('title', msgs[key]);
    }
  });
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): Array<{ code: Language; name: string }> {
  return [
    { code: 'zh-CN', name: '简体中文' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
  ];
}

/**
 * Format a message with placeholders
 * Example: formatMessage("Hello {name}!", { name: "World" }) => "Hello World!"
 */
export function formatMessage(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}

