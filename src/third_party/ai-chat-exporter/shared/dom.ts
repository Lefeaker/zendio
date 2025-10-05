/**
 * Remove unwanted UI elements from the DOM before conversion
 * This includes buttons, footers, and other non-content elements
 */
export function cleanupUIElements(container: HTMLElement): void {
  const selectorsToRemove = [
    '.thoughts-header-button-content',
    '[class*="thoughts-header-button"]',
    '[class*="thinking-header-button"]',
    '.mat-mdc-button-ripple',
    '[class*="button-ripple"]',
    'button',
    '.button',
    '[role="button"]',
    'nav',
    '.navigation',
    '.controls',
    '.tooltip',
    '.overlay',
    '.popup',
    '[hidden]',
    '[style*="display: none"]',
    '[style*="display:none"]',
    '[aria-hidden="true"]',
    '.tabular-nums',
    '[class*="tabular-nums"]',
    'sources-carousel',
    'sources-carousel-inline',
    'card-renderer',
    'default-source-card',
    'url-source-card'
  ];

  selectorsToRemove.forEach(selector => {
    try {
      const elements = container.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    } catch (error) {
      console.debug('[cleanupUIElements] ignore invalid selector', { selector, error });
    }
  });

  const textPatternsToRemove = [
    /^导出到\s*Google\s*表格$/i,
    /^Export to\s*Google\s*Sheets$/i,
    /^复制$/i,
    /^Copy$/i,
    /^下载$/i,
    /^Download$/i,
    /^显示思路$/i,
    /^Show\s*thinking$/i,
    /^隐藏思路$/i,
    /^Hide\s*thinking$/i,
    /^思考过程$/i,
    /^Thinking$/i,
    /^您说[：:]\s*$/i,
    /^ChatGPT\s*说[：:]\s*$/i,
    /^You\s+said[：:]\s*$/i,
    /^ChatGPT\s+said[：:]\s*$/i,
    /^\d+\/\d+$/
  ];

  const allElements = Array.from(container.querySelectorAll('*'));
  allElements.forEach(el => {
    if (el.tagName.toLowerCase() === 'table' || el.querySelector('table')) {
      return;
    }

    const text = el.textContent?.trim() || '';
    if (textPatternsToRemove.some(pattern => pattern.test(text))) {
      if (el.children.length === 0 || text.length < 50) {
        el.remove();
      }
    }
  });

  const tables = container.querySelectorAll('table');
  tables.forEach(table => {
    let nextSibling = table.nextElementSibling;
    while (nextSibling) {
      const text = nextSibling.textContent?.trim() || '';
      const isFooter =
        nextSibling.classList.contains('table-footer') ||
        /导出|export|复制|copy|下载|download/i.test(text);

      if (isFooter && text.length < 100) {
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      } else {
        break;
      }
    }
  });
}
