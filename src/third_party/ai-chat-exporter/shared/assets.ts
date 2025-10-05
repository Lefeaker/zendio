export function convertBlobImageToBase64(imgElement: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;

    if (canvas.width === 0 || canvas.height === 0) {
      console.log('[Image] Image has no dimensions, skipping blob conversion');
      return null;
    }

    ctx.drawImage(imgElement, 0, 0);

    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    const sizeKB = Math.round((base64.length * 0.75) / 1024);
    console.log(`[Image] Converted blob URL to base64 (${sizeKB} KB)`);
    return base64;
  } catch (error) {
    console.error('[Image] Failed to convert blob URL to base64:', error);
    return null;
  }
}
