export const COMMENT_FORM_CLASSES = {
  container: 'clipper-comment-form max-h-[calc(80vh-100px)] overflow-y-auto px-7 py-6',
  preview:
    'clipper-comment-preview mb-6 max-h-[150px] overflow-y-auto rounded-xl border border-base-300 bg-base-200/70 border-l-4 border-l-primary/70 px-[22px] py-[14px] text-sm leading-relaxed text-base-content/75',
  label: 'clipper-comment-label mb-3 block text-sm font-medium text-base-content',
  textarea:
    'clipper-comment-textarea textarea textarea-bordered mb-6 min-h-[120px] w-full resize-y text-sm leading-relaxed',
  completedHint: 'clipper-comment-completed-hint mt-2 hidden text-xs text-base-content/70'
} as const;
