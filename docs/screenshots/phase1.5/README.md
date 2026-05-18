# Phase 1.5 Visual Regression Testing Screenshots

**Directory Purpose**: Store visual regression testing screenshots for Phase 1.5 DaisyUI migration validation.

---

## 📸 Screenshot Checklist

### Required Screenshots

| Screenshot                         | Filename                   | Status     | Priority |
| ---------------------------------- | -------------------------- | ---------- | -------- |
| **Full Options page (light mode)** | `options-full-light.png`   | ⏸️ Pending | P0       |
| **Button variants grid**           | `buttons-all-variants.png` | ⏸️ Pending | P0       |
| **Input states**                   | `inputs-states.png`        | ⏸️ Pending | P0       |
| **Checkbox states**                | `checkboxes-states.png`    | ⏸️ Pending | P0       |
| **Select dropdown**                | `select-dropdown.png`      | ⏸️ Pending | P1       |
| **Alerts (all types)**             | `alerts-all-types.png`     | ⏸️ Pending | P1       |
| **Cards (sections)**               | `cards-sections.png`       | ⏸️ Pending | P1       |
| **Dark mode (if enabled)**         | `options-full-dark.png`    | ⏸️ Future  | P2       |

---

## 📋 How to Take Screenshots

### Method 1: Chrome DevTools (Recommended)

1. Open Options page in Chrome
2. Set browser size to 1920x1080
3. Open DevTools (F12)
4. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
5. Type "Capture full size screenshot"
6. Save to this directory

### Method 2: Manual Screenshot Tool

Use any screenshot tool (Snagit, Lightshot, macOS Screenshot, etc.) to capture:

- Full page: `Cmd+Shift+5` (Mac) or `Win+Shift+S` (Windows)
- Specific area: Select the component area

---

## 🎯 Screenshot Guidelines

### Resolution

- **Desktop**: 1920x1080 (primary)
- **Tablet**: 1366x768 (optional)
- **Mobile**: 768x1024 (low priority for Options page)

### Format

- **File format**: PNG (lossless)
- **Color depth**: 24-bit (millions of colors)
- **Compression**: None or minimal

### Naming Convention

```
<component>-<variant>-<state>.png

Examples:
- button-primary-hover.png
- input-text-focus.png
- checkbox-checked-disabled.png
- alert-error-dismissible.png
```

---

## ✅ Visual Test Execution Record

### Execution Log

| Date | Tester | Browser | Screenshots Taken | Issues Found | Notes                     |
| ---- | ------ | ------- | ----------------- | ------------ | ------------------------- |
| -    | -      | -       | 0/7               | -            | Awaiting manual execution |

**Status**: ⏸️ **Not yet executed** (Directory created, awaiting manual testing)

---

## 📊 Comparison Reference

### Pre-Migration Baseline

If you have screenshots from before Phase 1, store them in `docs/screenshots/baseline/` for comparison.

### Expected vs. Actual

When comparing screenshots, look for:

- ✅ Consistent spacing and alignment
- ✅ Correct colors (matches DaisyUI theme)
- ✅ Smooth transitions (hover/focus)
- ✅ Proper state indicators (disabled, loading)
- ❌ Layout shifts or misalignment
- ❌ Color inconsistencies
- ❌ Missing borders or shadows

---

## 🔧 Troubleshooting

### Screenshot Too Large

- Use Chrome DevTools "Capture node screenshot" for specific elements
- Crop unnecessary white space

### Colors Look Different

- Ensure color profile is sRGB
- Use consistent browser zoom level (100%)
- Disable browser extensions that modify colors

### Can't Capture Full Page

- Use "Capture full size screenshot" in DevTools
- Or use a browser extension like "Full Page Screen Capture"

---

## 📎 Related Documents

- [Visual Regression Testing Guide](../../251126-design-system-poc/visual-regression-testing-guide.md)
- [Phase 1.5 Audit Report](../../251126-design-system-poc/PHASE1.5-AUDIT-REPORT.md)
- [Migration Log](../../251126-design-system-poc/migration-log.md)

---

**Directory Created**: 2025-11-27 00:20
**Last Updated**: 2025-11-27 00:20
**Status**: ⏸️ Ready for screenshot collection
