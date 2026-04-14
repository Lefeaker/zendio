import { createOptionsMessageList } from '../../primitives/layout';

export function buildYamlErrorList(className: string, errors: string[]): HTMLElement {
  return createOptionsMessageList(errors, { className });
}
