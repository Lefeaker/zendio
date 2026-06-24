import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';

export type AIChatFixtureCaptureKind =
  | 'legacy-synthetic'
  | 'current-dom-sanitized'
  | 'focused-regression';

export type AIChatFixturePrivacyStatus = 'sanitized' | 'legacy-sanitized';
export type AIChatFixtureStatus = 'active' | 'pending';
export type AIChatFixtureRole = 'user' | 'assistant' | 'system';

export type AIChatFixtureMetadata = {
  file: string;
  platform: PlatformId;
  sourceCaptureDate: string;
  captureKind: AIChatFixtureCaptureKind;
  expectedTitle?: string;
  expectedMessageCount?: number;
  expectedRoles?: readonly AIChatFixtureRole[];
  sentinels: readonly string[];
  absentSentinels?: readonly string[];
  privacyStatus: AIChatFixturePrivacyStatus;
  ownerMilestone: string;
  status: AIChatFixtureStatus;
};

export type ActiveAIChatFixtureMetadata = AIChatFixtureMetadata & { status: 'active' };
export type PendingAIChatFixtureMetadata = AIChatFixtureMetadata & { status: 'pending' };
export type ActiveCurrentDomAIChatFixtureMetadata = ActiveAIChatFixtureMetadata & {
  file: `current-dom/${string}`;
};
export type PendingCurrentDomAIChatFixtureMetadata = PendingAIChatFixtureMetadata & {
  file: `current-dom/${string}`;
};

