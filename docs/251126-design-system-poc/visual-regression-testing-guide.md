# Phase 1.5: Visual Regression Testing Guide

**Date**: 2025-11-26
**Phase**: Phase 1.5 Cleanup
**Purpose**: Verify visual consistency after DaisyUI migration

---

## 📊 Testing Scope

### Components to Test

| Component | Variants | States | Priority |
|-----------|----------|--------|----------|
| **Button** | primary, secondary, accent, ghost, outline, danger | normal, hover, focus, disabled, loading | P0 |
| **Input** | text, number, email, password, search | normal, hover, focus, disabled | P0 |
| **Checkbox** | accent | normal, hover, focus, disabled, checked | P0 |
| **Select** | bordered | normal, hover, focus, disabled | P0 |
| **Textarea** | bordered | normal, hover, focus, disabled | P1 |
| **Alert** | info, success, warning, error | normal, dismissible | P0 |
| **Card** | default | normal, with header, with footer | P0 |

---

## 🎨 Test Modes

### 1. Light Mode (Default)
- ✅ All components should render with light theme colors
- ✅ Text should be readable against light backgrounds
- ✅ Borders should be visible but not overpowering

### 2. Dark Mode (If implemented)
- ⚠️ **Status**: Dark mode theme not yet enabled in DaisyUI config
- 📋 **Action**: Add `'dark'` to `tailwind.config.cjs` daisyui.themes array
- 🔄 **Deferred**: Can be tested in Phase 2

---

## 🧪 Manual Testing Checklist

### Setup

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Open Options Page**:
   ```
   chrome-extension://<extension-id>/options/index.html
   ```

3. **Open Browser DevTools** (F12):
   - Enable responsive design mode
   - Test at multiple viewport sizes: 1920x1080, 1366x768, 768x1024

---

### Test Case 1: Button Component ✅

**Location**: All sections (Routing, REST, YAML Config, Privacy, etc.)

**Steps**:
1. Locate all buttons on the Options page
2. Verify visual appearance:
   - ✅ Rounded corners (`rounded-md`)
   - ✅ Proper padding and height
   - ✅ Text centered
   - ✅ Background color matches variant
3. Hover over button:
   - ✅ Background color darkens slightly
   - ✅ Cursor changes to pointer
   - ✅ Smooth transition (~150ms)
4. Click button:
   - ✅ Active state visible (pressed effect)
   - ✅ Ripple effect (if applicable)
5. Test disabled state:
   - ✅ Opacity reduced (50%)
   - ✅ Cursor shows `not-allowed`
   - ✅ No hover effect
6. Test loading state (if button supports it):
   - ✅ Loading spinner visible
   - ✅ Text replaced or hidden
   - ✅ Button not clickable

**Variants to Test**:
- ✅ Primary (blue background)
- ✅ Secondary (gray background)
- ✅ Accent (accent color)
- ✅ Ghost (transparent, border only)
- ✅ Outline (outlined, no fill)
- ✅ Danger (red background)

**Expected Result**: All buttons render consistently with DaisyUI styles, no visual regressions.

---

### Test Case 2: Input Component ✅

**Location**: REST Section, Routing Section, YAML Config Section, Classifier Section

**Steps**:
1. Locate all input fields
2. Verify visual appearance:
   - ✅ Border visible (border-border color)
   - ✅ Proper height (`h-8` or `min-h-[36px]`)
   - ✅ Padding matches design (`px-3`)
   - ✅ Placeholder text visible and muted
3. Focus on input:
   - ✅ Border color changes (accent color)
   - ✅ Focus ring appears (`ring-2 ring-accent/20`)
   - ✅ Smooth transition
4. Type text:
   - ✅ Text visible and readable
   - ✅ Cursor position correct
   - ✅ Text color matches theme
5. Test disabled state:
   - ✅ Background grayed out
   - ✅ Text color muted
   - ✅ Border color lighter
   - ✅ Not editable

**Input Types to Test**:
- ✅ Text input (most common)
- ✅ Number input (priority, port fields)
- ✅ Password input (API key fields)
- ✅ Email input (if applicable)

**Expected Result**: All inputs follow DaisyUI `.input .input-bordered` styles consistently.

---

### Test Case 3: Checkbox Component ✅

**Location**: Video Section, Deep Research Section, AI Section, Fragment Section, Routing Section, REST Section, Privacy Settings

**Steps**:
1. Locate all checkboxes
2. Verify unchecked appearance:
   - ✅ Square border visible
   - ✅ Size consistent (`w-[18px] h-[18px]`)
   - ✅ Background transparent
3. Check checkbox:
   - ✅ Checkmark appears
   - ✅ Background fills with accent color
   - ✅ Smooth animation (~150ms)
4. Hover over checkbox:
   - ✅ Border color slightly darker
   - ✅ Cursor changes to pointer
5. Test disabled state:
   - ✅ Opacity reduced
   - ✅ Not clickable
   - ✅ Cursor shows `not-allowed`
6. Test disabled + checked state:
   - ✅ Checkmark visible but muted
   - ✅ Background color lighter

