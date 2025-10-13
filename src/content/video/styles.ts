export const VIDEO_STYLES = `
:root {
  --video-panel-bg: rgba(18, 21, 40, 0.92);
  --video-panel-border: rgba(116, 141, 231, 0.35);
  --video-panel-shadow: 0 18px 45px rgba(17, 22, 45, 0.45);
  --video-primary: #57CDFF;
  --video-primary-hover: #63D5FF;
  --video-secondary: rgba(255, 255, 255, 0.12);
  --video-danger: #EF5350;
  --video-text: #F5F6FF;
  --video-muted: rgba(255, 255, 255, 0.65);
  --reader-highlight-gradient: linear-gradient(90deg, rgba(124, 92, 255, 0.45), rgba(87, 205, 255, 0.35));
  --reader-highlight-purple: rgba(124, 92, 255, 0.35);
  --reader-highlight-neon-yellow: rgba(255, 248, 0, 0.55);
  --reader-highlight-neon-green: rgba(48, 255, 173, 0.45);
  --reader-highlight-neon-orange: rgba(255, 176, 72, 0.5);
  --reader-highlight-bg: var(--reader-highlight-gradient);
  --reader-highlight-focus-color: rgba(124, 92, 255, 0.45);
  --reader-highlight-focus-color-soft: rgba(124, 92, 255, 0.2);
}

:root[data-aiob-reader-highlight="gradient"] {
  --reader-highlight-bg: var(--reader-highlight-gradient);
  --reader-highlight-focus-color: rgba(124, 92, 255, 0.45);
  --reader-highlight-focus-color-soft: rgba(124, 92, 255, 0.2);
}

:root[data-aiob-reader-highlight="purple"] {
  --reader-highlight-bg: var(--reader-highlight-purple);
  --reader-highlight-focus-color: rgba(124, 92, 255, 0.45);
  --reader-highlight-focus-color-soft: rgba(124, 92, 255, 0.22);
}

:root[data-aiob-reader-highlight="neonYellow"] {
  --reader-highlight-bg: var(--reader-highlight-neon-yellow);
  --reader-highlight-focus-color: rgba(255, 248, 0, 0.55);
  --reader-highlight-focus-color-soft: rgba(255, 248, 0, 0.22);
}

:root[data-aiob-reader-highlight="neonGreen"] {
  --reader-highlight-bg: var(--reader-highlight-neon-green);
  --reader-highlight-focus-color: rgba(48, 255, 173, 0.45);
  --reader-highlight-focus-color-soft: rgba(48, 255, 173, 0.2);
}

:root[data-aiob-reader-highlight="neonOrange"] {
  --reader-highlight-bg: var(--reader-highlight-neon-orange);
  --reader-highlight-focus-color: rgba(255, 176, 72, 0.5);
  --reader-highlight-focus-color-soft: rgba(255, 176, 72, 0.24);
}

#aiob-video-root {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483646;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--video-text);
}

#aiob-video-root *,
#aiob-video-root *::before,
#aiob-video-root *::after {
  box-sizing: border-box;
}

#aiob-video-card {
  min-width: 280px;
  max-width: 360px;
  background: var(--video-panel-bg);
  border: 1px solid var(--video-panel-border);
  border-radius: 16px;
  padding: 18px 20px 20px;
  box-shadow: var(--video-panel-shadow);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

#aiob-video-panel header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

#aiob-video-panel h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--video-text);
}

#aiob-video-panel h3 span {
  color: inherit;
}

#aiob-video-panel .aiob-video-icon {
  width: 24px;
  height: 24px;
  display: inline-block;
}

#aiob-video-panel .aiob-video-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--video-muted);
}

#aiob-video-panel .aiob-video-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

#aiob-video-panel .aiob-video-summary__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

#aiob-video-panel .aiob-video-counter {
  font-size: 13px;
  color: var(--video-muted);
  flex: 1 1 auto;
}

#aiob-video-panel footer {
  display: flex;
  gap: 10px;
}

#aiob-video-panel footer button {
  flex: 1;
}

#aiob-video-panel button {
  background: var(--video-secondary);
  color: var(--video-text);
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

#aiob-video-panel button:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

#aiob-video-panel button:focus-visible {
  outline: 2px solid rgba(87, 205, 255, 0.55);
  outline-offset: 2px;
}

#aiob-video-panel .aiob-video-add {
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  padding: 7px 12px;
}

#aiob-video-panel .aiob-video-add:hover {
  background: rgba(255, 255, 255, 0.16);
}

#aiob-video-panel .aiob-video-finish {
  background: linear-gradient(135deg, var(--video-primary), #7C5CFF);
}

#aiob-video-panel .aiob-video-finish:hover {
  background: linear-gradient(135deg, var(--video-primary-hover), #8D6EFF);
}

#aiob-video-panel .aiob-video-cancel {
  background: rgba(255, 255, 255, 0.08);
}

#aiob-video-panel .aiob-video-cancel:hover {
  background: rgba(255, 255, 255, 0.16);
}

#aiob-video-panel .aiob-video-hint {
  font-size: 12px;
  color: var(--video-muted);
}

#aiob-video-captures {
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

#aiob-video-captures[hidden] {
  display: none !important;
}

#aiob-video-captures::-webkit-scrollbar {
  width: 6px;
}

#aiob-video-captures::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}

.aiob-video-capture-item--first-fragment {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
}

.aiob-video-fragment-highlight {
  background: var(--reader-highlight-bg);
  border-radius: 3px;
  padding: 1px 0;
  color: inherit;
  position: relative;
  transition: box-shadow 0.3s ease;
}

.aiob-video-fragment-highlight.aiob-reader-highlight--focus {
  animation: aiob-reader-highlight-focus 1.4s ease-out;
}

@keyframes aiob-reader-highlight-focus {
  0% {
    box-shadow: 0 0 0 0 var(--reader-highlight-focus-color);
  }
  50% {
    box-shadow: 0 0 0 8px var(--reader-highlight-focus-color-soft);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.aiob-video-capture-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

#aiob-video-captures .aiob-video-capture-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.aiob-video-capture-item__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.aiob-video-capture-item__index {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(124, 92, 255, 0.22);
  color: var(--video-text);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.aiob-video-capture-item__index:hover {
  background: rgba(124, 92, 255, 0.35);
  transform: translateY(-1px);
}

.aiob-video-capture-item__index:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.6);
  outline-offset: 2px;
}

.aiob-video-capture-item__time {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--video-text);
  margin: 0;
}

.aiob-video-capture-item__excerpt {
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--video-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
  max-height: calc(1.5em * 3);
  word-break: break-word;
}

.aiob-video-capture-item__excerpt:focus-visible {
  outline: 2px solid rgba(87, 205, 255, 0.6);
  outline-offset: 2px;
}

.aiob-video-capture-item--expanded .aiob-video-capture-item__excerpt {
  display: block;
  -webkit-line-clamp: unset;
  max-height: none;
  overflow: visible;
}

.aiob-video-capture-item__time-badge {
  background: rgba(87, 205, 255, 0.18);
  color: var(--video-text);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
}

.aiob-video-capture-item__remove {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--video-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  min-height: 22px;
  border-radius: 6px;
}

.aiob-video-capture-item__remove:hover {
  color: var(--video-danger);
  background: rgba(87, 205, 255, 0.14);
}

.aiob-video-capture-item__remove:focus-visible {
  outline: 2px solid rgba(87, 205, 255, 0.55);
  outline-offset: 2px;
}

.aiob-video-capture-item__comment {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.aiob-video-capture-item__comment--interactive {
  cursor: pointer;
}

.aiob-video-capture-item__comment--interactive:focus-visible {
  outline: 2px solid rgba(87, 205, 255, 0.6);
  outline-offset: 2px;
}

.aiob-video-capture-item__comment-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--video-muted);
  white-space: pre-wrap;
}

.aiob-video-capture-item__comment-placeholder {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
}

.aiob-video-capture-item__time--interactive {
  cursor: pointer;
}

.aiob-video-capture-item__time--interactive:focus-visible {
  outline: 2px solid rgba(87, 205, 255, 0.6);
  outline-offset: 2px;
}

.aiob-video-capture-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.aiob-video-capture-editor textarea {
  width: 100%;
  resize: vertical;
  min-height: 90px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px 12px;
  background: rgba(8, 10, 18, 0.6);
  color: var(--video-text);
  font-family: inherit;
  font-size: 13px;
}

.aiob-video-capture-editor textarea:focus-visible {
  border-color: rgba(87, 205, 255, 0.6);
  outline: none;
  box-shadow: 0 0 0 2px rgba(87, 205, 255, 0.25);
}

`;
