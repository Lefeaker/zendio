export interface CssSelectorIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
}
export const CSS_PATTERNS: string[];
export function lintCssSource(css: string, file: string): CssSelectorIssue[];
export function lintCssFiles(
  patterns?: string[],
  cwd?: string
): {
  files: string[];
  issues: CssSelectorIssue[];
};
