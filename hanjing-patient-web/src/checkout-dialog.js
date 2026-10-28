import {esc} from './ui.js';

export function createCheckoutDialog({getCurrent,session,load,updateDelivery}) {
  let dialog=null, trigger=null, overflow='', version=0;
  const valid=c=>getCurrent()===c&&session.token()===c.token;
  function close(force=false) {
    if(!force&&dialog?.querySelector('form')?.dataset.busy==='true')return;
    version++;
    if(!dialog)return;
    dialog.close();dialog.remove();dialog=null;
    document.body.style.overflow=overflow;
    if(!force&&trigger?.isConnected)trigger.focus({preventScroll:true});
  }
  async function open(c) {
    if(!valid(c)||c.page!=='product'||dialog)return;
    trigger=document.activeElement;overflow=document.body.style.overflow;
    dialog=document.createElement('dialog');dialog.className='checkout-dialog';
    dialog.setAttribute('aria-labelledby','checkout-dialog-title');
    dialog.innerHTML='<header><div><h2 id="checkout-dialog-title">确认订单</h2><p>请核对商品与收货信息</p></div><button type="button" data-checkout-close aria-label="关闭确认订单"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="checkout-dialog-body"><p role="status">正在加载订单信息…</p></div>';
    document.body.append(dialog);document.body.style.overflow='hidden';dialog.showModal();
    dialog.addEventListener('error',e=>{
      if(!(e.target instanceof HTMLImageElement)||!e.target.matches('.parity-thumb'))return;
      const placeholder=document.createElement('div');placeholder.className='image-fallback parity-thumb';
      placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label','暂无图片');
      placeholder.textContent=e.target.alt?.slice(0,1)||'兴';e.target.replaceWith(placeholder);
    },true);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
    dialog.addEventListener('click',e=>{
      if(e.target.closest('[data-checkout-close]'))close();
      else if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}
      else if(e.target.closest('[data-checkout-retry]'))populate(c);
    });
    await populate(c);
  }
  async function populate(c) {
    const el=dialog, ticket=++version;
    el.querySelector('.checkout-dialog-body').innerHTML='<p role="status">正在加载订单信息…</p>';
    try {
      const data=await load(c);
      if(!valid(c)||el!==dialog||ticket!==version)return;
      if(!(Number(data.product.stock)>0))throw Error('商品暂时缺货，请稍后再试');
      Object.assign(c,{product:data.product,stores:data.stores});
      const template=document.createElement('template');template.innerHTML=data.html;
      const panel=template.content.querySelector('.pc-panel');
      if(!panel?.querySelector('[data-form="order"]'))throw Error('订单信息加载失败，请重试');
      const summary=document.createElement('div');summary.className='checkout-product';
      const details=document.createElement('div');
      const thumbnail=panel.querySelector('.parity-thumb');
      if(thumbnail)summary.append(thumbnail);
      details.append(panel.querySelector('h2'),panel.querySelector('.price'));
      summary.append(details);panel.prepend(summary);
      el.querySelector('.checkout-dialog-body').replaceChildren(panel);
      updateDelivery(panel.querySelector('form'));
    } catch(error) {
      if(!valid(c)||el!==dialog||ticket!==version)return;
      el.querySelector('.checkout-dialog-body').innerHTML=`<div role="alert"><p>${esc(error.message)}</p><button type="button" class="btn secondary" data-checkout-retry>重新加载</button></div>`;
    }
  }
  return {open,close};
}
