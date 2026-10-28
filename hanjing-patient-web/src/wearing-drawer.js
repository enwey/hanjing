import { esc, today } from './ui.js';
import { list, query } from './api.js';
import { painLocations, painValue, comfortFromPain } from './treatment.js';

export function painMeta(value) {
  const score=Number(value);
  return score===0?{label:'无痛',level:'none'}:score<=3?{label:'轻度疼痛',level:'mild'}:score<=6?{label:'中度疼痛',level:'moderate'}:{label:'重度疼痛',level:'severe'};
}
export function validCheckinDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value || ''))return false;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value<=today();
}
export function checkinPayload({patientId,date,wearDuration,painScore,note,painLocations:locations=[]}) {
  if(!String(patientId||'').trim())throw Error('请先选择就诊人');
  if(!validCheckinDate(date))throw Error('请选择有效日期，不能选择未来日期');
  if(wearDuration===''||wearDuration==null||!Number.isFinite(Number(wearDuration))||Number(wearDuration)<0||Number(wearDuration)>24)throw Error('佩戴时长应在0至24小时之间');
  if(painScore===''||painScore==null||!Number.isInteger(Number(painScore))||Number(painScore)<0||Number(painScore)>10)throw Error('疼痛评分应为0至10的整数');
  return {patientId:String(patientId),date,wearDuration:Number(wearDuration),painScore:Number(painScore),comfort:comfortFromPain(painScore),painLocations:locations.filter(v=>painLocations.includes(v)),note:String(note||'').trim().slice(0,1000)};
}
function remark(record) { const note=String(record?.note||'');const matched=note.match(/备注：([\s\S]*)$/);return matched?matched[1].trim():note.includes('VAS评分：')?'':note; }
function selectedLocations(record) {
  if(record?.painLocations?.length)return record.painLocations;
  return String(record?.note||'').match(/疼痛部位：([^\n]+)/)?.[1].split('、') || [];
}
export function drawerForm({patientId,patientName,date,record}) {
  const duration=record?.wearDuration ?? 7,score=record?painValue(record)??2:2,meta=painMeta(score),locations=selectedLocations(record);
  return `<form class="checkin-form" data-checkin-form>
    <div class="checkin-body">
      <div class="checkin-context"><div><small>当前就诊人</small><strong>${esc(patientName)}</strong></div><label><span>打卡日期</span><input type="date" name="date" value="${esc(date)}" max="${today()}" required aria-description="请选择打卡日期，不晚于今天"><small class="input-hint">请选择打卡日期，不晚于今天</small></label></div>
      <section class="checkin-section"><div class="checkin-section-head"><h3>佩戴时长</h3><span><b data-duration-value>${esc(duration)}</b> 小时</span></div>
        <div class="checkin-duration-options" role="group" aria-label="快捷选择佩戴时长">${Array.from({length:10},(_,i)=>i+1).map(h=>`<label><input type="radio" name="quickDuration" value="${h}" ${Number(duration)===h?'checked':''}><span>${h}<small>h</small></span></label>`).join('')}</div>
        <input type="hidden" name="wearDuration" value="${esc(duration)}">
      </section>
      <section class="checkin-section"><div class="checkin-section-head"><h3>舒适度评分 <small>VAS</small></h3><span class="checkin-pain-badge" data-pain-level="${meta.level}" data-pain-badge>${meta.label}</span></div>
        <div class="checkin-pain-panel"><div class="checkin-pain-number"><strong data-pain-value>${score}</strong><span> / 10 分</span></div><input class="checkin-pain-slider" type="range" name="painScore" min="0" max="10" step="1" value="${score}" aria-label="疼痛评分0至10"><div class="checkin-pain-scale"><span>0 · 无痛</span><span>10 · 剧痛</span></div></div>
      </section>
      <fieldset class="checkin-section checkin-locations"><legend>疼痛 / 不适部位 <small>可多选</small></legend><div>${painLocations.map(label=>`<label class="checkin-location"><input type="checkbox" name="painLocations" value="${esc(label)}" ${locations.includes(label)?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>
      <label class="checkin-note"><span>备注 <small>选填</small></span><textarea name="note" maxlength="1000" placeholder="记录今日佩戴感受，例如牙齿酸胀、睡眠变化…">${esc(remark(record))}</textarea></label>
      <div class="checkin-message" role="alert" aria-live="polite"></div>
    </div>
    <footer class="checkin-footer"><button type="button" class="checkin-cancel" data-checkin-close>取消</button><button type="submit" class="checkin-submit">${record?'保存修改':'确认打卡'}</button></footer>
  </form>`;
}

export function createWearingDrawer({request,post,session,onSaved,getPatientId=()=>''}) {
  let dialog=null,version=0,abort=null,busy=false,trigger=null,previousOverflow='',loadedRows=[],patient=null,snapshot='';
  const alive=(v)=>dialog&&v===version&&session.token()===snapshot;
  function close({force=false,restoreFocus=true}={}) {
    if(busy&&!force)return false;
    version++;abort?.abort();abort=null;busy=false;
    if(dialog){dialog.close();dialog.remove();dialog=null;document.body.style.overflow=previousOverflow;}
    if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});trigger=null;
    return true;
  }
  function paint(date) {
    const record=loadedRows.find(r=>String(r.date).slice(0,10)===date);
    dialog.querySelector('.checkin-stage').innerHTML=drawerForm({patientId:patient.id,patientName:patient.name,date,record});
    dialog.querySelector('#checkin-title').textContent=date===today()?'今日佩戴打卡':'佩戴打卡';
  }
  async function open({patientId=getPatientId(),date=today()}={},source=document.activeElement) {
    if(busy)return;
    close({restoreFocus:false});snapshot=session.token();if(!snapshot)return;
    const v=++version;trigger=source;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';abort=new AbortController();
    dialog=document.createElement('dialog');dialog.className='wearing-drawer';dialog.setAttribute('aria-labelledby','checkin-title');
    dialog.innerHTML=`<div class="checkin-shell"><header class="checkin-header"><div><small>治疗追踪</small><h2 id="checkin-title">今日佩戴打卡</h2><p>记录佩戴时长和感受</p></div><button type="button" class="checkin-close" data-checkin-close aria-label="关闭打卡面板"><span aria-hidden="true"></span></button></header><div class="checkin-stage"><div class="checkin-loading" role="status">正在加载打卡记录…</div></div></div>`;
    document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
    dialog.addEventListener('click',event=>{
      if(event.target.closest('[data-checkin-close]'))close();
      else if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}
    });
    dialog.addEventListener('input',event=>{
      const f=event.target.form;if(!f)return;
      if(event.target.name==='wearDuration'){dialog.querySelector('[data-duration-value]').textContent=event.target.value||'0';f.querySelectorAll('[name="quickDuration"]').forEach(x=>x.checked=Number(x.value)===Number(event.target.value))}
      if(event.target.name==='painScore'){const meta=painMeta(event.target.value);dialog.querySelector('[data-pain-value]').textContent=event.target.value;const badge=dialog.querySelector('[data-pain-badge]');badge.textContent=meta.label;badge.dataset.painLevel=meta.level}
    });
    dialog.addEventListener('change',event=>{
      const f=event.target.form;if(!f)return;
      if(event.target.name==='quickDuration'){f.elements.wearDuration.value=event.target.value;dialog.querySelector('[data-duration-value]').textContent=event.target.value}
      if(event.target.name==='date'&&validCheckinDate(event.target.value))paint(event.target.value);
    });
    dialog.addEventListener('submit',async event=>{
      event.preventDefault();event.stopPropagation();if(busy||!alive(v))return;
      const f=event.target;if(!f.reportValidity())return;
      const message=f.querySelector('.checkin-message');message.textContent='';let payload;
      try{payload=checkinPayload({...Object.fromEntries(new FormData(f)),patientId:patient.id,painLocations:[...f.querySelectorAll('[name="painLocations"]:checked')].map(x=>x.value)})}catch(error){message.textContent=error.message;return}
      busy=true;const controls=[...f.elements,dialog.querySelector('.checkin-close')];controls.forEach(x=>x.disabled=true);const button=f.querySelector('[type="submit"]'),label=button.textContent;button.textContent='保存中…';
      try{
        await post('/treatment/wearing',payload);
        if(!alive(v))return;
        busy=false;close({restoreFocus:false});await onSaved?.({patientId:payload.patientId,date:payload.date});
      }catch(error){if(alive(v)){message.textContent=error.message||'保存失败，请重试';controls.forEach(x=>x.disabled=false);button.textContent=label;busy=false;}}
    });
    try{
      const members=list(await request('/user/family-members',{signal:abort.signal,token:snapshot}));if(!alive(v))return;
      patient=patientId?members.find(p=>String(p.id)===String(patientId)):members.find(p=>p.relation==='self')||members[0];
      if(!patient)throw Error(patientId?'无法访问所选就诊人':'请先添加就诊人');
      loadedRows=list(await request('/treatment/wearing-records'+query({patientId:patient.id}),{signal:abort.signal,token:snapshot}));if(!alive(v))return;
      paint(validCheckinDate(date)?date:today());
    }catch(error){if(alive(v)&&error.name!=='AbortError')dialog.querySelector('.checkin-stage').innerHTML=`<div class="checkin-load-error" role="alert">${esc(error.message||'加载失败，请关闭后重试')}</div>`;}
  }
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const a=event.target.closest('a[href]');if(!a)return;const [route,search='']=a.getAttribute('href').split('?');if(route!=='#/wearing')return;
    event.preventDefault();event.stopImmediatePropagation();const p=new URLSearchParams(search);open({patientId:p.get('patientId')||getPatientId(),date:p.get('date')||today()},a);
  },true);
  return {open,close};
}
