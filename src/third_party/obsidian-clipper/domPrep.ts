// Obsidian Web Clipper - DOM Preprocessing
// Migrated from: https://github.com/obsidianmd/obsidian-clipper
// License: MIT

/**
 * Preprocess document before Readability extraction
 * Cleans up the DOM and converts relative URLs to absolute URLs
 */
export function preprocessDocument(doc: Document, baseUrl: string): Document {
  // Remove unwanted elements
  doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove());

  // Convert relative URLs to absolute URLs
  makeUrlsAbsolute(doc, baseUrl);

  // Optional: Remove inline styles (uncomment if needed)
  // removeInlineStyles(doc);

  return doc;
}

/**
 * Convert all relative URLs to absolute URLs
 */
function makeUrlsAbsolute(doc: Document, baseUrl: string): void {
  const base = new URL(baseUrl);

  // Handle elements with src attribute
  doc.querySelectorAll('[src]').forEach((el: Element) => {
    const element = el as HTMLElement;
    const src = element.getAttribute('src');
    if (src) {
      try {
        const absoluteUrl = new URL(src, base).toString();
        element.setAttribute('src', absoluteUrl);
      } catch (error) {
        // Invalid URL, keep original
        console.warn('Invalid src URL:', src, error);
      }
    }
  });

  // Handle elements with href attribute
  doc.querySelectorAll('[href]').forEach((el: Element) => {
    const element = el as HTMLElement;
    const href = element.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      try {
        const absoluteUrl = new URL(href, base).toString();
        element.setAttribute('href', absoluteUrl);
      } catch (error) {
        // Invalid URL, keep original
        console.warn('Invalid href URL:', href, error);
      }
    }
  });

  // Handle srcset attributes for responsive images
  doc.querySelectorAll('[srcset]').forEach((el: Element) => {
    const element = el as HTMLElement;
    const srcset = element.getAttribute('srcset');
    if (srcset) {
      try {
        const absoluteSrcset = srcset
          .split(',')
          .map((src) => {
            const parts = src.trim().split(/\s+/);
            if (parts.length >= 1) {
              const url = parts[0];
              const descriptor = parts.slice(1).join(' ');
              const absoluteUrl = new URL(url, base).toString();
              return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
            }
            return src;
          })
          .join(', ');
        element.setAttribute('srcset', absoluteSrcset);
      } catch (error) {
        // Invalid URL, keep original
        console.warn('Invalid srcset URL:', srcset, error);
      }
    }
  });

  // Handle data-src attributes (lazy loading)
  doc.querySelectorAll('[data-src]').forEach((el: Element) => {
    const element = el as HTMLElement;
    const dataSrc = element.getAttribute('data-src');
    if (dataSrc) {
      try {
        const absoluteUrl = new URL(dataSrc, base).toString();
        element.setAttribute('data-src', absoluteUrl);
      } catch (error) {
        // Invalid URL, keep original
        console.warn('Invalid data-src URL:', dataSrc, error);
      }
    }
  });
}

/**
 * Additional cleanup functions that can be used as needed
 */

/**
 * Remove elements by selector
 */
export function removeElementsBySelector(doc: Document, selector: string): void {
  doc.querySelectorAll(selector).forEach((el) => el.remove());
}

/**
 * Remove elements with specific classes (common ad/tracking classes)
 */
export function removeAdsAndTracking(doc: Document): void {
  const adSelectors = [
    '.ad',
    '.ads',
    '.advertisement',
    '.banner',
    '.popup',
    '.modal',
    '.overlay',
    '.social-share',
    '.share-buttons',
    '.newsletter-signup',
    '.subscription',
    '.cookie-notice',
    '.cookie-banner',
    '.tracking',
    '.analytics',
    '[class*="ad-"]',
    '[class*="ads-"]',
    '[id*="ad-"]',
    '[id*="ads-"]'
  ];

  adSelectors.forEach((selector) => {
    try {
      removeElementsBySelector(doc, selector);
    } catch (error) {
      // Invalid selector, skip
      console.warn('Invalid selector:', selector, error);
    }
  });
}

/**
 * Clean up common unwanted attributes
 */
export function cleanupAttributes(doc: Document): void {
  const unwantedAttributes = [
    'onclick',
    'onload',
    'onerror',
    'onmouseover',
    'onmouseout',
    'data-track',
    'data-analytics',
    'data-ga',
    'data-facebook',
    'data-twitter',
    'data-pinterest'
  ];

  unwantedAttributes.forEach((attr) => {
    doc.querySelectorAll(`[${attr}]`).forEach((el) => {
      el.removeAttribute(attr);
    });
  });
}

/**
 * Comprehensive preprocessing with all cleanup options
 */
export function preprocessDocumentFull(doc: Document, baseUrl: string): Document {
  // Basic preprocessing
  preprocessDocument(doc, baseUrl);

  // Additional cleanup
  removeAdsAndTracking(doc);
  cleanupAttributes(doc);

  return doc;
}
