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
  getRegisteredContentScripts?(filter: { ids: string[] }): Promise<RegisteredContentScript[]>;
  registerContentScripts?(
    scripts: Array<RegisteredContentScript & { js: string[]; matches: string[] }>
  ): Promise<void>;
  unregisterContentScripts?(filter: { ids: string[] }): Promise<void>;
}

export interface RegisteredContentScript {
  id: string;
  js?: string[] | undefined;
  matches?: string[] | undefined;
  allFrames?: boolean | undefined;
  runAt?: 'document_start' | 'document_end' | 'document_idle' | undefined;
  persistAcrossSessions?: boolean | undefined;
}
