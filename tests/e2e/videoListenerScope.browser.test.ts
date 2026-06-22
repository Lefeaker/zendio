import { registerVideoListenerScopeBilibiliTests } from './videoListenerScope.bilibili.browser.test';
import { registerVideoListenerScopeLifecycleTests } from './videoListenerScope.lifecycle.browser.test';
import { registerVideoListenerScopeYouTubeTests } from './videoListenerScope.youtube.browser.test';
import { testWithExtension } from './utils/videoListenerScopeHarness';

testWithExtension.describe('video listener scope browser runtime', () => {
  testWithExtension.slow();
  testWithExtension.setTimeout(60000);

  registerVideoListenerScopeYouTubeTests();
  registerVideoListenerScopeBilibiliTests();
  registerVideoListenerScopeLifecycleTests();
});
