import { configProvider } from '@shared/config/provider';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import { getOptionsController } from '../../app/optionsControllerContext';
import { getElementById } from '../../utils/dom';
import {
  createDiagnosticLine,
  createDiagnosticMessage,
  formatDiagnosticMessage,
  renderDiagnosticLine
} from './diagnosticsMessages';
import {
  isEmptyOptions,
  resolveCurrentMessages,
  resolveOptionsSnapshot,
  runDiagnostics
} from './diagnosticsRenderer';

const REST_DEFAULTS = configProvider.getRestDefaults();
const TEMPLATE_DEFAULTS = configProvider.getTemplates();

export async function fixConfiguration(onAfterFix?: () => Promise<void> | void): Promise<void> {
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');
  const messages = await resolveCurrentMessages();

  try {
    const options = await resolveOptionsSnapshot();

    if (isEmptyOptions(options) || !options?.rest) {
      diagOutput.textContent += `\n${renderDiagnosticLine(
        createDiagnosticLine('error', 'diagnosticsRepairUnavailableNoConfig'),
        messages
      )}\n`;
      return;
    }

    diagOutput.textContent += `\n${renderDiagnosticLine(
      createDiagnosticLine('info', 'diagnosticsRepairing'),
      messages
    )}\n`;

    let baseUrl = options.rest.httpsUrl || options.rest.baseUrl || REST_DEFAULTS.baseUrl;

    if (baseUrl.startsWith('http://') && baseUrl.includes(`:${REST_DEFAULTS.httpsPort}`)) {
      baseUrl = baseUrl.replace('http://', 'https://');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairSwitchedToHttps', {
          port: REST_DEFAULTS.httpsPort
        }),
        messages
      )}\n`;
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(`:${REST_DEFAULTS.httpPort}`)) {
      baseUrl = baseUrl.replace('https://', 'http://');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairSwitchedToHttp', {
          port: REST_DEFAULTS.httpPort
        }),
        messages
      )}\n`;
    }

    const templates = options.templates || {};

    if (!templates.fragment) {
      templates.fragment = TEMPLATE_DEFAULTS.fragment;
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairAddedFragmentTemplate'),
        messages
      )}\n`;
    }

    if (!templates.video) {
      templates.video = TEMPLATE_DEFAULTS.video;
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairAddedVideoTemplate'),
        messages
      )}\n`;
    }

    if (templates.article && templates.article.includes('Clippings/')) {
      templates.article = templates.article.replace('Clippings/', 'Articles/');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairUpdatedArticleTemplate'),
        messages
      )}\n`;
    }

    const newOptions = {
      ...options,
      rest: {
        ...options.rest,
        httpsUrl: options.rest.httpsUrl || REST_DEFAULTS.httpsUrl,
        httpUrl: options.rest.httpUrl || REST_DEFAULTS.httpUrl,
        baseUrl
      },
      templates: {
        article: templates.article || TEMPLATE_DEFAULTS.article,
        video: templates.video || TEMPLATE_DEFAULTS.video,
        fragment: templates.fragment || TEMPLATE_DEFAULTS.fragment,
        reading: templates.reading || TEMPLATE_DEFAULTS.reading,
        ai: templates.ai || TEMPLATE_DEFAULTS.ai
      }
    };

    const controller = getOptionsController();
    if (controller) {
      await controller.saveSnapshot({ reason: 'manual', draft: newOptions });
    } else {
      const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      await optionsRepository.set(newOptions as CompleteOptions);
    }
    diagOutput.textContent += `${renderDiagnosticLine(
      createDiagnosticLine('ok', 'diagnosticsRepairSaved'),
      messages
    )}\n`;
    diagOutput.textContent += `\n${formatDiagnosticMessage(
      createDiagnosticMessage('diagnosticsRepairReloadHint'),
      messages
    )}\n`;

    if (onAfterFix) {
      window.setTimeout(() => {
        void (async () => {
          await onAfterFix();
          await runDiagnostics();
        })();
      }, 1000);
    }
  } catch (error) {
    diagOutput.textContent += `\n${renderDiagnosticLine(
      {
        severity: 'error',
        message: createDiagnosticMessage('diagnosticsRepairFailed', {
          reason: error instanceof Error ? error.message : String(error)
        })
      },
      messages
    )}\n`;
  }
}
