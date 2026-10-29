import {esc,safeUrl,money,btn} from './ui.js';
export const categoryColor=p=>({device:'#d9e6ff',accessory:'#dff4e8',service:'#fff1d6'})[p.category]||'#f3f4f6';
const inline=text=>esc(text).replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g,(_,alt,url)=>safeUrl(url)?`<img src="${esc(safeUrl(url))}" alt="${alt}" loading="lazy">`:'').replace(/\[([^\]]+)\]\(([^\s)]+)\)/g,(_,label,url)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`:label).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
export function productRichText(value,{allowInlineStyles=false}={}){
 const raw=String(value||'');
 if(/<\/?(?:p|div|img|h[1-6]|ul|ol|table|br)\b/i.test(raw)){
  if(typeof DOMParser==='undefined')return esc(raw.replace(/<[^>]*>/g,''));
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const allowed=new Set(['P','DIV','BR','H1','H2','H3','H4','H5','H6','UL','OL','LI','STRONG','B','EM','I','U','S','BLOCKQUOTE','HR','TABLE','THEAD','TBODY','TR','TH','TD','IMG','A','SPAN']);
  const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','TEMPLATE']);
  const safeStyle=node=>{
   if(!allowInlineStyles)return '';
   const properties=['color','background-color','border','border-left','border-color','border-radius','padding','margin','font-size','font-weight','line-height','text-align'];
   const styles=properties.map(key=>{const value=node.style.getPropertyValue(key);return value&&/^[#(),.%\w\s-]+$/.test(value)&&!/(?:url|expression|javascript|behavior)/i.test(value)?`${key}:${value}`:''}).filter(Boolean).join(';');
   return styles?` style="${esc(styles)}"`:'';
  };
  const clean=node=>{if(node.nodeType===3)return esc(node.textContent);if(node.nodeType!==1||blocked.has(node.tagName))return '';const children=[...node.childNodes].map(clean).join('');if(!allowed.has(node.tagName))return children;const tag=node.tagName.toLowerCase();if(tag==='img'){const url=safeUrl(node.getAttribute('src'));return url?`<img src="${esc(url)}" alt="${esc(node.getAttribute('alt')||'')}" loading="lazy">`:''}if(tag==='br'||tag==='hr')return `<${tag}>`;if(tag==='a'){const url=safeUrl(node.getAttribute('href'));return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${children}</a>`:children}return `<${tag}${safeStyle(node)}>${children}</${tag}>`};
  return [...doc.body.childNodes].map(clean).join('');
 }
 return raw.split(/\r?\n/).map(line=>{if(!line.trim())return '';const h=line.match(/^(#{1,6})\s+(.*)/);if(h)return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;return `<p>${inline(line.replace(/^[-*]\s+/,'• '))}</p>`}).join('');
}
export function productDescription(value,limit=144){
 let text;
 if(typeof DOMParser!=='undefined'){const doc=new DOMParser().parseFromString(productRichText(value),'text/html');doc.querySelectorAll('p,div,h1,h2,h3,li,br').forEach(el=>el.append(' '));text=doc.body.textContent;}
 else text=String(value||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,' ').replace(/[#*`]/g,'');
 return Array.from(text.replace(/\s+/g,' ').trim()).slice(0,limit).join('');
}
export function productCover(p,detail=false){const src=safeUrl(p.imageUrl);return `<div class="shop-cover ${detail?'shop-cover-detail':''}" style="background:${categoryColor(p)}">${src?`<img data-product-cover src="${esc(src)}" alt="${esc(p.name)}" ${detail?'':'loading="lazy"'}>`:''}${!detail&&p.originalPrice>p.price?`<span class="shop-discount">${Math.round((1-p.price/p.originalPrice)*100)}% OFF</span>`:''}</div>`;}
export function shopProductCard(p){return `<article class="pc-product shop-product"><a class="shop-product-link" href="#/product?id=${encodeURIComponent(p.id)}">${productCover(p)}<div class="shop-product-body"><h3>${esc(p.name)}</h3><div class="shop-price-row"><strong>${money(p.price)}</strong><small>已售 ${esc(p.salesCount||0)}</small></div><del class="shop-original-price" ${p.originalPrice>p.price?'':'aria-hidden="true"'}>${p.originalPrice>p.price?money(p.originalPrice):'&nbsp;'}</del></div></a></article>`;}
export function shopProductDetail(p){const gallery=[...new Set([p.imageUrl,...(Array.isArray(p.galleryUrls)?p.galleryUrls:[])].filter(safeUrl))];const cover={...p,imageUrl:gallery[0]||''};return `<div class="shop-detail"><div class="shop-detail-top"><div>${productCover(cover,true)}${gallery.length>1?`<div class="shop-gallery">${gallery.map((u,i)=>`<button type="button" data-action="product-gallery" data-src="${esc(u)}" aria-label="查看商品图片${i+1}" aria-pressed="${i===0}"><img data-product-cover src="${esc(u)}" alt="商品图片${i+1}"></button>`).join('')}</div>`:''}</div><div class="shop-detail-info"><h1>${esc(p.name)}</h1><p class="shop-description">${esc(productDescription(p.description))}</p><div class="shop-detail-prices"><strong>${money(p.price)}</strong>${p.originalPrice>p.price?`<del>${money(p.originalPrice)}</del>`:''}</div><small>已售 ${esc(p.salesCount||0)} · 库存 ${esc(p.stock||0)}</small><div class="shop-buy-bar">${p.stock>0?'<button type="button" class="btn" data-action="checkout-open">立即购买</button>':'<button class="btn" disabled>暂时缺货</button>'}</div></div></div><section class="shop-rich-section"><h2>商品详情</h2><div class="shop-rich-content">${productRichText(p.description)||'<p class="muted">暂无商品详情</p>'}</div></section></div>`;}

export function relatedProducts(product,products){const items=products.filter(p=>String(p.id)!==String(product.id)&&p.category===product.category).slice(0,4);return `<section class="shop-related"><h2>同分类商品</h2>${items.length?`<div class="product-grid compact-products">${items.map(shopProductCard).join('')}</div>`:'<p class="muted">暂无同分类商品</p>'}</section>`;}
