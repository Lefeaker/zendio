import type { ScriptExecutionOptions, ScriptingService } from '../interfaces/scripting';
import { ensureFirefox } from './utils';

type FirefoxScriptInjection = Parameters<typeof browser.scripting.executeScript>[0];

function buildFallbackCode(options: ScriptExecutionOptions): string | undefined {
  if (!('func' in options) || typeof options.func !== 'function') {
    return undefined;
  }
  const args = 'args' in options && Array.isArray(options.args) ? options.args : [];
  const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(',');
  return `(${options.func.toString()})(${serializedArgs})`;
}

export const firefoxScriptingService: ScriptingService = {
  async executeScript(options: ScriptExecutionOptions): Promise<chrome.scripting.InjectionResult<unknown>[] | void> {
    const firefoxApi = ensureFirefox();

    if (firefoxApi.scripting?.executeScript) {
      const results = await firefoxApi.scripting.executeScript(options as FirefoxScriptInjection);
      return results as unknown as chrome.scripting.InjectionResult<unknown>[];
    }

    if (firefoxApi.tabs?.executeScript && options.target?.tabId !== undefined) {
      const frameId = options.target.frameIds?.[0];

      if (options.files && options.files.length > 0) {
        for (const file of options.files) {
          await firefoxApi.tabs.executeScript(options.target.tabId, { file, frameId });
        }
      }

      const inlineCode = buildFallbackCode(options);
      if (inlineCode) {
        await firefoxApi.tabs.executeScript(options.target.tabId, { code: inlineCode, frameId });
      }

      return;
    }

    throw new Error('Firefox scripting API is unavailable');
  }
};
