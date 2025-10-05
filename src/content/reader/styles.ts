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
}

.aiob-reader-highlight {
  background: linear-gradient(90deg, rgba(124, 92, 255, 0.45), rgba(87, 205, 255, 0.35));
  border-radius: 3px;
  padding: 1px 0;
}

#aiob-reader-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483646;
  background: var(--reader-panel-bg);
  border: 1px solid var(--reader-panel-border);
  border-radius: 14px;
  padding: 18px 20px;
  min-width: 260px;
  color: var(--reader-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: var(--reader-panel-shadow);
  backdrop-filter: blur(18px);
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
