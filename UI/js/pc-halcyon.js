'use strict';
// Independent visual variant. Shared prototype files and real applications stay unchanged.
home = function halcyonHome() {
  const cta = (label, page) => btn(label + '<span class="btn-arrow" aria-hidden="true">↗</span>', page);
  const services = [
    ['睡眠评估','通过 ESS 嗜睡量表与 AI 鼾声分析，记录日间嗜睡和夜间鼾声情况，为就诊沟通提供参考。','assessment','开始评估'],
    ['预约就诊','选择门店、医生和就诊时间，为自己或家人预约。','stores','预约就诊'],
    ['治疗追踪','记录佩戴情况，查看睡眠趋势、医嘱建议和设备调整。','treatment','查看治疗追踪'],
    ['健康商城','提供阻鼾器、配件耗材与服务套餐，便于查看商品信息，选择日常护理所需。','products','进入商城']
  ];
  return `<section class="hc-hero hc-wrap">
    <div class="hc-intro reveal"><p class="hc-caption">兴康明 · 专注睡眠呼吸健康</p><h1>让每一个夜晚<br>安宁无声。</h1><p class="hc-lead">睡眠评估、预约就诊、治疗追踪，<br>一站式睡眠健康服务。</p><div class="hc-actions">${cta('预约就诊','stores')}${link('睡眠评估','assessment')}</div><div class="hc-shortcuts">${link('ESS 嗜睡量表','questionnaire')}${link('AI 鼾声分析','recording')}${link('门店与医生','stores')}</div></div>
    <div class="hc-photos reveal"><figure class="hc-photo-main"><img src="素材/微信图片_20261026145924_257_129.jpg" alt="诊所治疗室与蓝色诊疗椅实景"><figcaption>诊疗环境</figcaption></figure><figure class="hc-photo-small"><img src="static/clinic/appliance.jpg" alt="口腔矫治器实物"><figcaption>口腔矫治器</figcaption></figure><span class="hc-photo-label">评估 · 就诊 · 持续关注</span></div>
  </section>
  <div class="hc-strip"><span>睡眠评估</span><span>预约就诊</span><span>治疗追踪</span><span>阻鼾器管理</span><span>就诊人管理</span></div>
  <section class="hc-wrap hc-section"><div class="hc-section-head"><h2>睡眠健康服务，<br>覆盖评估与治疗追踪。</h2><p>整合睡眠评估、门诊预约与治疗记录，<br>满足初次就诊和日常健康管理的不同需求。</p></div><div class="hc-services">${services.map(([title,desc,page,label],i)=>`<article class="hc-service ${i===1?'hc-service-blue':''}"><div><h3>${title}</h3><p>${desc}</p></div>${link(label,page)}</article>`).join('')}</div></section>
  <section class="hc-doctor-band"><div class="hc-wrap hc-section"><div class="hc-section-head"><h2>专业医生团队，<br>专注睡眠呼吸诊疗。</h2><div><p>围绕鼾症评估、口腔矫治与治疗随访，<br>开展睡眠监测解读、设备调整与诊疗指导。</p><small>以下医生资料为设计演示</small></div></div><div class="hc-doctors">${[['王医生','鼾症评估与口腔矫治','doctor-1.jpg'],['陈医生','睡眠监测与报告解读','doctor-2.jpg'],['李医生','治疗随访与设备调整','doctor-3.jpg']].map(([name,desc,img])=>`<button class="hc-doctor" data-doctor="${name}" aria-label="查看${name}的就诊时段"><img src="static/demo/${img}" alt="医生演示图片"><span><strong>${name}</strong><small>${desc}</small></span></button>`).join('')}</div><div class="hc-band-link">${link('查看门店与医生','stores')}</div></div></section>
  <section class="hc-wrap hc-section hc-process"><div><h2>在线预约就诊，<br>四步完成预约安排。</h2><p>选择门店、医生与可预约时段，<br>支持本人及家庭成员预约，集中查看就诊安排。</p><figure class="hc-process-photo"><img src="素材/微信图片_20261026145930_263_129.jpg" alt="深圳兴康明诊所标识墙实景"></figure></div><ol>${[['选择门店','查看门店信息，选择方便前往的诊所。'],['选择医生','查看医生介绍，选择本次就诊的医生。'],['选择时间','查看可预约日期与时段，安排就诊时间。'],['确认预约','登录后选择就诊人，核对并确认预约信息。']].map(([title,desc],i)=>`<li><span>0${i+1}</span><div><h3>${title}</h3><p>${desc}</p></div></li>`).join('')}</ol></section>
  <section class="hc-community-band"><div class="hc-wrap hc-section"><div class="hc-section-head"><h2>睡眠科普与患者故事，<br>汇聚真实的日常交流。</h2><div><p>围绕睡眠科普、治疗知识与佩戴体验，<br>分享日常记录，交流适应过程中的经验。</p>${link('进入社区','community-tab')}</div></div><div class="hc-stories"><article><small>睡眠科普 · 演示内容</small><h3>阻鼾器佩戴常见问题</h3><p>从初次佩戴到日常清洁，汇集常见问题与使用经验，方便查阅和交流。</p>${link('查看热门内容','community-tab')}</article><article><small>患者故事 · 演示内容</small><h3>分享我的佩戴记录</h3><p>记录佩戴时长、适应期感受与日常变化，分享治疗过程中的个人体验。</p>${link('查看社区动态','community-tab')}</article></div></div></section>
  <section class="hc-wrap hc-section hc-device"><figure><img src="素材/微信图片_20261026151415_278_129.jpg" alt="蓝色口腔矫治器实物"></figure><div><h2>阻鼾器日常管理，<br>持续记录佩戴与维护。</h2><p>佩戴数据、维护记录与使用反馈集中管理，<br>关联治疗追踪中的医嘱建议和设备调整。</p><div class="hc-actions">${cta('阻鼾器管理','devices')}${link('健康商城','products')}</div></div></section>
  <section class="hc-wrap hc-section hc-faq"><div><h2>就诊与服务疑问，<br>常见问题集中解答。</h2>${link('在线客服','service')}</div><div>${[['未登录可以使用哪些服务？','你可以先浏览门店、医生、睡眠评估介绍、社区与商城；个人档案和预约确认需要登录。'],['可以为家人预约吗？','可以。在就诊人管理中添加家人资料，确认预约时选择对应就诊人。'],['在哪里查看报告和治疗记录？','登录后可在个人中心查看病历档案，并在治疗追踪中查看睡眠报告、医嘱建议等信息。'],['睡眠评估能替代医生诊断吗？','不能。评估内容用于了解睡眠情况，不替代医生面诊与诊断。']].map(([q,a],i)=>`<details ${i===0?'open':''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>
  <section class="hc-wrap hc-book"><div><h2>预约睡眠门诊，<br>安排合适就诊时间。</h2><p>查看门店与医生的可预约时段，为自己或家人预约就诊。</p></div>${cta('预约就诊','stores')}</section>`;
};
const halcyonBaseShell = shell;
shell = function halcyonShell(page) {
  const nav = [['首页','home'],['睡眠评估','assessment'],['治疗追踪','treatment'],['社区','community-tab'],['健康商城','products']];
  const active = id => page.id === id || (id==='assessment' && page.group==='睡眠评估') || (id==='treatment' && page.group==='治疗追踪') || (id==='community-tab' && page.group==='社区') || (id==='products' && page.group==='健康商城');
  const header = `<header class="app-header hc-header"><button class="brand" data-go="home" aria-label="兴康明首页"><img src="static/pc-brand.svg" alt=""><span>兴康明<small>专注睡眠呼吸健康</small></span></button><nav class="top-nav" aria-label="网站导航">${nav.map(([title,id])=>`<button data-go="${id}" ${active(id)?'class="current" aria-current="page"':''}>${title}</button>`).join('')}</nav><div class="header-user">${state.loggedIn?'<button data-go="profile">我的</button><button data-action="logout">退出</button>':'<button data-go="login">登录 / 注册</button>'}<button class="btn small hc-header-book" data-go="stores">预约就诊</button></div></header>`;
  return halcyonBaseShell(page).replace(/<header class="app-header">[\s\S]*?<\/header>/,header);
};
render();
