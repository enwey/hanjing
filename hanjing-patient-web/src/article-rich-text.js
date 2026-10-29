import { esc } from './ui.js';
import { productRichText } from './shop.js';

export function articleRichText(content) {
  const raw = String(content || '');
  if (!/<\/?(?:p|div|img|h[1-6]|ul|ol|table|br)\b/i.test(raw)) return `<p class="prewrap article-content">${esc(raw)}</p>`;
  return `<div class="article-rich-content">${productRichText(raw, { allowInlineStyles: true })}</div>`;
}