export const AI_CHAT_FIXTURE_MANIFEST: readonly AIChatFixtureMetadata[] = [
  {
    file: 'chatgpt.html',
    platform: 'chatgpt',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'Test Conversation',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['How can I help you today'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'claude.html',
    platform: 'claude',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'Planning Session',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['plan overview'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'claude-code.html',
    platform: 'claude',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    sentinels: ['```typescript', 'npm run build'],
    absentSentinels: ['Copy code'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'copilot.html',
    platform: 'copilot',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'Travel Ideas',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['assistant'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'deepseek.html',
    platform: 'deepseek',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'Team Sync',
    sentinels: ['concise summary'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'deepseek-code.html',
    platform: 'deepseek',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    sentinels: ['```python', '| Step | Description |'],
    absentSentinels: ['toolbar'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'doubao.html',
    platform: 'doubao',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: '示例会话',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['| 公司 |', '```python'],
    absentSentinels: ['复制'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'doubao-model.html',
    platform: 'doubao',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedMessageCount: 2,
    sentinels: ['旗舰版'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'gemini.html',
    platform: 'gemini',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'Sample Session',
    expectedMessageCount: 2,
    sentinels: ['Gemini Canvas Snapshot', 'Deep Research Report'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'kimi.html',
    platform: 'kimi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: '创意草稿',
    sentinels: ['Kimi'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'kimi-code.html',
    platform: 'kimi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedMessageCount: 2,
    sentinels: ['```html'],
    absentSentinels: ['复制'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'kimi-new.html',
    platform: 'kimi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: '研究计划',
    expectedMessageCount: 2,
    sentinels: ['两周的学习计划', '| 表格 | Feature |'],
    absentSentinels: ['分享'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'monica.html',
    platform: 'monica',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'AI 对话摘要',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['OpenAI', 'Anthropic'],
    absentSentinels: ['复制'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'monica-fallback.html',
    platform: 'monica',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedMessageCount: 2,
    sentinels: ['Monica'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'perplexity.html',
    platform: 'perplexity',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: 'AI Research Thread',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['OpenAI continues to lead frontier deployment.'],
    absentSentinels: ['Copy'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'tongyi.html',
    platform: 'tongyi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: '研究计划',
    expectedMessageCount: 2,
    sentinels: ['Qwen2-Turbo'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'tongyi-code.html',
    platform: 'tongyi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    sentinels: ['```TypeScript', '```python'],
    absentSentinels: ['预览', 'hover:text'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'tongyi-inline-numbers.html',
    platform: 'tongyi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    sentinels: ['const counter = 0;', "console.log('Start');"],
    absentSentinels: ['1//'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'tongyi-new.html',
    platform: 'tongyi',
    sourceCaptureDate: 'legacy-unknown',
    captureKind: 'legacy-synthetic',
    expectedTitle: '研究计划',
    expectedMessageCount: 4,
    expectedRoles: ['user', 'assistant', 'user', 'assistant'],
    sentinels: ['OpenAI', '不同优势'],
    privacyStatus: 'legacy-sanitized',
    ownerMilestone: 'legacy-baseline',
    status: 'active'
  },
  {
    file: 'current-dom/harness-chatgpt-current-synthetic.html',
    platform: 'chatgpt',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'focused-regression',
    expectedTitle: 'Harness Current DOM',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: ['Harness assistant response keeps sanitized current DOM shape.'],
    absentSentinels: ['Copy response'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P04',
    status: 'active'
  },
  {
    file: 'current-dom/chatgpt-current-2026-06-24.html',
    platform: 'chatgpt',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    sentinels: ['pending-p05-chatgpt-current-dom'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P05',
    status: 'pending'
  },
  {
    file: 'current-dom/claude-current-2026-06-24.html',
    platform: 'claude',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    sentinels: ['pending-p05-claude-current-dom'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P05',
    status: 'pending'
  },
  {
    file: 'current-dom/copilot-current-synthetic.html',
    platform: 'copilot',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'focused-regression',
    sentinels: ['pending-p05-copilot-current-synthetic'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P05',
    status: 'pending'
  },
  {
    file: 'current-dom/deepseek-current-2026-06-24.html',
    platform: 'deepseek',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    sentinels: ['pending-p06-deepseek-current-dom'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P06',
    status: 'pending'
  },
  {
    file: 'current-dom/doubao-current-2026-06-24.html',
    platform: 'doubao',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    sentinels: ['pending-p06-doubao-current-dom'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P06',
    status: 'pending'
  },
  {
    file: 'current-dom/tongyi-qianwen-current-2026-06-24.html',
    platform: 'tongyi',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    sentinels: ['pending-p06-tongyi-qianwen-current-dom'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P06',
    status: 'pending'
  },
  {
    file: 'current-dom/kimi-current-pass-regression-2026-06-24.html',
    platform: 'kimi',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'focused-regression',
    sentinels: ['pending-p06-kimi-pass-regression'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P06',
    status: 'pending'
  },
  {
    file: 'current-dom/perplexity-current-2026-06-24.html',
    platform: 'perplexity',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'current-dom-sanitized',
    expectedTitle: 'Current Perplexity Research Thread',
    expectedMessageCount: 2,
    expectedRoles: ['user', 'assistant'],
    sentinels: [
      'Compare OpenAI and Anthropic for a sanitized research note.',
      'OpenAI focuses on frontier deployment and platform APIs.',
      'Anthropic emphasizes constitutional AI and enterprise safety.'
    ],
    absentSentinels: [
      'Sanitized source card should not become a message.',
      'Sidebar suggestion should not become a message.',
      'Copy',
      'Share'
    ],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P07',
    status: 'active'
  },
  {
    file: 'current-dom/monica-current-pass-regression-2026-06-24.html',
    platform: 'monica',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'focused-regression',
    sentinels: ['pending-p07-monica-pass-regression'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P07',
    status: 'pending'
  },
  {
    file: 'current-dom/gemini-current-pass-regression-2026-06-24.html',
    platform: 'gemini',
    sourceCaptureDate: '2026-06-24',
    captureKind: 'focused-regression',
    sentinels: ['pending-p07-gemini-pass-regression'],
    privacyStatus: 'sanitized',
    ownerMilestone: 'P07',
    status: 'pending'
  }
];

function isActiveFixture(fixture: AIChatFixtureMetadata): fixture is ActiveAIChatFixtureMetadata {
  return fixture.status === 'active';
}

function isPendingFixture(fixture: AIChatFixtureMetadata): fixture is PendingAIChatFixtureMetadata {
  return fixture.status === 'pending';
}

function isActiveCurrentDomFixture(
  fixture: ActiveAIChatFixtureMetadata
): fixture is ActiveCurrentDomAIChatFixtureMetadata {
  return fixture.file.startsWith('current-dom/');
}

function isPendingCurrentDomFixture(
  fixture: PendingAIChatFixtureMetadata
): fixture is PendingCurrentDomAIChatFixtureMetadata {
  return fixture.file.startsWith('current-dom/');
}

export const ACTIVE_AI_CHAT_FIXTURES = AI_CHAT_FIXTURE_MANIFEST.filter(isActiveFixture);
export const PENDING_AI_CHAT_FIXTURES = AI_CHAT_FIXTURE_MANIFEST.filter(isPendingFixture);
export const CURRENT_DOM_AI_CHAT_FIXTURES = ACTIVE_AI_CHAT_FIXTURES.filter(isActiveCurrentDomFixture);
export const PENDING_CURRENT_DOM_AI_CHAT_FIXTURES =
  PENDING_AI_CHAT_FIXTURES.filter(isPendingCurrentDomFixture);
