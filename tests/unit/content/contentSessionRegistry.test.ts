/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetContentSessionRegistryForTests,
  clearReaderSession,
  clearVideoSession,
  getReaderSession,
  getVideoSession,
  isReaderSessionActive,
  isVideoSessionActive,
  markContentRuntimeInitialized,
  registerReaderSession,
  registerVideoSession
} from '@content/runtime/contentSessionRegistry';

describe('contentSessionRegistry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetContentSessionRegistryForTests(document);
  });

  it('marks content runtime initialization once per document', () => {
    expect(markContentRuntimeInitialized(document)).toBe(true);
    expect(markContentRuntimeInitialized(document)).toBe(false);
    expect(document.documentElement.dataset.aiobContentRuntime).toBe('true');
  });

  it('tracks reader and video sessions without window globals', () => {
    const reader = { id: 'reader' };
    const video = { id: 'video' };

    registerReaderSession(reader, document);
    registerVideoSession(video, document);

    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(reader);
    expect(isVideoSessionActive(document)).toBe(true);
    expect(getVideoSession()).toBe(video);

    clearReaderSession(reader, document);
    clearVideoSession(video, document);

    expect(isReaderSessionActive(document)).toBe(false);
    expect(getReaderSession()).toBeNull();
    expect(isVideoSessionActive(document)).toBe(false);
    expect(getVideoSession()).toBeNull();
  });
});