**Expected Result**: All checkboxes use DaisyUI `.checkbox .checkbox-accent` with consistent 18px size.

---

### Test Case 4: Select Dropdown Component ✅

**Location**: Routing Section (rule type, target vault), Classifier Section (provider), YAML Config Section (content type, field type)

**Steps**:
1. Locate all select dropdowns
2. Verify closed appearance:
   - ✅ Border visible
   - ✅ Arrow icon visible on right
   - ✅ Selected value displayed
   - ✅ Proper height (`h-8`)
3. Click to open dropdown:
   - ✅ Options list appears
   - ✅ Options list styled consistently
   - ✅ Hover highlights option
4. Select an option:
   - ✅ Dropdown closes
   - ✅ Selected value updates
   - ✅ Change event fires
5. Test disabled state:
   - ✅ Background grayed out
   - ✅ Arrow icon muted
   - ✅ Not clickable

**Expected Result**: All selects use DaisyUI `.select .select-bordered` styles.

---

### Test Case 5: Textarea Component ✅

**Location**: Classifier Section (taxonomy JSON), YAML Config Section (value path examples)

**Steps**:
1. Locate textarea elements
2. Verify appearance:
   - ✅ Border visible
   - ✅ Minimum height set
   - ✅ Resizable (vertical only)
   - ✅ Proper padding
3. Focus on textarea:
   - ✅ Border color changes
   - ✅ Focus ring appears
   - ✅ Cursor visible
4. Type multiline text:
   - ✅ Text wraps correctly
   - ✅ Scrollbar appears when needed
   - ✅ Line breaks preserved
5. Resize textarea:
   - ✅ Height can be dragged
   - ✅ Width locked
   - ✅ Minimum height respected

**Expected Result**: Textareas use DaisyUI `.textarea .textarea-bordered` consistently.

---

### Test Case 6: Alert Component ✅

**Location**: Messages Section (transfer messages), YAML Config Section (error alerts), AI Section (timestamp hint), Deep Research Section (multiple reports info)

**Steps**:
1. Trigger scenarios that show alerts:
   - Transfer config (import/export success/error)
   - YAML validation errors
   - AI section hints
2. Verify alert appearance:
   - ✅ Icon present (if specified)
   - ✅ Message text readable
   - ✅ Background color matches type
   - ✅ Border color matches type
   - ✅ Padding appropriate
3. Test alert types:
   - ✅ Info (blue)
   - ✅ Success (green)
   - ✅ Warning (yellow)
   - ✅ Error (red)
4. Test dismissible alerts:
   - ✅ Close button appears (✕)
   - ✅ Click close button
   - ✅ Alert disappears with animation
   - ✅ No console errors

**Expected Result**: All alerts use DaisyUI `.alert .alert-{type}` classes.

---

### Test Case 7: Card Component ✅

**Location**: All sections (section containers use card styling via AobFormGroup)

**Steps**:
1. View all sections on Options page
2. Verify card appearance:
   - ✅ Rounded corners
   - ✅ Border visible
   - ✅ Shadow subtle but present
   - ✅ Background color correct
   - ✅ Padding consistent
3. Check card header (section titles):
   - ✅ Title font size correct
   - ✅ Title font weight correct
   - ✅ Spacing below title
4. Check card body:
   - ✅ Content properly padded
   - ✅ Content not touching edges
5. Check card footer (if applicable):
   - ✅ Footer separated from body
   - ✅ Footer content aligned

**Expected Result**: All section cards follow DaisyUI card structure (via AobFormGroup).

---

## 🖼️ Visual Regression Screenshots

### Recommended Tool: Manual Screenshots

**Steps**:
1. Open Options page in Chrome
2. Set browser size to 1920x1080
3. Take full-page screenshot using:
   ```javascript
   // Run in DevTools Console
   await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for render
   const element = document.body;
   const rect = element.getBoundingRect();
   console.log('Screenshot area:', rect);
   ```
4. Use Chrome's built-in screenshot tool:
   - Open DevTools (F12)
   - Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
   - Type "Capture full size screenshot"
   - Save to `docs/screenshots/phase1.5/`

### Screenshot Checklist

| Component | Screenshot | Status |
|-----------|------------|--------|
| Full Options page (light mode) | `options-full-light.png` | ⏸️ Manual |
| Button variants grid | `buttons-all-variants.png` | ⏸️ Manual |
| Input states (normal, focus, disabled) | `inputs-states.png` | ⏸️ Manual |
| Checkbox states | `checkboxes-states.png` | ⏸️ Manual |
| Select dropdown | `select-dropdown.png` | ⏸️ Manual |
| Alerts (all types) | `alerts-all-types.png` | ⏸️ Manual |
| Cards (sections) | `cards-sections.png` | ⏸️ Manual |

**Storage**: Save all screenshots to `docs/screenshots/phase1.5/`

---

## 🎯 Acceptance Criteria

### Visual Consistency

