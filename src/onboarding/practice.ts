import { startPracticeVideo } from './practiceVideo';
import { createDefaultPageI18nController, configureI18nStorage } from '../i18n';
import type { PlatformServices } from '../platform';
import { applyStoredOnboardingTheme } from './theme';
import { createPracticeView } from './practiceView';
import { mountPracticeCoach } from './practiceCoach';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';
import { copyLearningPath, revealLearningResult } from './learningResult';

export async function bootstrapPractice(platform: PlatformServices): Promise<void> {
  configureI18nStorage(platform.storage.sync);
  const i18n = createDefaultPageI18nController();
  await i18n.load();
  await applyStoredOnboardingTheme();
  const resource = i18n.getCurrentResource();
  const root = document.getElementById('practiceRoot');
  if (!root || !resource) return;
  document.documentElement.lang = resource.language;
  const messages = resource.messages;
  document.title = messages.practiceArticleTitle;
  const options = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  const navigation = resolveRepository<INavigationRepository>(DI_TOKENS.INavigationRepository);
  let coach: Awaited<ReturnType<typeof mountPracticeCoach>> | undefined = undefined;
  const exit = () => {
    coach?.dispose();
    location.assign('index.html');
  };
  const videoLesson = new URL(location.href).searchParams.get('lesson') === 'video';
  const readerLesson = new URL(location.href).searchParams.get('lesson') === 'reader';
  if (videoLesson) document.title = messages.learningVideoTitle;
  const view = createPracticeView(
    root,
    messages,
    {
      exit,
      enable() {
        if (videoLesson) {
          view.enable.disabled = true;
          void startPracticeVideo(platform, options)
            .catch(() => {
              view.error.textContent = messages.learningActionError;
            })
            .finally(() => {
              view.enable.disabled = false;
            });
          return;
        }
        void options
          .get()
          .then((current) =>
            options.patch([
              { path: ['fragmentClipper', 'selectionTriggerMode'], value: 'modifier' },
              {
                path: ['fragmentClipper', 'selectionModifierKeys'],
                value: current.fragmentClipper.selectionModifierKeys.length
                  ? current.fragmentClipper.selectionModifierKeys
                  : ['shift']
              }
            ])
          )
          .catch(() => {
            view.error.textContent = messages.learningActionError;
          });
      },
      next() {
        const next = new URL(location.href);
        next.searchParams.set(
          'lesson',
          coach?.getReceipt()?.course === 'reader' ? 'video' : 'reader'
        );
        next.searchParams.set('run', crypto.randomUUID());
        location.assign(next.href);
      },
      locate() {
        const receipt = coach?.getReceipt();
        if (!receipt) return;
        void revealLearningResult(receipt, navigation, platform.downloads)
          .then(() => {
            view.resultFeedback.textContent = messages.learningRevealRequested;
          })
          .catch(() => {
            view.resultFeedback.textContent = messages.learningRevealFailed;
          });
      },
      copyPath() {
        const receipt = coach?.getReceipt();
        if (!receipt) return;
        void copyLearningPath(receipt)
          .then(() => {
            view.resultFeedback.textContent = messages.learningPathCopied;
          })
          .catch(() => {
            view.resultFeedback.textContent = messages.learningRevealFailed;
          });
      }
    },
    videoLesson ? 'video' : readerLesson ? 'reader' : 'fragment',
    platform.runtime.getBrowserTarget() === 'firefox'
  );
  coach = await mountPracticeCoach({
    view,
    messages,
    options,
    storage: platform.storage.local,
    exit
  });
  window.addEventListener('pagehide', () => coach?.dispose(), { once: true });
}
