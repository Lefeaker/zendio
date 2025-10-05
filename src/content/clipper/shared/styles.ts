export const CLIPPER_DIALOG_STYLES = `
#obsidian-clipper-dialog {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 2147483647;
  font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  pointer-events: none;
  animation: fadeIn var(--transition-fast, 0.16s ease);
}

.obsidian-clipper-content {
  position: absolute;
  background: var(--bg-elev-2, rgba(17, 20, 38, 0.96));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-lg, 14px);
  padding: 0;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  box-shadow: var(--shadow-soft, 0 18px 45px rgba(12, 15, 30, 0.35));
  pointer-events: auto;
  transition: box-shadow var(--transition-base, 0.2s ease);
  transform: translate(0, 0);
  animation: scaleIn var(--transition-base, 0.2s ease) var(--ease-out-cubic, 1);
}

#obsidian-clipper-dialog .clipper-dialog-header {
  padding: var(--space-xl, 24px) var(--space-2xl, 28px) var(--space-lg, 18px) var(--space-2xl, 28px);
  cursor: move;
  user-select: none;
  border-radius: var(--radius-lg, 14px) var(--radius-lg, 14px) 0 0;
  transition: background-color var(--transition-base, 0.2s ease);
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
}

#obsidian-clipper-dialog .clipper-dialog-header:hover {
  background-color: color-mix(in srgb, var(--text, #f2f4ff) 6%, transparent);
}

#obsidian-clipper-dialog .clipper-dialog-title {
  margin: 0 0 var(--space-xs, 6px) 0;
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text, #f2f4ff);
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
}

#obsidian-clipper-dialog .clipper-dialog-drag-icon {
  font-size: var(--font-size-base, 14px);
  color: var(--text-muted, rgba(242, 244, 255, 0.6));
  letter-spacing: -2px;
  opacity: 0.5;
}

#obsidian-clipper-dialog .clipper-dialog-divider {
  height: 1px;
  background: var(--gradient-primary, linear-gradient(135deg, #8B5CF6, #6366F1));
  margin: 0;
}

#obsidian-clipper-dialog .clipper-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

#obsidian-clipper-dialog .clipper-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md, 12px);
  padding: var(--space-lg, 16px) var(--space-2xl, 24px) var(--space-2xl, 24px) var(--space-2xl, 24px);
  border-top: 1px solid color-mix(in srgb, var(--border, rgba(255, 255, 255, 0.12)) 40%, transparent);
  background: var(--bg-elev-1, rgba(12, 15, 30, 0.94));
  border-radius: 0 0 var(--radius-lg, 14px) var(--radius-lg, 14px);
}

#obsidian-clipper-dialog .clipper-btn {
  border-radius: var(--radius-sm, 10px);
  padding: var(--space-sm, 10px) var(--space-lg, 18px);
  font-size: var(--font-size-base, 14px);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--border, rgba(255, 255, 255, 0.12)) 80%, transparent);
  transition: background-color var(--transition-base, 0.2s ease), transform var(--transition-base, 0.2s ease), box-shadow var(--transition-base, 0.2s ease);
}

#obsidian-clipper-dialog .clipper-btn--ghost {
  background: transparent;
  color: color-mix(in srgb, var(--text, #f2f4ff) 70%, transparent);
  border: none;
}

#obsidian-clipper-dialog .clipper-btn--ghost:hover {
  color: var(--text, #f2f4ff);
  background: color-mix(in srgb, var(--bg-elev-1, rgba(12, 15, 30, 0.94)) 70%, transparent);
}

#obsidian-clipper-dialog .clipper-dialog-icon {
  width: 24px;
  height: 24px;
}

#obsidian-clipper-dialog .clipper-btn-icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
}

#obsidian-clipper-dialog .clipper-btn-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

#obsidian-clipper-dialog .clipper-btn--secondary {
  background: var(--bg-elev-1, rgba(12, 15, 30, 0.94));
  color: var(--text, #f2f4ff);
}

#obsidian-clipper-dialog .clipper-btn--secondary:hover {
  background: color-mix(in srgb, var(--bg-elev-1, rgba(12, 15, 30, 0.94)) 80%, var(--text, #f2f4ff) 10%);
}

#obsidian-clipper-dialog .clipper-btn--primary {
  background: var(--gradient-primary, linear-gradient(135deg, #8B5CF6, #6366F1));
  color: #ffffff;
  border: none;
  box-shadow: var(--shadow-button, 0 10px 25px rgba(99, 102, 241, 0.35));
}

#obsidian-clipper-dialog .clipper-btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-button-hover, 0 12px 28px rgba(99, 102, 241, 0.45));
}

#obsidian-clipper-dialog .clipper-btn--primary:focus-visible {
  outline: none;
  box-shadow: var(--ring, 0 0 0 3px rgba(124, 92, 255, 0.35));
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
`;
