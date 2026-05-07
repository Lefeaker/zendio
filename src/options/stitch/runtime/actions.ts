export const STITCH_ACTIONS = {
  setTheme: 'preview:setTheme'
} as const;

export type StitchActionId = (typeof STITCH_ACTIONS)[keyof typeof STITCH_ACTIONS];
