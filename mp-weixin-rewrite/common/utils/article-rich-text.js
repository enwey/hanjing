const HTML_TAG = /<\/?(?:p|div|span|img|h[1-6]|ul|ol|li|table|blockquote|strong|b|em|br)\b/i;

function decodeEntities(value) {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()] || entity;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}

// Feed native rich-text directly. No optional flag may send HTML into <text>.
function articleRichText(value) {
  const original = value === null || value === undefined ? '' : String(value);
  let html = original;
  for (let i = 0; i < 3 && !HTML_TAG.test(html) && /&(?:amp;)*lt;/i.test(html); i += 1) {
    html = decodeEntities(html);
  }
  if (HTML_TAG.test(html)) return html;
  const children = [];
  original.split(/\r?\n/).forEach((line, index) => {
    if (index) children.push({ name: 'br' });
    children.push({ type: 'text', text: line });
  });
  return [{ name: 'div', children }];
}

module.exports = { articleRichText };
