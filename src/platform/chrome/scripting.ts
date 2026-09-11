import type { ScriptExecutionOptions, ScriptingService } from '../interfaces/scripting';
import { ensureChrome, getChromeLastError, normalizePromise } from './utils';

export const chromeScriptingService: ScriptingService = {
  getRegisteredContentScripts: (filter) =>
    ensureChrome().scripting.getRegisteredContentScripts(filter),
  registerContentScripts: (scripts) => ensureChrome().scripting.registerContentScripts(scripts),
  unregisterContentScripts: (filter) => ensureChrome().scripting.unregisterContentScripts(filter),
  async executeScript(options: ScriptExecutionOptions) {
    const chromeApi = ensureChrome();
    if (!chromeApi.scripting?.executeScript) {
      throw new Error('chrome.scripting.executeScript is unavailable');
    }
    return normalizePromise((resolve, reject) => {
      try {
        chromeApi.scripting.executeScript(
          options as unknown as chrome.scripting.ScriptInjection<unknown[], unknown>,
          (results) => {
            const error = getChromeLastError();
            if (error) {
              reject(error);
              return;
            }
            resolve(results);
          }
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
};
