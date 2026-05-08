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
    expect(getReaderSession(document)).toBe(reader);
    expect(isVideoSessionActive(document)).toBe(true);
    expect(getVideoSession(document)).toBe(video);

    clearReaderSession(reader, document);
    clearVideoSession(video, document);

    expect(isReaderSessionActive(document)).toBe(false);
    expect(getReaderSession(document)).toBeNull();
    expect(isVideoSessionActive(document)).toBe(false);
    expect(getVideoSession(document)).toBeNull();
  });

  it('keeps reader and video sessions isolated per document', () => {
    const otherDocument = document.implementation.createHTMLDocument('other');
    __resetContentSessionRegistryForTests(otherDocument);
    const currentReader = { id: 'current-reader' };
    const otherReader = { id: 'other-reader' };
    const currentVideo = { id: 'current-video' };
    const otherVideo = { id: 'other-video' };

    registerReaderSession(currentReader, document);
    registerReaderSession(otherReader, otherDocument);
    registerVideoSession(currentVideo, document);
    registerVideoSession(otherVideo, otherDocument);

    expect(getReaderSession(document)).toBe(currentReader);
    expect(getReaderSession(otherDocument)).toBe(otherReader);
    expect(getVideoSession(document)).toBe(currentVideo);
    expect(getVideoSession(otherDocument)).toBe(otherVideo);

    clearReaderSession(currentReader, document);
    clearVideoSession(otherVideo, otherDocument);

    expect(isReaderSessionActive(document)).toBe(false);
    expect(isReaderSessionActive(otherDocument)).toBe(true);
    expect(isVideoSessionActive(document)).toBe(true);
    expect(isVideoSessionActive(otherDocument)).toBe(false);
  });
});
