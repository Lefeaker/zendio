export const READER_STYLES = `
:root {
  --reader-panel-bg: rgba(20, 23, 42, 0.92);
  --reader-panel-border: rgba(116, 141, 231, 0.35);
  --reader-panel-shadow: 0 18px 45px rgba(17, 22, 45, 0.45);
  --reader-primary: #7C5CFF;
  --reader-primary-hover: #8D6EFF;
  --reader-secondary: rgba(255, 255, 255, 0.08);
  --reader-text: #F5F6FF;
  --reader-muted: rgba(255, 255, 255, 0.65);
  --reader-danger: #EF5350;
  --reader-highlight-gradient: linear-gradient(90deg, rgba(124, 92, 255, 0.45), rgba(87, 205, 255, 0.35));
  --reader-highlight-purple: rgba(124, 92, 255, 0.35);
  --reader-highlight-neon-yellow: rgba(255, 248, 0, 0.55);
  --reader-highlight-neon-green: rgba(48, 255, 173, 0.45);
  --reader-highlight-neon-orange: rgba(255, 176, 72, 0.5);
  --reader-highlight-bg: var(--reader-highlight-gradient);
  --reader-highlight-focus-color: rgba(124, 92, 255, 0.45);
  --reader-highlight-focus-color-soft: rgba(124, 92, 255, 0.2);
}

.aiob-reader-highlight {
  background: var(--reader-highlight-bg);
  border-radius: 3px;
  padding: 1px 0;
  color: inherit;
  position: relative;
  transition: box-shadow 0.3s ease;
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
  --reader-highlight-focus-color-soft: rgba(48, 255, 173, 0.18);
}

:root[data-aiob-reader-highlight="neonOrange"] {
  --reader-highlight-bg: var(--reader-highlight-neon-orange);
  --reader-highlight-focus-color: rgba(255, 176, 72, 0.5);
  --reader-highlight-focus-color-soft: rgba(255, 176, 72, 0.18);
}

#aiob-reader-root {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483646;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--reader-text);
}

#aiob-reader-root *,
#aiob-reader-root *::before,
#aiob-reader-root *::after {
  box-sizing: border-box;
}

#aiob-reader-card {
  min-width: 280px;
  max-width: 360px;
  background: var(--reader-panel-bg);
  border: 1px solid var(--reader-panel-border);
  border-radius: 16px;
  padding: 18px 20px 20px;
  box-shadow: var(--reader-panel-shadow);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

#aiob-reader-highlights[hidden] {
  display: none !important;
}

#aiob-reader-highlights {
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

#aiob-reader-highlights::-webkit-scrollbar {
  width: 6px;
}

#aiob-reader-highlights::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}

.aiob-reader-highlight-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

#aiob-reader-highlights .aiob-reader-highlight-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.aiob-reader-highlight-item__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.aiob-reader-highlight-item__index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(124, 92, 255, 0.22);
  color: var(--reader-text);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.aiob-reader-highlight-item__index:hover {
  background: rgba(124, 92, 255, 0.35);
  transform: translateY(-1px);
}

.aiob-reader-highlight-item__index:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.6);
  outline-offset: 2px;
}

.aiob-reader-highlight-item__excerpt {
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--reader-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
  max-height: calc(1.5em * 3);
  word-break: break-word;
}

.aiob-reader-highlight-item--expanded .aiob-reader-highlight-item__excerpt {
  display: block;
  -webkit-line-clamp: unset;
  max-height: none;
  overflow: visible;
}

.aiob-reader-highlight-item__remove {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--reader-muted);
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

.aiob-reader-highlight-item__remove:hover {
  color: var(--reader-danger);
  background: rgba(124, 92, 255, 0.14);
}

.aiob-reader-highlight-item__comment {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.aiob-reader-highlight-item__comment--interactive {
  cursor: pointer;
}

.aiob-reader-highlight-item__comment--interactive:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.6);
  outline-offset: 2px;
}

.aiob-reader-highlight-item__comment-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--reader-muted);
  white-space: pre-wrap;
}

.aiob-reader-highlight-item__comment-placeholder {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
}

.aiob-reader-highlight-item__editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.aiob-reader-highlight-item__editor textarea {
  width: 100%;
  min-height: 90px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 13, 28, 0.65);
  color: var(--reader-text);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.aiob-reader-highlight-item__editor textarea:focus {
  border-color: rgba(124, 92, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.25);
  outline: none;
}

.aiob-reader-highlight-item__editor textarea::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.aiob-reader-highlight-item__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.aiob-reader-highlight-item__editor-actions button {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
}

.aiob-reader-highlight-item__editor-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: var(--reader-text);
}

.aiob-reader-highlight-item__editor-cancel:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: translateY(-1px);
}

.aiob-reader-highlight-item__editor-save {
  background: linear-gradient(135deg, var(--reader-primary), #57CDFF);
  color: var(--reader-text);
  box-shadow: 0 6px 16px rgba(124, 92, 255, 0.25);
}

.aiob-reader-highlight-item__editor-save:hover:not(:disabled) {
  transform: translateY(-1px);
  background: linear-gradient(135deg, var(--reader-primary-hover), #63D5FF);
}

.aiob-reader-highlight-item__editor-save:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none;
  box-shadow: none;
}

.aiob-reader-highlight.aiob-reader-highlight--focus {
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

#aiob-reader-panel {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 18px;
  margin-top: 4px;
  width: 100%;
}

#aiob-reader-panel header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  gap: 10px;
}

#aiob-reader-panel h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

#aiob-reader-panel .aiob-reader-icon {
  width: 24px;
  height: 24px;
}

#aiob-reader-panel .aiob-reader-status {
  font-size: 12px;
  color: var(--reader-muted);
}

#aiob-reader-panel .aiob-reader-counter {
  font-size: 13px;
  margin-bottom: 16px;
}

#aiob-reader-panel footer {
  display: flex;
  gap: 10px;
}

#aiob-reader-panel button {
  flex: 1;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  color: var(--reader-text);
}

#aiob-reader-panel button:focus-visible {
  outline: 2px solid rgba(124, 92, 255, 0.5);
  outline-offset: 2px;
}

#aiob-reader-panel .aiob-reader-finish {
  background: linear-gradient(135deg, var(--reader-primary), #57CDFF);
  box-shadow: 0 10px 28px rgba(124, 92, 255, 0.35);
}

#aiob-reader-panel .aiob-reader-finish:hover {
  transform: translateY(-1px);
  background: linear-gradient(135deg, var(--reader-primary-hover), #63D5FF);
}

#aiob-reader-panel .aiob-reader-cancel {
  background: var(--reader-secondary);
}

#aiob-reader-panel .aiob-reader-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}

#aiob-reader-panel .aiob-reader-hint {
  margin-top: 14px;
  font-size: 12px;
  color: var(--reader-muted);
  line-height: 1.4;
}
`;
