export type ScriptExecutionWorld = 'ISOLATED' | 'MAIN';

export interface ScriptInjectionTarget {
  tabId: number;
  allFrames?: boolean;
  frameIds?: number[];
  documentIds?: string[];
}

type ScriptExecutionCommonOptions = {
  target: ScriptInjectionTarget;
  world?: ScriptExecutionWorld;
  injectImmediately?: boolean;
};

type ScriptFunctionInjectionOptions = ScriptExecutionCommonOptions & {
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type ScriptFileInjectionOptions = ScriptExecutionCommonOptions & {
  files: string[];
};

export type ScriptExecutionOptions = ScriptFunctionInjectionOptions | ScriptFileInjectionOptions;

export interface ScriptExecutionResult<TResult = unknown> {
  documentId?: string;
  frameId: number;
  result?: TResult;
}

export interface ScriptingService {
  executeScript(options: ScriptExecutionOptions): Promise<ScriptExecutionResult[] | void>;
}
