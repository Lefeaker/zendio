export function generateTextFragmentUrl(baseUrl: string, selectedText: string): string {
  const paragraphs = selectedText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  let textToUse = '';
  for (const paragraph of paragraphs) {
    const cleaned = paragraph.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 20) {
      textToUse = cleaned;
      break;
    }
  }

  if (!textToUse) {
    textToUse = selectedText.replace(/\s+/g, ' ').trim();
  }

  if (textToUse.length > 300) {
    textToUse = textToUse.substring(0, 300);
  }

  const encoded = encodeURIComponent(textToUse);
  return `${baseUrl}#:~:text=${encoded}`;
}