| Criterion | Status |
|-----------|--------|
| **All buttons** follow DaisyUI `.btn` style | ✅ Expected |
| **All inputs** follow DaisyUI `.input` style | ✅ Expected |
| **All checkboxes** follow DaisyUI `.checkbox` style | ✅ Expected |
| **All selects** follow DaisyUI `.select` style | ✅ Expected |
| **All alerts** follow DaisyUI `.alert` style | ✅ Expected |
| **All cards** follow DaisyUI `.card` structure | ✅ Expected |
| **No visual regressions** from pre-migration | ✅ Expected |
| **Consistent spacing** across components | ✅ Expected |
| **Consistent colors** across components | ✅ Expected |
| **Smooth transitions** on hover/focus | ✅ Expected |

### Browser Compatibility

Test in the following browsers:

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest (v120+) | ⏸️ Primary target |
| Firefox | Latest (v120+) | ⏸️ Secondary |
| Safari | Latest (v17+) | ⏸️ Optional |
| Edge | Latest (v120+) | ⏸️ Optional |

**Note**: Chrome is the primary target for browser extensions.

---

## 🐛 Known Issues & Limitations

### Not Tested

1. **Dark Mode**: Not enabled in current config
   - Action: Add in Phase 2 if needed
   - Config change: `daisyui.themes: ['light', 'dark']`

2. **Mobile Responsive**: Options page not primarily designed for mobile
   - Action: Low priority, desktop-first

3. **Accessibility (A11y)**: Not covered in this visual test
   - Action: Separate A11y audit recommended
   - Focus indicators present but not validated

4. **Animation Performance**: Not measured
   - Action: Monitor in production if performance issues arise

---

## 📋 Post-Testing Actions

### If Visual Regressions Found

1. **Document the regression**:
   - Component name
   - Expected vs. actual behavior
   - Screenshot comparison
   - Browser/OS details

2. **Determine severity**:
   - P0 (Blocker): Breaks functionality
   - P1 (High): Major visual difference
   - P2 (Medium): Minor styling inconsistency
   - P3 (Low): Aesthetic preference

3. **Fix or accept**:
   - P0/P1: Must fix before Phase 2
   - P2/P3: Document as known issue, fix later if needed

### If No Regressions

1. ✅ Mark Phase 1.5 Visual Testing as **COMPLETE**
2. ✅ Update `migration-log.md` with test results
3. ✅ Proceed to Phase 2 planning

---

## 🚀 Automation Recommendations (Future)

### Tools to Consider

| Tool | Type | Pros | Cons |
|------|------|------|------|
| **Percy** | Visual regression | Cloud-based, easy setup | Paid service |
| **Chromatic** | Visual regression | Storybook integration | Paid service |
| **BackstopJS** | Visual regression | Free, open-source | Manual setup |
| **Puppeteer** | Screenshot automation | Flexible, free | Need to write tests |
| **Playwright** | E2E + screenshots | Modern, powerful | Learning curve |

**Recommendation**: If visual regression becomes critical, consider **Percy** or **BackstopJS** in Phase 2.

### Sample Automation (Playwright)

```typescript
// tests/visual/options-page.spec.ts
import { test, expect } from '@playwright/test';

test('Options page visual snapshot', async ({ page }) => {
  await page.goto('chrome-extension://<id>/options/index.html');
  await page.waitForLoadState('networkidle');

  // Full page screenshot
  await expect(page).toHaveScreenshot('options-full.png', {
    fullPage: true,
    threshold: 0.2 // 20% threshold for minor differences
  });
});

test('Button variants snapshot', async ({ page }) => {
  await page.goto('chrome-extension://<id>/options/index.html');

  const buttons = page.locator('.btn');
  await expect(buttons.first()).toHaveScreenshot('button-primary.png');
});
```

---

## 📝 Testing Checklist Summary

### Pre-Testing

- [x] ✅ Build completed successfully
- [x] ✅ Extension loaded in Chrome
- [x] ✅ Options page accessible
- [ ] ⏸️ DevTools opened

### During Testing

- [ ] ⏸️ Test all button variants
- [ ] ⏸️ Test all input states
- [ ] ⏸️ Test all checkbox states
- [ ] ⏸️ Test all select dropdowns
- [ ] ⏸️ Test all alert types
- [ ] ⏸️ Test all card sections
- [ ] ⏸️ Take screenshots

### Post-Testing

- [ ] ⏸️ Document any regressions
- [ ] ⏸️ Create regression report (if needed)
- [ ] ⏸️ Update migration-log.md
- [ ] ⏸️ Mark Phase 1.5 as complete

---

## 📎 Related Documents

- [Phase 1 Migration Log](./migration-log.md)
- [Phase 1.5 Cleanup Guide](./PHASE1.5-CLEANUP-GUIDE.md)
- [Bundle Size Report](./phase1-bundle-size.md)

---

**Guide Created**: 2025-11-26 23:50
**Status**: ⏸️ **Ready for Manual Execution**
**Estimated Time**: 1-2 hours
**Responsibility**: Developer or QA Tester

**Note**: This guide provides a comprehensive checklist for manual visual regression testing. While automation is recommended for long-term maintenance, manual testing is sufficient for Phase 1.5 validation.
