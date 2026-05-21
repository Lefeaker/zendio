export const STATE_KEYS = {
  options: 'core.options',
  vaultRouter: 'core.vaultRouter',
  aiChatOptions: 'content.aiChat.options'
} as const;

export type StateKey = (typeof STATE_KEYS)[keyof typeof STATE_KEYS];
