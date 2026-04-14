import { getPlatformServices } from '../../src/platform';
import { configureI18nStorage } from '../../src/i18n';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { createTestPlatformHarness } from '../utils/platformTestHarness';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import {
  MockOptionsRepository,
  MockMessagingRepository,
  MockYamlRepository,
  MockClipRepository,
  MockVideoRepository,
  MockReaderRepository,
  MockNavigationRepository
} from '../utils/repositories';

function registerE2eRepositories(): void {
  repositoryContainer.registerSingleton(
    DI_TOKENS.IOptionsRepository,
    () => new MockOptionsRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IMessagingRepository,
    () => new MockMessagingRepository()
  );
  repositoryContainer.registerSingleton(DI_TOKENS.IYamlRepository, () => new MockYamlRepository());
  repositoryContainer.registerSingleton(DI_TOKENS.IClipRepository, () => new MockClipRepository());
  repositoryContainer.registerSingleton(
    DI_TOKENS.IVideoRepository,
    () => new MockVideoRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IReaderRepository,
    () => new MockReaderRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.INavigationRepository,
    () => new MockNavigationRepository()
  );
}

repositoryContainer.reset();
registerE2eRepositories();

const harness = createTestPlatformHarness();

harness.reset();
harness.configure();

const services = getPlatformServices();
const storage = services.storage;
configureI18nStorage(storage.sync);

// Preload common option fixtures for e2e tests.
void storage.sync.set('options', {
  aiChat: { includeTimestamps: true, userName: 'E2E User' },
  deepResearch: { pureMode: true },
  video: { floatingPromptEnabled: true },
  fragmentClipper: {
    useFootnoteFormat: true,
    captureContext: true,
    contextLength: 200,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: []
  },
  readingSession: {
    exportMode: 'highlights',
    highlightTheme: 'gradient'
  }
});

const optionsRepository = repositoryContainer.resolve<MockOptionsRepository>(
  DI_TOKENS.IOptionsRepository
);
optionsRepository.setMockData(
  mergeOptions({
    aiChat: { includeTimestamps: true, userName: 'E2E User' },
    deepResearch: { pureMode: true },
    video: { floatingPromptEnabled: true },
    fragmentClipper: {
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    },
    readingSession: {
      exportMode: 'highlights',
      highlightTheme: 'gradient'
    }
  }) as Parameters<MockOptionsRepository['setMockData']>[0]
);

void storage.local.set('usage_stats', {
  aiChatSaves: 0,
  fragmentSaves: 0,
  articleSaves: 0,
  lastUpdatedISO: new Date().toISOString(),
  history: []
});

export { harness as e2ePlatformHarness };
