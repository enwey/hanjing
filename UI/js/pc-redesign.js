'use strict';
// Standalone design prototype. No API, microphone, payment or account access.
const GROUPS = ['首页','预约就诊','睡眠评估','治疗追踪','健康商城','我的健康','账户与服务','社区','直播','分销中心','登录与协议'];
const PAGES = [
['home','首页','首页','pages/index/index'],
['community-tab','社区首页（小程序 Tab）','社区','pages/appointment/index'],
['appointments','我的预约','预约就诊','pages/appointment/booking/index'],
['assessment','睡眠评估','睡眠评估','pages/assessment/index'],
['treatment','治疗追踪','治疗追踪','pages/treatment/index'],
['products','健康商城','健康商城','pages/product/index'],
['profile','个人中心','我的健康','pages/profile/index'],
['login','手机号快捷登录','登录与协议','pages/auth/login'],
['agreement','用户协议','登录与协议','pages/auth/agreement/index'],
['privacy','隐私政策','登录与协议','pages/auth/privacy/index'],
['stores','选择门店','预约就诊','pages/appointment/store-select'],
['doctor','医生详情','预约就诊','pages/appointment/doctor-detail'],
['doctors','选择医生','预约就诊','pages/appointment/doctor-list'],
['times','选择时间','预约就诊','pages/appointment/time-select'],
['confirm','确认预约','预约就诊','pages/appointment/confirm'],
['success','预约成功','预约就诊','pages/appointment/success'],
['appointment-detail','预约详情','预约就诊','pages/appointment/detail'],
['map','门店位置','预约就诊','pages/appointment/map'],
['reschedule','预约改期','预约就诊','pages/appointment/reschedule'],
['questionnaire','ESS嗜睡量表','睡眠评估','pages/assessment/questionnaire/index'],
['assessment-result','问卷评估结果','睡眠评估','pages/assessment/result/index'],
['recording','AI鼾声分析','睡眠评估','pages/assessment/recording/index'],
['snore-result','鼾声分析报告','睡眠评估','pages/assessment/snore-result/index'],
['calendar','打卡日历','治疗追踪','pages/treatment/calendar/index'],
['trend','睡眠趋势','治疗追踪','pages/treatment/sleep-trend/index'],
['timeline','治疗时间线','治疗追踪','pages/treatment/timeline/index'],
['advice','医嘱建议','治疗追踪','pages/treatment/doctor-advice/index'],
['adjust','设备调整','治疗追踪','pages/treatment/adjust-detail/index'],
['sleep-report','睡眠报告','治疗追踪','pages/treatment/sleep-report/index'],
['product','商品详情','健康商城','pages/product/detail'],
['records','病历档案','我的健康','pages/profile/medical-records/index'],
['devices','阻鼾器管理','我的健康','pages/profile/device-manage/index'],
['wearing','佩戴数据','我的健康','pages/profile/device-manage/wearing-data/index'],
['maintenance','维护记录','我的健康','pages/profile/device-manage/maintenance/index'],
['feedback','使用反馈','我的健康','pages/profile/device-manage/feedback/index'],
['family','就诊人管理','我的健康','pages/profile/family-members/index'],
['add-member','新增就诊人','我的健康','pages/profile/family-members/add-member/index'],
['benefits','会员权益','我的健康','pages/profile/member-benefits/index'],
['settings','设置','账户与服务','pages/profile/settings/index'],
['personal','个人信息','账户与服务','pages/profile/settings/personal-info/index'],
['security','账号安全','账户与服务','pages/profile/settings/account-security/index'],
['notifications','消息通知','账户与服务','pages/profile/notifications/index'],
['service','在线客服','账户与服务','pages/profile/online-service/index'],
['orders','我的订单','健康商城','pages/order/index'],
['order','订单详情','健康商城','pages/order/detail'],
['distribution','分销中心','分销中心','pages/distribution/center/index'],
['commission','佣金明细','分销中心','pages/distribution/commission/index'],
['distribution-orders','推广订单','分销中心','pages/distribution/orders/index'],
['withdraw','申请提现','分销中心','pages/distribution/withdraw/index'],
['withdraw-records','提现记录','分销中心','pages/distribution/withdraw-records/index'],
['team','团队成员','分销中心','pages/distribution/team/index'],
['invite','邀请好友','分销中心','pages/distribution/invite/index'],
['distribution-products','推广商品','分销中心','pages/distribution/products/index'],
['rules','分销规则','分销中心','pages/distribution/rules/index'],
['live','直播中心','直播','pages/live/list/index'],
['playback','直播详情','直播','pages/live/playback/index'],
['community','社区','社区','pages/community/index'],
['post','社区详情','社区','pages/community/detail/index'],
['publish','发布动态','社区','pages/community/publish/index']
].map(([id,title,group,route])=>({id,title:MINI_REFERENCE.pages.find(p=>p.route===route)?.title||title,group,route}));
const state={loggedIn:false,returnTo:'profile',page:'home',mode:'preview',search:'',store:'兴康明诊所 · 深圳',doctor:'王医生',date:'10月28日 周三',time:'09:00–09:30',member:'林晓',answers:{},recording:false,seconds:0,filter:'全部',range:'近7天',submitted:false,postId:'p1',postLikes:{},favorites:{},postTags:[],replyTo:'',selectedProduct:0,selectedOrder:'pending'};
let timer=null, toastTimer=null;
const $=s=>document.querySelector(s);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={calendar:'M5 3v4m14-4v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 13h3m4 0h3m-10 4h3',wave:'M2 12h3l2-7 4 14 3-12 3 5h5',file:'M14 3H5v18h14V8l-5-5v5h5M8 12h8m-8 4h6',moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',bell:'M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3V8m4 13h4',check:'M5 12l4 4L19 6',arrow:'M5 12h14m-5-5 5 5-5 5'};
const icon=k=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(icons[k]||icons.file)+'"></path></svg>';
const btn=(label,to,style='')=>'<button class="btn '+style+'" data-go="'+to+'">'+label+'</button>';
const action=(label,act,style='secondary')=>'<button class="btn '+style+'" data-action="'+act+'">'+label+'</button>';
const link=(label,to)=>'<button class="text-button" data-go="'+to+'">'+label+'</button>';
const tag=(t,c='')=>'<span class="tag '+c+'">'+t+'</span>';
const panel=(title,body,extra='')=>'<section class="panel">'+(title?'<div class="panel-head"><h2>'+title+'</h2>'+extra+'</div>':'')+body+'</section>';
const info=rows=>'<dl class="info-list">'+rows.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';
const metrics=items=>'<div class="grid '+(items.length===3?'three':'four')+'">'+items.map(([t,n,u,sub])=>'<div class="metric"><label>'+t+'</label><strong>'+n+'<small>'+u+'</small></strong><small>'+sub+'</small></div>').join('')+'</div>';
const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const field=(label,type='text',value='',attrs='')=>'<label class="field"><span>'+label+'</span><input type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';
const select=(label,options)=>'<label class="field"><span>'+label+'</span><select>'+options.map(t=>'<option>'+t+'</option>').join('')+'</select></label>';
const tabs=(labels,selected=state.filter)=>'<div class="tabs">'+labels.map(t=>'<button data-filter="'+t+'" class="'+(t===selected?'active':'')+'">'+t+'</button>').join('')+'</div>';
const steps=(n=1)=>'<div class="stepper">'+['选择门店','选择医生','预约时间','确认预约'].map((t,i)=>(i?'<span class="step-line"></span>':'')+'<div class="step '+(i+1<=n?'active':'')+'"><i>'+(i+1)+'</i>'+t+'</div>').join('')+'</div>';
const chart=(sound=false)=>'<div class="chart-key">'+(sound?'声音强度 / dB · 本次录音':'平均佩戴时长 / 小时 · '+state.range+'佩戴趋势')+'</div><svg class="chart" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="趋势折线图"><path d="M0 25H600M0 70H600M0 115H600M0 160H600" fill="none" stroke="#E3E2DB" stroke-dasharray="4 5"/><path d="M0 135L100 108L200 118L300 67L400 81L500 52L600 39L600 175H0Z" fill="rgba(127,178,168,.18)"/><path d="M0 135L100 108L200 118L300 67L400 81L500 52L600 39" fill="none" stroke="#1B4B42" stroke-width="2.5"/><g fill="#fff" stroke="#1B4B42" stroke-width="2"><circle cx="100" cy="108" r="4"/><circle cx="200" cy="118" r="4"/><circle cx="300" cy="67" r="4"/><circle cx="400" cy="81" r="4"/><circle cx="500" cy="52" r="4"/></g></svg><div class="chart-labels">'+(sound?['00:00','01:00','02:00','03:00','04:00','05:00','06:00']:state.range==='本月'?['09.27','10.02','10.07','10.12','10.17','10.22','10.26']:['10.20','10.21','10.22','10.23','10.24','10.25','10.26']).map(t=>'<span>'+t+'</span>').join('')+'</div>';
const doctor=(name='王医生',spec='鼾症评估、口腔矫治器治疗',withTag=true)=>'<div class="doctor"><span class="doctor-avatar" aria-hidden="true">'+(name||'医').slice(0,1)+'</span><div><h3>'+name+' <small style="font-size:11px;font-weight:400">主治医师</small></h3>'+(withTag?tag('睡眠呼吸健康','blue'):'')+'<p>擅长：'+spec+'</p></div></div>';
const member=()=>!state.loggedIn?btn('登录后为自己或家人评估','login','secondary small'):'<button class="btn secondary small" data-action="member">就诊人：'+state.member+' ▾</button>';
const heading=(title,sub,extra='')=>'<div class="page-heading"><div><h1>'+title+'</h1><p>'+sub+'</p></div>'+extra+'</div>';
const split=(main,side)=>'<div class="split"><div>'+main+'</div><aside>'+side+'</aside></div>';
const careAside=()=>panel('我的治疗团队',doctor()+ '<hr class="rule"><p style="font-size:12px">按计划佩戴，定期记录使用感受。设备调整请先咨询医生。</p>'+btn('查看医嘱建议','advice','secondary'))+panel('常用服务','<div class="sidebar-links">'+[['病历档案','records'],['阻鼾器管理','devices'],['就诊人管理','family'],['联系在线客服','service']].map(([t,k])=>'<button data-go="'+k+'">'+t+'<span>→</span></button>').join('')+'</div>');
const bookingSummary=()=>panel('本次预约',info([['就诊人',state.loggedIn?state.member:'登录后选择'],['预约门店',state.store],['预约医生',state.doctor],['预约日期',state.date],['预约时段',state.time]])+'<div class="notice">请提前 15 分钟到店，携带有效身份证件及既往检查资料。</div>');
const products=[['定制式口腔矫治器','医疗器械','clinic/appliance.jpg','3,980'],['阻鼾器清洁套装','配件耗材','product/clean-kit.png','89'],['睡眠评估服务','服务套餐','clinic/room.jpg','199']];
const productCards=(promotion=false)=>'<div class="grid three">'+products.map(([name,sub,img,price],i)=>({name,sub,img,price,i})).filter(p=>state.filter==='全部'||p.sub.startsWith(state.filter)).map(({name,sub,img,price,i})=>'<article class="product-card"><img class="product-img" src="static/'+img+'" alt="'+name+'"><h3>'+name+'</h3><p>'+sub+'</p><div class="row"><span class="price"><small>¥ </small>'+price+'</span><button class="btn small secondary" '+(promotion?'data-go="invite"':'data-product="'+i+'"')+'>'+(promotion?'去推广':'商品详情')+'</button></div></article>').join('')+'</div>';

const bookingRows=()=>table(['预约信息','就诊人','门店 / 医生','状态','操作'],[['<strong>2026.10.28 · 09:00</strong><small>睡眠健康初诊</small>',state.member,state.store+'<small>'+state.doctor+'</small>',tag('待就诊','blue'),link('查看详情','appointment-detail')],['2026.10.12 · 14:00<small>设备复查</small>',state.member,state.store+'<small>王医生</small>',tag('已完成','gray'),link('查看病历','records')]]);
function home(){
const breath='M0 17 H46 q12 0 15 -9 q5 -11 10 0 q6 11 11 0 q4 -6 8 3 H128 q12 0 15 -11 q5 -12 10 0 q6 12 11 0 q4 -7 8 4 H238 q12 0 15 -8 q5 -10 10 0 q6 10 11 0 q4 -6 8 3 H340';
const guides=[
['wave','睡眠评估','十分钟问卷，看看白天的困倦到了什么程度。','assessment','了解评估'],
['moon','治疗追踪','已经在治疗？把每天的佩戴和感受记下来。','treatment','打开记录'],
['file','我的档案','报告、病历和家人的资料，都在一个地方。','records','查看档案']
];
const labels=['02 · 评估','03 · 追踪','04 · 档案'];
const doctors=[
['王医生','主治医师 · 鼾症评估与口腔矫治','出诊 周一 · 周三 · 周五','打鼾、憋气、晨起口干，可以先从一次完整的评估开始。'],
['陈医生','主治医师 · 睡眠监测与报告解读','出诊 周二 · 周四 · 周六','把监测报告一页页讲清楚，你会知道自己的睡眠在什么位置。'],
['李医生','主治医师 · 治疗随访与设备调整','出诊 周一 · 周四 · 周日','戴着不舒服、松紧不合适，都可以回来调整，不用自己硬撑。']
];
return '<section class="hero-editorial">'+
'<div class="hero-type">'+
'<span class="hero-kicker reveal"><i></i>兴康明诊所 · 睡眠呼吸障碍诊疗中心</span>'+
'<h1 class="hero-display reveal" style="--i:1">专注睡眠呼吸健康<span class="slogan-sep"> · </span><br>让每一个夜晚安宁无声</h1>'+
'<svg class="breath-line reveal" style="--i:2" viewBox="0 0 340 34" preserveAspectRatio="none" aria-hidden="true"><path d="'+breath+'"/></svg>'+
'<p class="hero-lead reveal" style="--i:2">打鼾、憋气、白天总犯困，可能是睡眠呼吸发出的提醒。先了解自己的睡眠，再由医生陪你把治疗一步步走完。</p>'+
'<div class="hero-actions reveal" style="--i:3">'+btn('预约到店','stores','teal')+btn('先做睡眠评估','assessment','secondary')+'</div>'+
'<ul class="hero-meta reveal" style="--i:4"><li><strong>09:00–18:00</strong><span>门诊时间</span></li><li><strong>睡眠呼吸</strong><span>专科门诊</span></li><li><strong>口腔矫治</strong><span>非手术方案</span></li></ul>'+
'</div>'+
'<figure class="hero-frame reveal" style="--i:2"><img src="static/clinic/corridor.jpg" alt="兴康明诊所候诊区与科普墙"><figcaption><span>兴康明诊所 · 深圳</span><small>睡眠呼吸障碍诊疗中心</small></figcaption></figure>'+
'</section>'+
'<section class="consumer-section">'+
'<div class="section-heading reveal"><div><span class="eyebrow">从这里开始</span><h2>先了解，再决定</h2></div><p>不必一次做完。<br>选你眼下最关心的一件事。</p></div>'+
'<div class="bento-services">'+
'<button class="bento-card bento-feature reveal" style="--i:1" data-go="stores"><span class="bento-shell"><span class="bento-core"><span class="bento-top"><span class="bento-index">01 · 到店</span><span class="bento-glyph">'+icon('calendar')+'</span></span><span class="bento-title">第一次来，<br>先和医生聊聊</span><span class="bento-desc">要不要检查、适合哪种治疗，都可以在这一次慢慢说清楚。</span><span class="bento-photo"><img src="static/clinic/entry.jpg" alt="兴康明诊所所在园区入口"></span><span class="bento-foot"><span class="bento-go">查看门店与门诊时间 <i>→</i></span></span></span></span></button>'+
guides.map(([ic,title,desc,to,go],i)=>'<button class="bento-card reveal" style="--i:'+(i+1)+'" data-go="'+to+'"><span class="bento-shell"><span class="bento-core"><span class="bento-top"><span class="bento-index">'+labels[i]+'</span><span class="bento-glyph">'+icon(ic)+'</span></span><span class="bento-title">'+title+'</span><span class="bento-desc">'+desc+'</span><span class="bento-go">'+go+' <i>→</i></span></span></span></button>').join('')+
'</div></section>'+
'<section class="consumer-section">'+
'<div class="section-heading reveal"><div><span class="eyebrow">医生 · 团队</span><h2>把睡眠问题，交给懂它的人</h2></div>'+link('全部医生 →','doctors')+'</div>'+
'<div class="doctor-list">'+doctors.map(([n,type,slot,desc],i)=>'<article class="doctor-row reveal" style="--i:'+i+'"><span class="dr-num">0'+(i+1)+'</span><span class="dr-name">'+n+'<small>'+type.split(' · ')[0]+'</small></span><span class="dr-spec">'+type.split(' · ')[1]+'<small>'+slot+'</small></span><p class="dr-desc">'+desc+'</p><button class="text-button" data-doctor-profile="'+n+'">医生详情 <span class="go-arrow">→</span></button></article>').join('')+'</div></section>'+
'<section class="consumer-section"><div class="care-story"><div class="care-story-photo reveal"><img src="static/clinic/appliance.jpg" alt="定制式口腔矫治器"><span class="care-caption">定制式口腔矫治器 · 医生取模后制作</span></div><div class="reveal" style="--i:1"><span class="eyebrow">治疗 · 路径</span><h2>不是一副止鼾器，<br>是一段有人跟进的改善</h2><p>先评估，再由医生定方案。戴上之后，佩戴时长和不适感都会回到医生那里，复诊时一起看变化。</p><ul class="care-steps"><li><strong>评估</strong><span>量表与鼾声分析</span></li><li><strong>方案</strong><span>医生制定与试戴</span></li><li><strong>随访</strong><span>记录变化与调整</span></li></ul><div class="space">'+btn('了解治疗流程','treatment','secondary')+'</div></div></div></section>'+
'<section class="consumer-section">'+
'<div class="section-heading reveal"><div><span class="eyebrow">到店 · 环境</span><h2>来之前，先看看这里</h2></div><p>深圳 · 睡眠呼吸障碍诊疗中心<br>门诊时间 09:00–18:00</p></div>'+
'<div class="env-strip">'+[['brand','品牌墙','前台与诊所标识'],['education','科普墙','候诊区与睡眠科普'],['room','诊室','检查与治疗室']].map(([img,t,d],i)=>'<figure class="env-card reveal" style="--i:'+i+'"><img src="static/clinic/'+img+'.jpg" alt="兴康明诊所'+t+'"><figcaption><strong>'+t+'</strong><span>'+d+'</span></figcaption></figure>').join('')+'</div>'+
'<div class="env-foot reveal"><p>第一次到店，建议提前 15 分钟，带上既往病历和正在使用的阻鼾器。</p>'+link('查看门店与路线 →','stores')+'</div></section>'+
'<section class="cta-wrap"><div class="consumer-cta reveal"><div><span class="eyebrow light">预约 · 到店</span><h2>今晚的呼吸，<br>值得一次认真的检查。</h2><p>到店前可以在线上完成睡眠评估，把结果带进诊室。</p></div><div class="cta-side">'+btn('预约到店','stores','')+'<small>门诊时间 09:00–18:00 · 建议提前 15 分钟</small></div></div></section>';
}

function booking(id){
if(id==='appointments')return heading('预约记录','在线预约',btn('立即预约','stores'))+panel('',tabs(['进行中','历史记录'],state.filter==='全部'?'进行中':state.filter)+table(['就诊时间','就诊人','门店 / 医生','状态',''],[(state.filter==='历史记录'?['2026.10.12 · 14:00',state.member,state.store+' / '+state.doctor,tag('已完成'),link('查看预约详情','appointment-detail')]:[state.date+' '+state.time,state.member,state.store+' / '+state.doctor,tag('预约成功','blue'),link('查看预约详情','appointment-detail')])]));

if(id==='stores')return heading('选择门店','选好门店，再约医生和时间。')+steps(1)+split(panel('可预约门店','<article class="list-row"><div class="row start"><img src="static/clinic/entry.jpg" alt="兴康明诊所入口" style="width:152px;height:102px;object-fit:cover;border-radius:10px"><div><h3>兴康明诊所 · 深圳</h3><small>下李朗路 73 号 7 栋</small><p style="font-size:11px;margin:8px 0 0">门诊时间 09:00–18:00 · 周日休</p></div></div><button class="btn small secondary" data-store="兴康明诊所 · 深圳">选择门店</button></article><div class="grid three" style="margin-top:20px">'+['brand','education','room'].map(n=>'<img src="static/clinic/'+n+'.jpg" alt="诊所环境" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px">').join('')+'</div><div class="notice">其他门店开放后，会出现在这里。</div>'),panel('到店与预约须知','<p style="font-size:12px">带上既往病历和正在使用的阻鼾器，提前 15 分钟到店签到即可。</p>'+info([['地址','下李朗路 73 号 7 栋'],['预约方式','选门店 → 选医生 → 选时间'],['就诊人','本人或家人都可以']])+link('管理就诊人 →','family')));
if(id==='doctors')return heading('选择医生',state.store,link('更换门店','stores'))+steps(2)+panel('可预约医生','<div class="grid two">'+[['王医生','鼾症评估、口腔矫治器治疗'],['陈医生','睡眠监测、报告解读'],['李医生','治疗随访、设备调整'],['张医生','儿童与青少年睡眠呼吸']].map(([n,spec])=>'<div class="panel" style="margin:0">'+doctor(n,spec,false)+'<hr class="rule"><div class="row">'+link('医生详情','doctor')+'<button class="btn small" data-doctor="'+n+'">选择医生</button></div></div>').join('')+'</div>');
if(id==='doctor')return heading('医生详情','专业评估，为每一次就诊做好准备。')+split(panel('',doctor(state.doctor)+'<hr class="rule"><h3>医生简介</h3><p>专注睡眠呼吸健康与口腔矫治器治疗，为患者提供评估、方案制定及治疗后随访服务。</p><h3>擅长领域</h3><div class="options">'+['睡眠呼吸评估','口腔矫治器','治疗复查'].map(t=>tag(t,'blue')).join('')+'</div><div class="notice">医生资料与排班以门店当日信息为准。</div>'),panel('预约信息',info([['坐诊门店',state.store],['最近可约','10 月 28 日']])+btn('预约这位医生','times')));
if(id==='times'||id==='reschedule')return heading(id==='reschedule'?'改约':'选择时段','选择可预约的日期与时段。')+(id==='times'?steps(3):'')+split(panel('预约日期','<div class="options">'+['10月28日 周三','10月29日 周四','10月30日 周五','10月31日 周六'].map(d=>'<button class="option '+(d===state.date?'chosen':'')+'" data-date="'+d+'">'+d+'</button>').join('')+'</div><h3>上午</h3><div class="options">'+['09:00–09:30','09:30–10:00','10:00–10:30','11:00–11:30'].map(t=>'<button class="option '+(t===state.time?'chosen':'')+'" data-time="'+t+'">'+t+'</button>').join('')+'</div><h3>下午</h3><div class="options">'+['14:00–14:30','15:00–15:30'].map(t=>'<button class="option '+(t===state.time?'chosen':'')+'" data-time="'+t+'">'+t+'</button>').join('')+'<button class="option" disabled>16:00 · 已约满</button></div><div class="form-actions">'+btn('下一步，确认预约','confirm')+'</div>'),bookingSummary());
if(id==='confirm')return heading('预约确认','请核对就诊人与预约信息。')+steps(4)+split(panel('就诊人','<div class="options">'+['林晓','林爸爸'].map(n=>'<button class="option '+(n===state.member?'chosen':'')+'" data-member="'+n+'">'+n+(n==='林晓'?' · 本人':' · 家人')+'</button>').join('')+'</div>'+link('新增','add-member')+info([['定金','无需定金'],['挂号费','¥0.00'],['关联评估','ESS 嗜睡量表']])+field('联系手机','tel','138****8000','readonly')+'<label class="field"><span>就诊备注（选填）</span><textarea placeholder="描述本次希望咨询的问题"></textarea></label><div class="notice">就诊须知：请携带既往病历与阻鼾器；提前 15 分钟到店签到；首次就诊需完成睡眠评估。费用与取消时限以门店确认为准。</div><div class="form-actions">'+btn('返回选择时间','times','secondary')+btn('确认预约','success')+'</div>'),bookingSummary());
if(id==='success')return panel('','<div class="center" style="padding:38px"><div class="success-mark">✓</div><h1>预约成功</h1><p>请按约定时间到店，我们会提前为你留好诊室。</p><div style="max-width:450px;margin:25px auto">'+info([['预约门店',state.store],['预约医生',state.doctor],['时间',state.date+' '+state.time],['就诊人',state.member]])+'</div>'+btn('查看预约详情','appointment-detail')+' '+btn('返回首页','home','secondary')+'</div>');
if(id==='map')return heading('门店地图',state.store)+split('<div class="map"><div class="map-marker">兴康明诊所 · 深圳<br><small>下李朗路 73 号 7 栋</small></div></div>',panel('到店信息',info([['营业时间','09:00–18:00 · 周日休'],['地址','下李朗路 73 号 7 栋'],['交通','地铁与停车信息以门店确认为准']])+btn('返回预约','appointment-detail','secondary')));
return heading('预约详情','预约编号 AP20261028001',tag('待就诊','blue'))+split(panel('就诊安排',doctor(state.doctor)+'<hr class="rule">'+info([['就诊人',state.member],['预约时间',state.date+' '+state.time],['就诊门店',state.store],['就诊项目','睡眠健康初诊']])+'<div class="form-actions">'+action('取消预约','cancel')+btn('改约','reschedule')+'</div>'),bookingSummary()+panel('门店位置','<p style="font-size:12px">下李朗路 73 号 7 栋</p>'+btn('查看门店位置','map','secondary')));
}
function assessment(id){
if(id==='assessment')return heading('睡眠评估','了解你的睡眠质量',member())+'<p>通过专业的 ESS 嗜睡量表和 AI 鼾声分析，全面了解你的睡眠呼吸状况。</p><div class="grid two">'+panel('ESS嗜睡量表','<p>8道情境题 · 约3分钟 · 国际通用标准</p>'+btn('开始评估','questionnaire'))+panel('AI鼾声分析','<p>录制鼾声 · AI分析 · 风险评级</p>'+btn('AI鼾声分析','recording','secondary'))+'</div>'+(state.loggedIn?panel('我的评估记录',table(['评估时间','评估类型','当前评估人',''],[['2026.10.24','ESS嗜睡量表',state.member,link('评估结果','assessment-result')],['2026.10.23','AI鼾声分析',state.member,link('鼾声分析报告','snore-result')]])):'')+'<div class="notice">评估结果仅供参考，不代替医生诊断。</div>';

if(id==='questionnaire'){const questions=['坐着阅读时','看电视时','在公共场所坐着不动时','乘车连续一小时未休息时','下午躺下休息时','坐着与人交谈时','午餐后安静坐着时（未饮酒）','驾驶中因交通原因停车数分钟时'];return heading('ESS嗜睡量表','请根据最近的实际感受，选择最符合的选项。',member())+split(panel('日常场景',questions.map((q,i)=>'<div class="question"><h3>'+String(i+1).padStart(2,'0')+'　'+q+'</h3><div class="options">'+['从不打瞌睡','轻度可能','中度可能','高度可能'].map((a,j)=>'<button class="option '+(state.answers[i]===j?'chosen':'')+'" data-answer="'+i+':'+j+'">'+j+' · '+a+'</button>').join('')+'</div></div>').join('')+'<div class="form-actions">'+action('提交评估','submit-assessment','')+'</div>'),panel('填写进度','<h1>'+Object.keys(state.answers).length+' <small style="font-size:15px">/ 8</small></h1><div class="progress"><span style="--p:'+(Object.keys(state.answers).length/8).toFixed(3)+'"></span></div><p style="font-size:12px">没有正确或错误的答案，请按真实情况作答。所有选项均完成后可查看评估结果。</p>'));}
if(id==='recording')return heading('AI鼾声分析','安静放置设备，记录夜间声音变化。',member())+split(panel('睡眠呼吸监测','<div class="record-center"><span class="tag blue" id="record-status">'+(state.recording?'正在记录':'准备就绪')+'</span><div class="time" id="record-time">00:00</div><small>放下手机，安静入睡就好</small><div class="wave '+(state.recording?'running':'')+'">'+Array.from({length:51},(_,i)=>'<i style="--h:'+(12+(Math.sin(i*1.7)+1)*25)+'px;--d:'+(i%7*.1)+'s"></i>').join('')+'</div><div class="mini-note">当前分贝</div><div class="db"><span id="db">—</span><small>dB</small></div><div class="mini-note space">最高峰值 <span id="peak-db">—</span> dB</div><p class="mini-note">开始记录后会读取麦克风，声音仅用于本次分析。</p><div class="row" style="justify-content:center;margin-top:28px">'+action(state.recording?'暂停记录':'开始记录','record','')+btn('生成分析报告','snore-result','secondary')+'</div></div>'),panel('录音前准备','<div class="timeline"><article><h3>选择安静环境</h3><p>避免电视、音乐等背景声干扰。</p></article><article><h3>妥善放置设备</h3><p>确保麦克风无遮挡，并保持位置稳定。</p></article><article><h3>保持页面在前台</h3><p>录音过程中请勿关闭或切换页面。</p></article></div><div class="notice warm">本页面不检测或诊断呼吸暂停。</div>'));
const isSnore=id==='snore-result',score=Object.keys(state.answers).length===8?Object.values(state.answers).reduce((a,b)=>a+b,0):8;
return heading(isSnore?'鼾声分析报告':'评估结果','报告日期 2026.10.24 · '+state.member,btn('返回评估中心','assessment','secondary'))+split(panel(isSnore?'声音概览':'评估概览',isSnore?metrics([['平均声级','34','dB','本次录音'],['峰值声级','62','dB','本次录音'],['鼾声占比','18','%','仅供参考']])+'<div class="space">'+chart(true)+'</div>':'<div class="score-circle"><strong>'+score+'</strong><small>ESS 总分 / 24</small></div><div class="center"><h3>已完成日间嗜睡评估</h3><p>评分用于辅助了解近期状态，请结合症状咨询医生。</p></div>')+panel('下一步建议','<div class="grid two"><div><h3>持续观察与记录</h3><p style="font-size:12px">保持规律作息，记录白天精神状态和夜间睡眠变化。</p></div><div><h3>必要时接受专业评估</h3><p style="font-size:12px">如存在明显嗜睡、憋醒等情况，请及时就诊。</p></div></div>'),panel('报告信息',info([['就诊人',state.member],['评估方式',isSnore?'录音分析':'ESS 问卷'],['数据来源',isSnore?'鼾声录音':'问卷作答']])+'<div class="notice warm">以上结果不作为诊断结论，具体以医生面诊为准。</div>'+btn('预约专业评估','stores')));
}
const treatmentTimeline=()=>'<div class="timeline">'+[['10.24','完成设备复查','医生评估近期佩戴感受，维持当前调整方案。'],['10.18','记录阶段性佩戴反馈','已逐步适应，每晚佩戴时长增加。'],['10.12','领取并首次佩戴设备','完成佩戴指导及初始参数记录。'],['10.08','完成初诊与治疗方案','制定口腔矫治器治疗方案。']].map(([d,t,p])=>'<article><small>2026.'+d+'</small><h3>'+t+'</h3><p>'+p+'</p></article>').join('')+'</div>';
function treatment(id){
const head=heading(PAGES.find(p=>p.id===id).title,'把治疗过程记录下来，让改善看得见。',member());
if(id==='treatment')return head+metrics([['治疗进度','18','天','治疗开始于 10 月 08 日'],['平均时长','6.8','小时','近 7 天记录'],['平均痛感','2','/ 10','主观感受记录'],['连续天数','12','天','坚持记录每一晚']])+'<div class="space">'+split(panel('今日佩戴记录','<div class="row"><div><h3>记录昨晚的佩戴情况</h3><small>佩戴时长、睡眠感受与不适程度</small></div>'+action('今日打卡','checkin','')+'</div>')+panel('佩戴与睡眠趋势',chart(),link('查看趋势 →','trend'))+panel('治疗资料','<div class="row wrap">'+btn('打卡日历','calendar','secondary')+btn('睡眠报告','sleep-report','secondary')+btn('设备调整','adjust','secondary')+btn('医患社区','community','secondary')+'</div>')+panel('治疗动态',treatmentTimeline(),link('完整时间线 →','timeline')),careAside())+'</div>';
if(id==='calendar')return head+split(panel('2026 年 10 月','<div class="calendar">'+['一','二','三','四','五','六','日'].map(d=>'<div class="day-head">'+d+'</div>').join('')+'<div></div><div></div><div></div>'+Array.from({length:31},(_,i)=>'<div class="'+(i>=13&&i<25?'done':i===25?'today':'')+'">'+(i+1)+(i>=13&&i<25?'<small>已记录</small>':i===25?'<small>今日</small>':'')+'</div>').join('')+'</div>'),panel('今日记录',info([['日期','2026.10.26'],['佩戴时长','待记录'],['状态','未打卡']])+action('填写佩戴记录','checkin',''))+panel('佩戴目标','<p style="font-size:12px">佩戴安排以医生制定的个体化方案为准。</p>'));
if(id==='sleep-report')return head+panel('核心指标',metrics([['平均时长','6.8','小时','近 7 天记录'],['依从率','85','%','按佩戴记录统计'],['平均痛感','2','/ 10','主观感受'],['连续天数','12','天','坚持记录']]))+panel('趋势分布',chart())+panel('报告建议','<p>这是当前就诊人的报告建议。以上结果不作为诊断结论，具体以医生面诊为准。</p>');
if(id==='timeline')return head+split(panel('治疗历程',treatmentTimeline()),careAside());
if(id==='advice')return head+split(panel('近期医嘱建议',doctor()+'<hr class="rule"><small>2026.10.24 · 复查建议</small><h3 class="space">保持当前方案，关注佩戴舒适度</h3><p>按照医生说明使用设备，记录佩戴时长和晨起感受。如持续不适，应联系医生评估，不要自行改变设备参数。</p><div class="notice">以上建议供日常参考，具体以医生面诊为准。</div>'),panel('后续安排',info([['下次随访','2026.11.07'],['当前设备','定制式口腔矫治器']])+btn('预约复诊','stores','secondary')));
if(id==='adjust')return head+split(panel('当前设备参数',info([['调整日期','2026.10.24'],['关联设备','定制式口腔矫治器'],['设备编号','HJ-DEMO-001'],['调整医生','王医生'],['初始下颌前移量','3.0 mm'],['本次调整后','3.5 mm']])+'<hr class="rule"><h3>调整历史</h3><p>2026.10.24 · 王医生 · 下颌前移量 3.5 mm</p><p>设备参数以医生调整记录为准，请不要自行调整。</p>'),panel('注意事项','<p style="font-size:12px">请由专业人员评估并调整设备。如出现不适，请及时联系医生。</p>'+btn('使用反馈','feedback','secondary')));
return head+metrics([['平均佩戴','6.8','小时','近 7 天'],['记录完整度','7','/ 7 天','佩戴数据'],['平均不适度','2','/ 10','主观记录']])+'<div class="space">'+split(panel(id==='sleep-report'?'阶段睡眠报告':'佩戴时长变化','<div class="options">'+['近7天','近30天'].map(r=>'<button class="option '+(state.range===r?'chosen':'')+'" data-range="'+r+'">'+r+'</button>').join('')+'</div>'+chart())+panel('每日记录',table(['日期','佩戴时长','不适程度','睡眠感受'],[['10.26','7.2 小时','1 / 10','良好'],['10.25','6.9 小时','2 / 10','良好'],['10.24','6.4 小时','2 / 10','一般']])),careAside())+'</div>';
}
function commerce(id){
if(id==='products'||id==='distribution-products')return heading(id==='products'?'健康商城':'推广商品','',btn(id==='products'?'我的订单':'分销规则',id==='products'?'orders':'rules','secondary'))+(id==='products'?tabs(['全部','医疗器械','配件耗材','服务套餐']):'')+productCards(id!=='products')+'<div class="notice">价格与库存以门店当日确认为准。</div>';

if(id==='product'){const [name,sub,img,price]=products[state.selectedProduct];return heading('商品详情','',link('健康商城','products'))+panel('','<div class="grid two"><img class="product-detail-img" src="static/'+img+'" alt="'+name+'"><div class="product-info"><h2>'+name+'</h2><p>'+sub+'</p><div class="price">¥ '+price+'</div><hr class="rule"><h3>商品详情</h3><p>规格与价格以门店当日信息为准，可选尺寸与佩戴方式由医生确认。</p>'+action('立即支付','checkout','')+'</div></div>');}
const orderStates=['待付款','待取货','待发货','已发货','已完成'];
if(id==='orders'){const states=state.filter==='全部'?orderStates:orderStates.filter(t=>t===state.filter);return heading('我的订单','')+panel('',tabs(['全部',...orderStates])+table(['订单信息','商品','金额','状态',''],states.map((t,i)=>['20261024000'+(i+1),products[0][0],'¥ 3,980.00',tag(t,'blue'),'<button class="text-button" data-order="'+t+'">订单详情</button>'])));}
const status=orderStates.includes(state.selectedOrder)?state.selectedOrder:'待付款';
const actions=status==='待付款'?action('取消订单','order-action')+' '+action('立即支付','order-action',''):status==='已发货'?action('确认收货','order-action','')+' '+action('申请退款','order-action'):status==='待取货'||status==='待发货'?action('申请退款','order-action'):'';
return heading('订单详情','订单编号 202610240001',tag(status,'blue'))+split(panel('商品信息',table(['商品','数量','金额'],[[products[0][0],'1','¥ 3,980.00']]))+panel('金额明细',info([['商品总价','¥ 3,980.00'],['优惠减免','¥ 0.00'],['实付款',status==='待付款'?'待支付':'¥ 3,980.00']]))+panel('订单信息',info([['下单时间','2026.10.24 14:30'],['支付方式','微信支付'],['配送方式',status==='待取货'?'门店自提':'快递配送'],...(status==='待取货'?[['自提门店',state.store],['营业时间','09:00–18:00']]:[['收货人','林*'],['联系电话','138****8000']]),...(status==='已发货'?[['快递公司','顺丰速运'],['运单号','DEMO0001']]:[])]))+'<div class="form-actions">'+actions+'</div>',panel('订单服务',btn('在线客服','service','secondary')));
}

function health(id){
if(id==='profile')return heading('我的','',member())+panel('','<div class="row"><div class="row start"><img class="avatar" style="width:64px;height:64px" src="static/demo/avatar.jpg" alt="头像"><div><h2 style="margin-bottom:8px">林晓</h2><small>138****8000　'+tag('普通会员','blue')+'</small></div></div>'+btn('编辑资料','personal','secondary')+'</div>')+metrics([['待就诊预约','1','次','查看并安排就诊'],['我的设备','1','台','已绑定设备'],['家庭成员','2','位','就诊人档案'],['治疗记录','18','天','持续关注改善']])+'<div class="space grid three">'+[['我的健康',[['病历档案','records'],['阻鼾器管理','devices'],['就诊人管理','family']]],['我的服务',[['会员权益','benefits'],['我的订单','orders'],['分销中心','distribution']]],['其他',[['消息通知','notifications'],['在线客服','service'],['设置','settings']]]].map(([t,ls])=>panel(t,'<div class="sidebar-links">'+ls.map(([l,k])=>'<button data-go="'+k+'">'+l+'<span>→</span></button>').join('')+'</div>')).join('')+'</div>';
if(id==='records')return heading('病历档案','按就诊人查看门诊记录与治疗资料。',member())+split(panel('2026.10.24 · 复查记录',info([['就诊人',state.member],['门店 / 医生','中心门店 / 王医生'],['主诉','佩戴设备后复查'],['检查记录','本次复查记录'],['诊断','以医生诊断为准'],['处方/方案','以医生方案为准'],['医嘱','关注佩戴感受，如有不适及时联系医生']])+'<div class="notice">病历内容以门诊实际记录为准。</div>'),panel('就诊记录','<div class="sidebar-links"><button data-action="record-detail">2026.10.24 · 复查<span>查看</span></button><button data-action="record-detail">2026.10.08 · 初诊<span>查看</span></button></div>'));
if(id==='devices')return heading('阻鼾器管理','查看设备信息、使用记录与保养建议。',member())+split(panel('我的设备','<div class="grid two"><img class="product-detail-img" style="height:230px" src="static/product/hj-mad-03.png" alt="口腔矫治器"><div>'+tag('使用中')+'<h2 class="space">定制式口腔矫治器</h2>'+info([['设备编号','HJ-DEMO-001'],['佩戴天数','14天'],['上次维护','2026.10.20'],['推荐复诊','2026.11.07'],['绑定就诊人',state.member],['交付日期','2026.10.12'],['当前前移量','3.5 mm']])+link('查看调整记录 →','adjust')+'</div></div>'),panel('设备服务','<div class="sidebar-links">'+[['佩戴数据','wearing'],['维护记录','maintenance'],['使用反馈','feedback']].map(([t,k])=>'<button data-go="'+k+'">'+t+'<span>→</span></button>').join('')+'</div>'));
if(id==='wearing')return heading('佩戴数据','当前就诊人：'+state.member,member())+panel('',table(['日期','佩戴时长','痛感评分','疼痛部位','备注'],[['2026.10.26','7.2小时','1 / 10','牙齿','按计划佩戴'],['2026.10.25','6.8小时','2 / 10','下颌','按计划佩戴']]));
if(id==='maintenance')return heading('维护记录','当前就诊人：'+state.member,member())+panel('','<article class="list-row"><div class="row">'+tag('清洁','blue')+'<small>2026.10.20</small></div><p class="space">设备检查与维护</p><small>费用：¥0.00</small></article>')+'<p class="mini-note">保养方式以医生或门店说明为准。</p>';
if(id==='feedback')return heading('使用反馈','当前就诊人：'+state.member,member())+panel('','<article class="list-row"><div class="row"><small>2026.10.24</small><strong>4 / 5</strong></div><p class="space">佩戴体验记录</p><div class="notice">回复：已收到你的反馈。</div></article>')+panel('提交反馈','<form data-form="feedback">'+select('评分',['5 / 5','4 / 5','3 / 5','2 / 5','1 / 5'])+'<label class="field"><textarea required placeholder="请输入佩戴体验、问题或建议"></textarea></label><div class="form-actions"><button class="btn">确认提交</button></div></form>');

if(id==='family')return heading('就诊人管理','为本人和家人管理就诊资料。',btn('新增就诊人','add-member'))+'<div class="grid two">'+['林晓','林爸爸'].map((n,i)=>panel('','<div class="row"><h2 style="margin:0">'+n+'</h2>'+tag(i?'家人':'本人','blue')+'</div><hr class="rule">'+info([['性别',i?'男':'女'],['出生日期',i?'1965-06-18':'1993-08-16'],['手机号','138****8000'],['身份证','仅展示脱敏信息']])+btn('查看健康档案','records','secondary'))).join('')+'</div><div class="notice">家庭成员资料仅用于就诊建档，你只能查看已授权的家人档案。</div>';
if(id==='add-member')return heading('新增就诊人','')+panel('','<form data-form="member">'+field('上传头像','file','','accept="image/*"')+'<div class="grid two">'+select('所属诊所 *',['兴康明 · 中心门店','兴康明 · 东城门店'])+select('与本人关系 *',['配偶','子女','父母','兄弟姐妹','其他'])+field('手机号 *','tel','','required pattern="[0-9]{11}" placeholder="请输入手机号"')+field('姓名 *','text','','required placeholder="请输入姓名全称"')+select('性别 *',['男','女'])+field('出生日期 *','date','','required')+field('身份证','text','','maxlength="18" placeholder="请输入身份证号"')+field('病历号','text','','placeholder="有既往病历可填写"')+field('地区')+field('详细地址','text','','maxlength="120" placeholder="请输入街道门牌信息"')+'</div><div class="notice">就诊人信息仅用于建档与预约，请如实填写。</div><div class="form-actions"><button class="btn">确认提交</button></div></form>');

return heading('会员权益','')+panel('','<div class="balance"><h1>普通会员</h1>'+info([['累计消费','¥ 0.00']])+'</div>')+panel('当前权益','<p>当前等级可享权益，以门店说明为准。</p>')+panel('等级体系','<p>等级与累计消费门槛以会员规则为准。</p>');
}

function account(id){
if(id==='settings')return heading('设置','管理个人信息、账号安全与平台服务。')+panel('账号与资料','<div class="sidebar-links">'+[['个人信息','personal'],['账号安全','security']].map(([t,k])=>'<button data-go="'+k+'">'+t+'<span>→</span></button>').join('')+'</div>')+action('退出登录','logout');
if(id==='personal')return heading('个人信息','查看并维护个人基本信息。')+panel('基本资料','<form data-form="personal"><div class="row start" style="margin-bottom:25px"><img class="avatar" style="width:60px;height:60px" src="static/demo/avatar.jpg" alt="头像"><span class="muted">个人头像</span></div><div class="grid two">'+field('昵称','text','林晓','required maxlength="30"')+field('身份证号','text','','maxlength="18" placeholder="请输入18位身份证号"')+field('病历号','text','','readonly')+select('性别',['女','男'])+field('生日','date','1993-08-16')+field('手机号码','tel','138****8000','readonly')+'</div><div class="form-actions"><button type="submit" class="btn">保存修改</button></div></form>');
if(id==='security')return heading('账号安全','保护账户与个人健康信息。')+panel('已绑定信息',info([['微信账号','已绑定'],['手机号','138****8000'],['登录密码','未设置'],['实名认证','未认证']])+'<div class="notice">账号信息仅你本人可见，请勿向他人透露验证码。</div>'+'<div class="row wrap">'+action('更换绑定手机','phone')+action('设置 / 修改密码','password')+action('实名认证','realname')+'</div>');
if(id==='notifications')return heading('消息通知','',action('全部已读','read-all','secondary'))+panel('',[['预约通知','预约即将开始','你预约的门诊时间为 10 月 28 日 09:00。','appointment-detail'],['服务提醒','记得填写佩戴记录','记录近期感受，帮助医生了解治疗情况。','treatment']].filter(x=>state.filter==='全部'||x[0]===state.filter).map(([c,t,p,k])=>'<article class="list-row"><div class="row"><div><h3>'+t+'</h3><p style="font-size:12px;margin-bottom:6px">'+p+'</p><small>2026.10.26 · '+c+'</small></div>'+link('查看详情',k)+'</div></article>').join(''));
return heading('在线客服','关于预约、订单与设备使用，我们愿意帮你。')+split(panel('服务咨询','<div id="chat"><div class="chat-bubble">你好，欢迎来到兴康明。请描述你的问题，方便服务人员进一步协助。</div></div><div class="notice">请勿在咨询中发送身份证号、银行卡号等敏感信息。</div><form data-form="chat"><label class="field"><span>咨询内容</span><textarea name="message" required maxlength="500" placeholder="请输入你的问题"></textarea></label><div class="form-actions"><button class="btn">发送</button></div></form>'),panel('常用服务','<div class="sidebar-links">'+[['查看预约','appointments'],['查看订单','orders'],['使用反馈','feedback']].map(([t,k])=>'<button data-go="'+k+'">'+t+'<span>→</span></button>').join('')+'</div>'));
}

const COMMUNITY_CATEGORIES=['睡眠科普','治疗知识','设备介绍','患者故事','阻鼾器配戴','科普问答'];
const COMMUNITY_TAGS=['适应期','治疗分享','AHI改善','设备保养','情感支持','经验交流'];
const DEMO_POSTS=[
{id:'p1',author:'王医生',role:'专家医生',expert:true,top:true,title:'关于阻鼾器配戴的常见问题',body:'如有佩戴过程中的疑问，可在复诊时与医生沟通。具体问题建议在复诊时向医生咨询，不构成医疗建议。',category:'科普问答',labels:['设备保养'],likes:32,comments:8,date:'2026.10.24 09:00'},
{id:'p2',author:'林晓',role:'鼾友',expert:false,top:false,title:'分享我的佩戴记录',body:'记录每天的佩戴时长和感受，复查时能更清楚地回顾变化。希望能给同样在治疗的朋友一点参考。',category:'患者故事',labels:['治疗分享','经验交流'],likes:24,comments:3,date:'2026.10.26 10:30'},
{id:'p3',author:'睡眠专家',role:'睡眠专家',expert:true,top:false,title:'睡眠评估与门诊沟通',body:'评估记录可以为问诊沟通提供参考，具体情况仍需由医生判断。',category:'睡眠科普',labels:['经验交流'],likes:12,comments:2,date:'2026.10.25 14:00'}
];
function communityPost(post,detail=false){return '<article class="post">'+(post.top?tag('置顶','blue'):'')+'<div class="post-author space"><img class="avatar" src="static/pc-brand.svg" alt=""><div>'+post.author+'　'+tag(post.role,post.expert?'blue':'gray')+'<small>'+post.date+'</small></div></div><button class="post-title-link" data-post="'+post.id+'"><h2>'+post.title+'</h2></button><p>'+post.body+'</p><div class="options">'+tag(post.category,'blue')+post.labels.map(t=>tag(t,'gray')).join('')+'</div><div class="post-stats"><button data-post-like="'+post.id+'">'+(state.postLikes[post.id]?'已点赞':'点赞')+' · '+(post.likes+(state.postLikes[post.id]?1:0))+'</button><button data-post="'+post.id+'">评论 · '+post.comments+'</button>'+(detail?'<button data-favorite="'+post.id+'">'+(state.favorites[post.id]?'已收藏':'收藏')+'</button>':'')+'<button data-action="post-share">分享</button>'+(detail?'<button data-action="report-post">举报</button>':'')+'</div></article>';}
function community(id){
if(id==='live'){const rooms=[['认识睡眠呼吸问题','直播中','进入直播间'],['阻鼾器使用交流','预告','查看预告'],['睡眠健康问答','回放','观看回放']];return heading('直播中心','')+tabs(['全部','直播中','预告','回放'])+'<div class="grid three">'+rooms.filter(r=>state.filter==='全部'||r[1]===state.filter).map(([t,status,a],i)=>panel('','<img class="live-cover" src="static/demo/live-'+(i+1)+'.jpg" alt="直播封面">'+tag(status,'blue')+'<h3 class="space">'+t+'</h3><p>主播：王医生</p><small>直播由微信小程序提供</small><div class="space">'+btn(a,'playback','secondary')+'</div>')).join('')+'</div>';}
if(id==='playback')return heading('直播详情','')+split(panel('认识睡眠呼吸问题','<img class="post-media" src="static/demo/live-1.jpg" alt="直播封面">'+tag('回放','blue')+info([['微信直播间ID','以直播间显示为准'],['主播','王医生'],['观看人数','以直播间显示为准']])+action('观看回放','wechat-live','')+'<div class="notice">可在微信小程序观看回放。</div>'),panel('直播好物','<img class="product-img" src="static/product/clean-kit.png" alt="商品">'+btn('商品详情','product','secondary')));
if(id==='publish')return heading('发帖','')+panel('','<form data-form="publish">'+select('分类',COMMUNITY_CATEGORIES)+field('标题','text','','name="title" required maxlength="40" placeholder="简洁描述你的问题或分享"')+'<label class="field"><span>内容</span><textarea name="content" required maxlength="1000" style="min-height:180px" placeholder="详细描述你的情况、问题或分享经验..."></textarea></label><label class="field"><span>标签（最多3个）</span></label><div class="options">'+COMMUNITY_TAGS.map(t=>'<label class="check-row"><input type="checkbox" name="tags" value="'+t+'">'+t+'</label>').join('')+'</div><div class="form-actions"><button class="btn">发布帖子</button></div></form>');
if(id==='post'){const post=DEMO_POSTS.find(p=>p.id===state.postId)||DEMO_POSTS[0];return heading('帖子详情','',btn('社区','community-tab','secondary'))+split(communityPost(post,true)+panel('全部评论','<div id="community-comments"><article class="list-row"><strong>鼾友</strong><small>　2026.10.26</small><p>感谢分享，我也在记录自己的使用感受。</p><div class="post-stats"><button data-action="comment-like">点赞 · 1</button><button data-action="reply">回复</button></div></article></div><form data-form="comment"><label class="field"><textarea name="comment" required maxlength="500" placeholder="理性发言，友善互动"></textarea></label><button class="btn">发送</button></form>'),panel('医患社区','<p>分享你的治疗经验...</p>'+btn('发帖','publish','secondary')));}
const selected=['热门','最新','专家'].includes(state.filter)?state.filter:'热门';
let posts=DEMO_POSTS.filter(p=>selected!=='专家'||p.expert).slice();
posts.sort((a,b)=>Number(b.top)-Number(a.top)||(selected==='热门'?b.likes-a.likes:b.date.localeCompare(a.date)));
return heading(id==='community-tab'?'患者社区':'医患社区','')+split('<div class="panel publish-entry"><button data-go="publish" class="publish-prompt">分享你的治疗经验...</button>'+btn('发帖','publish')+'</div>'+tabs(['热门','最新','专家'],selected)+posts.map(p=>communityPost(p)).join(''),panel('社区','<p>分享你的治疗经验...</p>'+btn('发帖','publish','secondary')+'<hr class="rule"><p class="mini-note">帖子内容仅供参考，不构成医疗建议。</p>'));
}

function distribution(id){
const head=heading(PAGES.find(p=>p.id===id).title,'患者账户推广服务 · 已开通',link('分销规则','rules'));
if(id==='distribution')return head+'<div class="balance"><div class="row"><div><label>可提现佣金 · 元</label><strong>328.00</strong><p>实际结算以订单状态及分销配置为准</p></div>'+btn('申请提现','withdraw')+'</div></div>'+metrics([['累计佣金','1,280','元','历史累计'],['待结算','156','元','尚未完成结算'],['团队成员','8','人','当前关联成员']])+'<div class="space grid three">'+[['佣金与订单',[['佣金明细','commission'],['推广订单','distribution-orders'],['提现记录','withdraw-records']]],['邀请与团队',[['邀请好友','invite'],['团队成员','team']]],['推广工具',[['推广商品','distribution-products'],['分销规则','rules']]]].map(([t,a])=>panel(t,'<div class="sidebar-links">'+a.map(([l,k])=>'<button data-go="'+k+'">'+l+'<span>→</span></button>').join('')+'</div>')).join('')+'</div><div class="notice">推广收益与结算以实际订单和规则为准。</div>';
if(id==='invite')return head+split(panel('我的邀请卡','<div class="center"><div class="section-label">好眠邀请函</div><h1>把一夜好眠的心愿，<br>送给你在乎的人。</h1><p>一份关心 · 一起好眠</p><div class="qr-placeholder">小程序邀请二维码</div><small>专属邀请码 DEMO2026</small><div class="space">'+action('把关怀送给好友','share','')+'</div></div>'),panel('邀请说明','<p style="font-size:12px">邀请关系与佣金结算按分销规则计算。</p><div class="notice">佣金与邀请关系以实际绑定结果为准。</div>'));
if(id==='withdraw')return head+split(panel('提现申请','<form data-form="withdraw"><p>可提现余额 <strong>¥ 328.00</strong></p>'+field('提现金额 *','number','','required min="0.01" max="328" step="0.01" placeholder="请输入提现金额"')+'<label class="field"><span>到账方式</span><select><option>银行卡</option><option disabled>微信零钱（未开通）</option></select></label>'+field('开户银行','text','','required placeholder="请输入开户银行"')+field('开户姓名','text','','required placeholder="请输入开户姓名"')+field('银行卡号','text','','required placeholder="请输入银行卡号"')+info([['手续费','按提现规则计算'],['实际到账','以银行到账为准']])+'<div class="notice">请确认银行卡信息无误，到账时间以银行处理为准。</div><div class="form-actions"><button class="btn">确认提现</button></div></form>'),panel('提现记录','<p style="font-size:12px">查看申请进度与历史提现。</p>'+btn('查看记录','withdraw-records','secondary')));
if(id==='team')return head+panel('团队成员',tabs(['全部','一级成员','二级成员'])+table(['成员','关联层级','加入日期'],[['张**',state.filter==='二级成员'?'二级成员':'一级成员','2026.10.20'],['李**',state.filter==='一级成员'?'一级成员':'二级成员','2026.10.22']]));
if(id==='rules')return head+panel('规则说明','<div class="legal"><h3>开通条件</h3><p>患者通过小程序邀请即可成为推广员。</p><h3>佣金规则</h3><p>佣金按上下级关系与商品分销规则计算。</p><h3>推广方式</h3><p>邀请好友和推广商品，按实际关系与规则结算。</p><h3>提现规则</h3><p>可提现金额及订单退款等变化以实际服务端结算状态为准。</p><div class="notice">具体规则如有调整，以门店最新公示为准。</div></div>');
if(id==='withdraw-records')return head+panel('提现申请',table(['申请时间','金额','状态','备注'],[['2026.10.22','¥ 200.00',tag('处理中','blue'),'等待处理'],['2026.10.12','¥ 100.00',tag('已完成'),'已到账']]));
return head+(id==='commission'?metrics([['累计佣金','1,280','元','历史累计'],['待结算','156','元','等待结算'],['已结算','1,124','元','已到账'],['二级佣金','80','元','团队贡献']])+'<div class="space"></div>':'')+panel(id==='commission'?'佣金明细':'推广订单',tabs(['全部','待结算','已结算'])+table(['订单编号','商品','订单金额','佣金','状态'],[['202610200018','定制式口腔矫治器','¥ 3,980.00','¥ 156.00',tag(state.filter==='已结算'?'已结算':'待结算','blue')],['202610180026','清洁套装','¥ 89.00','¥ 8.00',tag(state.filter==='待结算'?'待结算':'已结算')]]))+'<div class="notice">金额以实际结算为准，不构成收益承诺。</div>';
}
function auth(id){
if(id==='login')return '<div class="login-layout"><div class="login-story"><div class="section-label">兴康明诊所</div><h1>专注睡眠<br>呼吸健康</h1><p>专注睡眠呼吸健康 · 让每一个夜晚安宁无声</p></div><div class="login-form"><h2>手机号快捷登录</h2><p>小程序通过微信手机号授权登录</p><div class="notice">安全提示：手机号用于识别你的账号身份，仅你可查看本人的预约与健康资料。</div><label><input id="agreement-check" type="checkbox"> 我已阅读并同意 '+link('用户协议','agreement')+' 与 '+link('隐私政策','privacy')+'</label><div class="space">'+action('登录','login','')+'</div><p class="mini-note space">登录后可查看预约、报告与家人的就诊资料。</p></div></div>';
return heading(id==='privacy'?'隐私政策':'用户协议','')+panel('','<div class="legal"><div class="notice">请在使用服务前阅读以下条款。</div>'+MINI_REFERENCE.legal[id].map((t,i)=>i<2?'<p>'+esc(t)+'</p>':/^[一二三四五六七八九十]+、/.test(t)?'<h3>'+esc(t)+'</h3>':'<p>'+esc(t)+'</p>').join('')+'</div>');
}

function rawContent(p){if(p.id==='home')return home();if(p.group==='预约就诊')return booking(p.id);if(p.group==='睡眠评估')return assessment(p.id);if(p.group==='治疗追踪')return treatment(p.id);if(p.group==='健康商城'||p.id==='distribution-products')return commerce(p.id);if(p.group==='我的健康')return health(p.id);if(p.group==='账户与服务')return account(p.id);if(p.group==='社区'||p.group==='直播')return community(p.id);if(p.group==='分销中心')return distribution(p.id);return auth(p.id);}

const PRIVATE_PAGES=new Set(['questionnaire','assessment-result','snore-result','appointments','confirm','success','appointment-detail','reschedule','treatment','calendar','trend','timeline','advice','adjust','sleep-report','profile','records','devices','wearing','maintenance','feedback','family','add-member','benefits','settings','personal','security','notifications','service','orders','order','distribution','commission','distribution-orders','withdraw','withdraw-records','team','invite','distribution-products','rules','publish']);
function loginGate(p){return '<section class="guest-invitation"><span class="eyebrow">你的健康，值得好好照顾</span><h1>'+ (p.id==='confirm'?'登录后，确认这次预约':'登录后，继续你的健康旅程')+'</h1><p>预约记录、健康报告和家人的就诊资料，<br>都可以在你的个人空间里安心查看。</p>'+btn('去登录','login','teal')+'<div class="space">'+link('我想先看看服务 →','home')+'</div><small>登录用于保存你的预约与档案，我们不会读取与就诊无关的信息。</small></section>';}
function content(p){if(!state.loggedIn&&PRIVATE_PAGES.has(p.id))return loginGate(p);return rawContent(p);}
function shell(p){const nav=[['首页','home'],['社区','community-tab'],['治疗','treatment'],['商城','products']];
return '<div class="app consumer-app '+(p.id==='home'?'is-home':'')+'"><header class="app-header"><button class="brand" data-go="home"><img src="static/pc-brand.svg" alt="兴康明"><span>兴康明<small>专注睡眠呼吸健康</small></span></button><nav class="top-nav" aria-label="网站导航">'+nav.map(([t,k])=>'<button class="'+(p.id===k||(k==='community-tab'&&p.group==='社区')||(k==='treatment'&&p.group==='治疗追踪')||(k==='stores'&&p.group==='预约就诊')||(k==='assessment'&&p.group==='睡眠评估')||(k==='products'&&p.group==='健康商城')||(k==='community'&&p.group==='社区')?'current':'')+'" data-go="'+k+'">'+t+'</button>').join('')+'</nav><div class="header-user">'+(state.loggedIn?'<button data-go="profile">我的</button><button data-action="logout" class="muted">退出</button>':btn('登录 / 注册','login','secondary small'))+'</div></header><div class="app-body">'+content(p)+'</div><footer class="consumer-footer"><div><div class="brand">兴康明</div><p>专注睡眠呼吸健康 · 让每一个夜晚安宁无声</p></div><div><strong>认识兴康明</strong>'+link('门店与医生','stores')+link('直播中心','live')+'</div><div><strong>为你服务</strong>'+link('预约就诊','stores')+link('我的','profile')+'</div><div><strong>隐私与帮助</strong>'+link('用户协议','agreement')+link('隐私政策','privacy')+'</div><small>图片为诊所实景。页面内容用于了解服务与就诊流程，不替代医生面诊与诊断。</small></footer></div>';}
function renderCatalog(){const visible=PAGES.filter(p=>(p.title+p.group+p.route).toLowerCase().includes(state.search.toLowerCase()));$('#count').textContent=PAGES.length+' 个页面';$('#catalog').innerHTML=GROUPS.map(g=>{const list=visible.filter(p=>p.group===g);return list.length?'<div class="group-title">'+g+' / '+String(list.length).padStart(2,'0')+'</div>'+list.map(p=>'<button data-go="'+p.id+'" class="'+(state.page===p.id?'active':'')+'">'+p.title+'</button>').join(''):'';}).join('')||'<p class="mini-note">没有找到匹配的页面</p>';}
let revealObserver=null,revealTimer=null;
function revealInit(){
const els=[...document.querySelectorAll('#stage .reveal')];
const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!('IntersectionObserver' in window)||reduced){els.forEach(el=>el.classList.add('is-in'));return;}
revealObserver&&revealObserver.disconnect();
clearTimeout(revealTimer);
let fired=false;
revealObserver=new IntersectionObserver(entries=>{
fired=true;
entries.forEach(en=>{if(en.isIntersecting){en.target.classList.add('is-in');revealObserver.unobserve(en.target);}});
},{threshold:.12,rootMargin:'0px 0px -8% 0px'});
els.forEach(el=>revealObserver.observe(el));
revealTimer=setTimeout(()=>{if(!fired)els.forEach(el=>el.classList.add('is-in'));},1500);
}
function render(){
renderCatalog();document.body.classList.toggle('gallery-mode',state.mode==='gallery');document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.mode));
const page=PAGES.find(p=>p.id===state.page)||PAGES[0];
if(state.mode!=='gallery'){$('#stage').innerHTML=shell(page);revealInit();return;}
const saved={loggedIn:state.loggedIn,filter:state.filter};state.loggedIn=true;state.filter='全部';
$('#stage').innerHTML='<div class="gallery-intro"><span class="eyebrow">设计总览 · 非网站导航</span><h1>从初次了解，到日常陪伴。</h1><p>个人服务页面为登录后的页面。点击卡片可查看整页效果。</p></div>'+GROUPS.map(g=>{const list=PAGES.filter(p=>p.group===g);return '<section class="gallery-section"><h2>'+g+'</h2><div class="gallery-cards">'+list.map(p=>'<article class="thumbnail"><div class="thumbnail-top"><strong>'+p.title+'</strong><small>'+(PRIVATE_PAGES.has(p.id)?'登录后页面':'公开页面')+'</small></div><div class="thumbnail-viewport">'+shell(p)+'<button class="thumbnail-hit" data-preview="'+p.id+'" aria-label="预览'+p.title+'"></button></div></article>').join('')+'</div></section>';}).join('');
Object.assign(state,saved);fitGallery();
}
function fitGallery(){document.querySelectorAll('.thumbnail-viewport').forEach(el=>{const scale=el.clientWidth/1160;el.style.setProperty('--scale',scale);el.style.height=Math.ceil(el.querySelector('.app').scrollHeight*scale)+'px';});}
function go(id){if(!PAGES.some(p=>p.id===id))return;stopRecording();state.page=id;if(!state.loggedIn&&PRIVATE_PAGES.has(id))state.returnTo=id;state.mode='preview';state.filter='全部';history.replaceState(null,'','#'+id);render();window.scrollTo({top:0,behavior:'instant'});}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3500);}
function modal(title,body){$('#modal-body').innerHTML='<h2>'+title+'</h2>'+body;$('#modal').showModal();}
function stopRecording(){clearInterval(timer);timer=null;state.recording=false;}
function handleAction(a,el){
if(!state.loggedIn&&['checkout','checkin','submit-assessment'].includes(a)){state.returnTo=a==='submit-assessment'?'assessment-result':a==='checkout'?'product':'treatment';go('login');return;}
if(a==='order-action'){modal(el.textContent,'<p>订单状态与支付结果以实际订单页面为准。</p>');return;}
if(a==='wechat-address'){toast('请手动填写收货地址');return;}
if(a==='wechat-live'){modal('微信直播间','<p>直播将在微信小程序中观看。</p>');return;}
if(a==='post-share'){modal('分享','<p>把帖子分享到微信，和朋友一起交流。</p>');return;}
if(a==='report-post'){modal('举报','<form data-form="report">'+select('举报原因',['垃圾广告','违规言论','侮辱谩骂','涉嫌欺诈','其他原因'])+'<button class="btn">确认提交</button></form>');return;}
if(a==='reply'){const input=document.querySelector('[name="comment"]');state.replyTo='鼾友';input.placeholder='回复 @鼾友';input.focus();return;}
if(a==='comment-like'){el.textContent=el.textContent.includes('已点赞')?'点赞 · 1':'已点赞 · 2';return;}
if(a==='read-all'){toast('全部已读');return;}
if(a==='member'){state.member=state.member==='林晓'?'林爸爸':'林晓';render();toast('已切换就诊人');}
else if(a==='submit-assessment'){if(Object.keys(state.answers).length<8)return toast('请完成全部 8 道题目');go('assessment-result');}
else if(a==='record'){if(state.recording){stopRecording();render();return;}state.recording=true;state.seconds=0;render();timer=setInterval(()=>{state.seconds++;const time=$('#record-time');if(!time)return stopRecording();time.textContent=String(Math.floor(state.seconds/60)).padStart(2,'0')+':'+String(state.seconds%60).padStart(2,'0');const value=34+Math.round((Math.sin(state.seconds)+1)*6);$('#db').textContent=value;$('#peak-db').textContent=Math.max(Number($('#peak-db').textContent)||0,value);},1000);}
else if(a==='checkin')modal('今日佩戴记录','<form data-form="checkin">'+field('佩戴时长（小时）','number','','required min="0" max="24" step="0.1"')+select('痛感评分（VAS）',['0 · 无不适','1 · 轻微','2 · 轻微','3 · 中等','4 · 中等','5 · 较明显','6 · 明显','7 · 明显','8 · 严重','9 · 严重','10 · 非常严重'])+'<label class="field"><span>疼痛/不适部位</span><input placeholder="疼痛/不适部位"></label><label class="field"><span>备注（选填）</span><textarea placeholder="记录今日感受，如：轻微牙齿酸胀、睡眠质量改善..."></textarea></label><div class="form-actions"><button class="btn">确认提交</button></div></form>');
else if(a==='password')modal('账户密码设置','<form data-form="password">'+field('新密码','password','','required minlength="8" autocomplete="new-password"')+'<p class="mini-note">密码需 8 位以上，请勿使用生日等容易被猜到的组合。</p><button class="btn">保存</button></form>');
else if(a==='realname')modal('实名认证','<form data-form="realname">'+field('姓名','text','','required')+field('身份证号码','text','','required minlength="18" maxlength="18"')+'<div class="notice">实名信息仅用于就诊建档与预约核验。</div><button class="btn">提交</button></form>');
else if(a==='login'){if(!$('#agreement-check').checked)return toast('请先阅读并同意用户协议和隐私政策');state.loggedIn=true;go(state.returnTo||'profile');toast('登录成功');}
else if(a==='logout'){state.loggedIn=false;state.returnTo='profile';state.answers={};state.member='林晓';go('home');toast('已退出登录');}
else if(a==='like'){el.textContent=el.textContent.includes('已赞')?'赞同 · 24':'已赞 · 25';}
else if(a==='checkout'){const [name,,,price]=products[state.selectedProduct];modal('确认订单','<form data-form="checkout">'+info([['商品',name],['实付款','¥ '+price]])+field('购买数量','number','1','required min="1" max="99"')+'<h3>收货人信息</h3>'+action('选择微信地址','wechat-address','secondary')+field('收货人','text','','required placeholder="收货人姓名"')+field('联系电话','tel','','required placeholder="联系手机号"')+field('详细地址','text','','required placeholder="省市区及详细地址"')+'<p class="mini-note">请确认商品数量与收货信息，订单以支付成功为准。</p><button class="btn">立即支付</button></form>');}
else if(a==='cancel')modal('取消预约','<p>取消后原时段将不再为你保留，如需改约可重新选择时间。</p>');
else {const messages={phone:['更换绑定手机','更换手机号需要重新验证微信账号。'],share:['分享邀请卡','把邀请卡分享给朋友，邀请他们一起关注睡眠健康。'],play:['视频播放区域','课程视频将在小程序直播间播放。'], 'record-detail':['门诊记录','就诊人：林晓<br>门店：中心门店<br>医生：王医生<br>主诉、检查、诊断、处方方案及医嘱以本次门诊记录为准。']};const m=messages[a]||['提示','该操作暂未开放。'];modal(m[0],'<p>'+m[1]+'</p>');}
}
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;
if(el.dataset.post){state.postId=el.dataset.post;go('post');}
else if(el.dataset.product!==undefined){state.selectedProduct=Number(el.dataset.product);go('product');}
else if(el.dataset.order){state.selectedOrder=el.dataset.order;go('order');}
else if(el.dataset.postLike){state.postLikes[el.dataset.postLike]=!state.postLikes[el.dataset.postLike];render();}
else if(el.dataset.favorite){state.favorites[el.dataset.favorite]=!state.favorites[el.dataset.favorite];render();}
else if(el.dataset.preview){state.loggedIn=PRIVATE_PAGES.has(el.dataset.preview);go(el.dataset.preview);}
else if(el.dataset.doctorProfile){state.doctor=el.dataset.doctorProfile;go('doctor');}
else if(el.dataset.go){$('#modal').close();go(el.dataset.go);}
else if(el.dataset.mode){stopRecording();state.mode=el.dataset.mode;render();window.scrollTo(0,0);}
else if(el.dataset.action)handleAction(el.dataset.action,el);
else if(el.dataset.store){state.store=el.dataset.store;go('doctors');}
else if(el.dataset.doctor){state.doctor=el.dataset.doctor;go('times');}
else if(el.dataset.date){state.date=el.dataset.date;render();}
else if(el.dataset.time){state.time=el.dataset.time;render();}
else if(el.dataset.member){state.member=el.dataset.member;render();}
else if(el.dataset.answer){const [i,j]=el.dataset.answer.split(':');state.answers[i]=Number(j);const y=window.scrollY;render();window.scrollTo(0,y);}
else if(el.dataset.filter){state.filter=el.dataset.filter;render();}
else if(el.dataset.range){state.range=el.dataset.range;render();}
});
document.addEventListener('submit',e=>{const f=e.target;if(!f.dataset.form)return;e.preventDefault();if(f.dataset.form==='comment'){const input=new FormData(f).get('comment');if(!String(input).trim())return toast('请输入评论内容');$('#community-comments').insertAdjacentHTML('beforeend','<article class="list-row"><strong>我</strong><p>'+esc((state.replyTo?'回复 '+state.replyTo+'：':'')+input)+'</p></article>');f.reset();state.replyTo='';toast('评论已发布');return;}
if(f.dataset.form==='publish'){const data=new FormData(f);if(!String(data.get('title')).trim()||!String(data.get('content')).trim())return toast('请填写标题和内容');}
if(f.dataset.form==='chat'){const text=new FormData(f).get('message');$('#chat').insertAdjacentHTML('beforeend','<div class="chat-bubble self">'+esc(text)+'</div>');f.reset();toast('已发送');return;}$('#modal').close();toast('已提交');if(f.dataset.form==='member')go('family');if(f.dataset.form==='publish'){const data=new FormData(f);const id='demo-'+Date.now();DEMO_POSTS.push({id,author:'我',role:'鼾友',expert:false,top:false,title:esc(data.get('title')),body:esc(data.get('content')),category:esc(f.querySelector('select').value),labels:data.getAll('tags').map(esc),likes:0,comments:0,date:'2026.10.26 12:00'});state.postId=id;go('post');}});
document.addEventListener('change',e=>{if(e.target.name==='tags'&&document.querySelectorAll('[name="tags"]:checked').length>3){e.target.checked=false;toast('最多选择3个标签');}});
$('#close-modal').addEventListener('click',()=>$('#modal').close());
$('#search').addEventListener('input',e=>{state.search=e.target.value;if(state.mode==='preview')renderCatalog();else render();});
window.addEventListener('resize',fitGallery);
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(PAGES.some(p=>p.id===id))go(id);});
if(PAGES.some(p=>p.id===location.hash.slice(1))){state.page=location.hash.slice(1);if(PRIVATE_PAGES.has(state.page))state.returnTo=state.page;}
render();
