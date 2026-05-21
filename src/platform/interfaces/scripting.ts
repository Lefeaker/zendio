export type ScriptExecutionOptions = chrome.scripting.ScriptInjection<unknown[], unknown>;

export interface ScriptingService {
  executeScript(
    options: ScriptExecutionOptions
  ): Promise<chrome.scripting.InjectionResult<unknown>[] | void>;
}
