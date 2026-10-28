import { esc, link, btn, panel, kv, empty, records, today, form, field, area, submit, patientSelect } from './ui.js';
import { list, query } from './api.js';

export const treatmentTitles = {
  treatmentCalendar: '打卡日历', treatmentTrend: '睡眠趋势', treatmentReport: '睡眠报告',
  treatmentTimeline: '治疗时间线', treatmentAdvice: '医嘱建议', treatmentAdjust: '设备调整',
};
export const painLocations = ['上/下颌左大牙齿内侧、外侧','上/下颌右大牙齿内侧、外侧','上颌门牙齿内侧、外侧','下颌门牙齿内侧、外侧','上颌左关节痛','下颌右关节痛','咬合面痛','上/下断裂'];
const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value, max = 100) => Math.max(0, Math.min(max, n(value)));
const dateKey = value => String(value || '').slice(0, 10);
export function shiftDay(date, offset) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10); }
export function painValue(record) {
  if (record?.painScore !== null && record?.painScore !== undefined && record?.painScore !== '' && Number.isFinite(Number(record.painScore))) return clamp(record.painScore, 10);
  const match = String(record?.note || '').match(/VAS评分[：:]\s*(\d+)/);
  if (match) return clamp(match[1], 10);
  return ({5:0,4:2,3:4,2:6,1:8})[record?.comfort] ?? null;
}
const painClass = record => !record || n(record.wearDuration) <= 0 ? 'none' : painValue(record) === null ? 'unknown' : painValue(record) === 0 ? 'zero' : painValue(record) <= 3 ? 'mild' : painValue(record) <= 6 ? 'medium' : 'severe';
const painText = record => painValue(record) === null ? '—' : painValue(record) + ' / 10';
const legend = '<div class="treatment-legend"><span class="pain-zero">无痛（0）</span><span class="pain-mild">轻痛（1–3）</span><span class="pain-medium">中痛（4–6）</span><span class="pain-severe">重痛（7–10）</span><span class="pain-none">未打卡</span></div>';
export function comfortFromPain(value) {
  const score=clamp(value,10);
  return score<=0?5:score<=2?4:score<=4?3:score<=7?2:1;
}
export function dayMap(rows) { const map = new Map(); for (const r of rows) {const key = dateKey(r.date); if (!map.has(key)) map.set(key,r);} return map; }
const scopedLink = (label,page,c,extra={}) => link(label,page,{patientId:c.patientId,...extra});
const hidden = (name,value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
function averagePain(rows) { const values=rows.filter(r=>n(r.wearDuration)>0).map(painValue).filter(v=>v!==null); return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10 : '—'; }
function metrics(summary, rows, range='week') {
  const month=range==='month';
  rows = rows.filter(r => dateKey(r.date) >= shiftDay(today(), month ? -29 : -6) && dateKey(r.date) <= today());
  const items=[['本'+(month?'月':'周')+'佩戴',`${n(month?summary.wornDays:summary.weekWorn)} / ${month?30:7} 天`],['平均时长',`${n(month?summary.avgDuration:summary.weekAvg)} 小时`],['平均痛感',`${averagePain(rows)} / 10`],['连续天数',`${n(summary.streak)} 天`]];
  return `<div class="treatment-metrics">${items.map(([label,value])=>`<article><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`).join('')}</div>`;
}
function dailyChart(rows, days, end=today()) {
  const map=dayMap(rows);
  return `<div class="treatment-chart" role="list" aria-label="每日佩戴时长与疼痛情况">${Array.from({length:days},(_,i)=>{
    const date=shiftDay(end,i-days+1),r=map.get(date),duration=r?clamp(r.wearDuration,24):0;
    return `<div class="treatment-chart-day" role="listitem" title="${esc(date)}：${r?duration+'小时，疼痛 '+painText(r):'未打卡'}"><small>${esc(date.slice(5))}</small><div class="treatment-chart-track"><span class="pain-${painClass(r)}" style="height:${duration/24*100}%"></span></div><b>${r?esc(duration)+'h':'—'}</b><small>${r?'疼痛 '+esc(painText(r)):'未打卡'}</small></div>`;
  }).join('')}</div>${legend}`;
}
function treatmentScope(c) {return patientSelect(c.members,c.patientId);}
function treatmentHero(record, summary, c) {
 const compliance=clamp(summary.weekCompliance ?? summary.compliance);
 return `<section class="treatment-hero"><div class="treatment-hero-top"><span class="treatment-status">${record?'治疗中':'未开始'}</span><span>${record?'已佩戴 '+n(summary.streak)+' 天':'暂无诊疗记录'}</span></div><h2>${esc(record?.deviceModel || record?.device?.name || '暂无治疗记录')}</h2><p>${record?'主治：'+esc(record.doctorName || '--')+' 医生':'完成初诊适配后将在此展示'}</p><div class="treatment-hero-checkin">${btn('今日打卡','wearing',{patientId:c.patientId})}</div><div class="treatment-compliance"><div class="treatment-progress-track" role="progressbar" aria-label="佩戴依从率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${record?compliance:0}"><span style="width:${record?compliance:0}%"></span></div><span>${record?'依从率 '+compliance+'%':'依从率 --'}</span></div><small>初配日期：${esc(record?.startDate || dateKey(record?.createdAt) || '--')}</small></section>`;
}
function entries(c) {
 const items=[['睡眠趋势','佩戴与睡眠数据','treatmentTrend','trend'],['睡眠报告','AI智能分析与建议','treatmentReport','report'],['治疗时间线','就诊全记录','treatmentTimeline','timeline'],['医嘱建议','医生指导方案','treatmentAdvice','advice'],['设备调整','参数与调整记录','treatmentAdjust','adjust'],['医患社区','交流经验与心得','community','community']];
 const icons={"trend": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <polyline points=\"22 12 18 12 15 21 9 3 6 12 2 12\"></polyline>\n</svg>", "report": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#8B5CF6\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path>\n  <polyline points=\"14 2 14 8 20 8\"></polyline>\n  <line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"></line>\n  <line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"></line>\n  <polyline points=\"10 9 9 9 8 9\"></polyline>\n</svg>", "timeline": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#3B6BF5\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <circle cx=\"12\" cy=\"12\" r=\"10\"></circle>\n  <polyline points=\"12 6 12 12 16 14\"></polyline>\n</svg>", "advice": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#F59E0B\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M4.5 16.5c-1.5 1.26-2.5 3.19-2.5 5.5h20c0-2.31-1-4.24-2.5-5.5\"></path>\n  <path d=\"M12 2v10\"></path>\n  <circle cx=\"12\" cy=\"14\" r=\"2\"></circle>\n  <path d=\"M7 2a5 5 0 0 0 10 0\"></path>\n</svg>", "adjust": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#EF4444\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\"></path>\n</svg>", "community": "<svg aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#10B981\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path>\n  <circle cx=\"9\" cy=\"7\" r=\"4\"></circle>\n  <path d=\"M23 21v-2a4 4 0 0 0-3-3.87\"></path>\n  <path d=\"M16 3.13a4 4 0 0 1 0 7.75\"></path>\n</svg>"};
 return `<div class="treatment-entries">${items.map(([title,desc,target,icon])=>`<a href="#/${target}?${new URLSearchParams({patientId:c.patientId})}"><div class="treatment-entry-icon">${icons[icon]}</div><strong>${esc(title)}</strong><span>${esc(desc)}</span></a>`).join('')}</div>`;
}
function checkinButton(c,rows){const done=rows.some(r=>dateKey(r.date)===today());return `<div class="treatment-checkin-wrap"><a class="treatment-checkin-button" href="#/wearing?${new URLSearchParams({patientId:c.patientId})}"><strong>${done?'今日已打卡':'今日打卡'}</strong><span>${done?'查看或修改今日记录':'记录佩戴时长和感受'}</span></a></div>`;}
function timelineView(rows) {return records(rows,t=>`<article class="treatment-timeline-item"><small>${esc(t.date)}</small><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p></article>`,'暂无治疗动态记录');}
function navigation(c,range) {return `<nav class="treatment-range-options" aria-label="数据时间范围">${[['week','最近7天'],['month','最近30天']].map(([value,label])=>`<a href="#/${c.page}?${new URLSearchParams({patientId:c.patientId,range:value})}" class="${range===value?'selected':''}" ${range===value?'aria-current="true"':''}>${label}</a>`).join('')}</nav>`;}
function calendar(rows,c) {
  const current=today(), raw=c.params.get('month'), month=/^\d{4}-(0[1-9]|1[0-2])$/.test(raw||'')?raw:current.slice(0,7), start=month+'-01';
  const first=new Date(start+'T00:00:00Z'),year=first.getUTCFullYear(),mo=first.getUTCMonth();
  const prev=new Date(Date.UTC(year,mo-1,1)).toISOString().slice(0,7),next=new Date(Date.UTC(year,mo+1,1)).toISOString().slice(0,7),count=new Date(Date.UTC(year,mo+1,0)).getUTCDate(),map=dayMap(rows);
  const cells=Array.from({length:(first.getUTCDay()+6)%7},()=>'<div class="calendar-blank"></div>');
  for(let i=1;i<=count;i++){const date=month+'-'+String(i).padStart(2,'0'),r=map.get(date),inner=`<b>${i}</b><span>${r?esc(r.wearDuration)+' 小时':'未打卡'}</span><small>${r?'疼痛 '+esc(painText(r)):''}</small>`;cells.push(date<=current?`<a data-date="${date}" class="pain-${painClass(r)} ${date===current?'is-today':''}" href="#/wearing?${new URLSearchParams({patientId:c.patientId,date})}">${inner}</a>`:`<div data-date="${date}" class="pain-${painClass(r)} ${date===current?'is-today':''}">${inner}</div>`)}
  return `<div class="treatment-month-nav">${scopedLink('上月',c.page,c,{month:prev})}<h2>${esc(month.replace('-', '年'))}月</h2>${scopedLink('下月',c.page,c,{month:next})}</div><div class="treatment-calendar" aria-label="佩戴打卡月历">${['一','二','三','四','五','六','日'].map(x=>`<strong>周${x}</strong>`).join('')}${cells.join('')}</div>${legend}`;
}
export function wearingForm(c, rows=[]) {
  const date=c.params.get('date'),valid=/^\d{4}-\d{2}-\d{2}$/.test(date||'') && date<=today(),value=valid?date:today(),existing=rows.find(r=>dateKey(r.date)===value);
  const locations=Array.isArray(existing?.painLocations)?existing.painLocations:[];
  const fields=hidden('patientId',c.patientId)+field('日期','date',value,'date',`required max="${today()}"`)+field('佩戴时长（小时）','wearDuration',existing?.wearDuration ?? '','number','required min="0" max="24" step="0.1"')+field('疼痛评分（0—10）','painScore',existing?painValue(existing) ?? 0:0,'number','required min="0" max="10" step="1"')+`<fieldset class="treatment-pain-locations"><legend>疼痛部位（可多选）</legend>${painLocations.map(label=>`<label><input type="checkbox" name="painLocations" value="${esc(label)}" ${locations.includes(label)?'checked':''}>${esc(label)}</label>`).join('')}</fieldset>`+area('备注','note',existing?.note || '','maxlength="1000"')+submit(existing?'更新佩戴记录':'保存佩戴记录');
  return panel(existing?'修改当日佩戴记录':'记录佩戴时长和感受',form('wearing',fields));
}

export async function renderTreatment(c,{scoped,scopeBar,head}) {
  const requestedPatient = c.params.get('patientId');
  await scoped(c);
  if (requestedPatient && !c.members.some(member => String(member.id) === requestedPatient)) return head(c.page)+empty('无法访问所选就诊人',link('管理就诊人','family'));
  let body=head(c.page,'记录佩戴与感受，持续了解治疗进展。',btn('病历档案','medical',{patientId:c.patientId}))+treatmentScope(c);
  if(!c.patientId) return body+empty('请先添加就诊人',btn('就诊人管理','family'));
  const q=query({patientId:c.patientId}), range=c.params.get('range')==='month'?'month':'week';
  const record=await c.get('/treatment/record'+q);c.device=record;
  if(c.page==='treatmentAdvice') return body+panel('医嘱建议',record?kv([['主治医生',record.doctorName],['诊断',record.diagnosis],['治疗方案',record.treatmentPlan],['医生建议',record.doctorAdvice],['复诊 / 调整日期',record.followupDate || record.nextAdjustDate]]):empty('暂无医嘱，完成就诊后可查看医生指导。',link('预约就诊','stores')));
  if(c.page==='treatmentTimeline') return body+panel('治疗时间线',timelineView(list(await c.get('/treatment/timeline'+q))));
  if(c.page==='treatmentAdjust') {const rows=list(await c.get('/treatment/adjustments'+q));return body+panel('当前设备参数',record?kv([['设备',record.deviceModel],['当前前移量',record.adjustmentValue==null?'—':record.adjustmentValue+' mm'],['下次调整日期',record.nextAdjustDate],['主治医生',record.doctorName]]):empty('暂无绑定设备，完成初诊适配后可查看。',link('预约就诊','stores')))+panel('调整记录',records(rows,r=>`<article class="pc-list-row"><div><h3>${esc(r.date)} · ${esc(r.value ?? r.adjustmentValue ?? '—')} mm</h3><p>${esc(r.note)}</p></div><small>${esc(r.doctor || r.doctorName)}</small></article>`,'暂无设备调整记录'));}
  if(c.page==='treatmentReport') {const report=await c.get('/treatment/sleep-report'+q+'&range='+range);return body+navigation(c,range)+panel('睡眠报告',report?.hasData?kv([['综合评分',report.score==null?'—':report.score+' / 100'],['平均佩戴',report.weekAvg+' 小时'],['佩戴依从率',report.compliance+'%'],['平均疼痛',report.avgPainScore+' / 10'],['连续记录',report.streak+' 天']])+`<p class="muted">报告由佩戴记录汇总，供治疗随访参考。</p>`:empty('暂无真实佩戴数据，完成打卡后可查看汇总。',btn('今日打卡','wearing',{patientId:c.patientId})))+(report?.hasData?panel('每日汇总',records(report.trend || [],r=>`<div class="pc-list-row"><strong>${esc(r.date)}</strong><span>评分 ${esc(r.score)} / 100 · 疼痛 ${esc(r.painScore)} / 10</span></div>`,'暂无趋势数据')):'');}
  const [rawRows,rawSummary]=await Promise.all([c.get('/treatment/wearing-records'+q),c.get('/treatment/wearing-summary'+q)]),rows=list(rawRows),summary=rawSummary || {};
  if(c.page==='treatmentCalendar') return body+panel('打卡日历',calendar(rows,c))+metrics(summary,rows)+checkinButton(c,rows);
  if(c.page==='treatmentTrend') return body+navigation(c,range)+metrics(summary,rows,range)+panel('每日佩戴与痛感',dailyChart(rows,range==='month'?30:7))+(!rows.length?empty('暂无佩戴记录，打卡后可查看趋势。',btn('今日打卡','wearing',{patientId:c.patientId})):'');
  const timeline=list(await c.get('/treatment/timeline'+q));
  return body+'<div class="treatment-layout"><div class="treatment-main">'+treatmentHero(record,summary,c)+panel('打卡日历',calendar(rows,c))+metrics(summary,rows)+checkinButton(c,rows)+'<h2 class="treatment-section-title">更多功能</h2>'+entries(c)+'</div><aside class="treatment-sidebar" aria-label="治疗动态">'+panel('治疗动态',timelineView(timeline.slice(0,3)))+'</aside></div>';
}
