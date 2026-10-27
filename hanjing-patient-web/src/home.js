import { btn, link, image, esc, records, empty, date } from './ui.js';
export function home() {
  return `<section class="hc-hero hc-wrap"><div class="hc-intro"><p class="hc-caption">兴康明 · 专注睡眠呼吸健康</p><h1>让每一个夜晚<br>安宁无声。</h1><p class="hc-lead">睡眠评估、预约就诊、治疗追踪，<br>一站式睡眠健康服务。</p><div class="hc-actions">${btn('预约就诊', 'stores')}${link('睡眠评估', 'assessment')}</div></div><div class="hc-photos"><figure class="hc-photo-main"><img src="/brand/treatment-room.jpg" alt="诊所治疗室与蓝色诊疗椅实景"><figcaption>诊疗环境</figcaption></figure><figure class="hc-photo-small"><img src="/brand/appliance.jpg" alt="阻鼾器实物"><figcaption>阻鼾器</figcaption></figure><span class="hc-photo-label">评估 · 就诊 · 持续关注</span></div></section>
  <div class="hc-type-banner">${['睡眠评估','AI鼾声分析','预约就诊','治疗追踪','经历分享'].map((label, i) => `<span class="hc-type-word" style="--word-index:${i}"><img src="/brand/services-type-ai.png" alt="${label}"></span>`).join('')}</div>
  <section class="hc-wrap hc-section"><div class="hc-section-head"><h2>睡眠健康服务，<br>覆盖评估与治疗追踪。</h2><p>整合睡眠评估、门诊预约与治疗记录，<br>满足初次就诊和日常健康管理的不同需求。</p></div><div class="hc-services">${[
    [
      '睡眠评估',
      '通过 ESS 嗜睡量表与 AI 鼾声分析，记录日间嗜睡和夜间鼾声情况，为就诊沟通提供参考。',
      'assessment',
      '开始评估',
    ],
    [
      '预约就诊',
      '选择门店、医生和就诊时间，为自己或家人预约。',
      'stores',
      '预约就诊',
    ],
    [
      '治疗追踪',
      '记录佩戴情况，查看睡眠趋势、医嘱建议和设备调整。',
      'treatment',
      '查看治疗追踪',
    ],
    [
      '健康商城',
      '提供阻鼾器、配件耗材与服务套餐，便于查看商品信息，选择日常护理所需。',
      'products',
      '进入商城',
    ],
  ]
    .map(
      ([t, d, p, l], i) =>
        `<article class="hc-service ${i === 1 ? 'hc-service-blue' : ''}"><div><h3>${t}</h3><p>${d}</p></div>${btn(l, p)}</article>`,
    )
    .join('')}</div></section>
  <section class="hc-doctor-band"><div class="hc-wrap hc-section"><div class="hc-section-head"><h2>专业医生团队，<br>专注睡眠呼吸诊疗。</h2><p>围绕鼾症评估、口腔矫治与治疗随访，<br>开展睡眠监测解读、设备调整与诊疗指导。</p></div><div id="home-doctors" aria-live="polite"><p>正在加载医生资料…</p></div><div class="hc-band-link">${btn('查看门店与医生', 'stores')}</div></div></section>
  <section class="hc-wrap hc-section hc-process"><div><h2>在线预约就诊，<br>四步完成预约安排。</h2><p>选择门店、医生与可预约时段，<br>支持本人及家庭成员预约，集中查看就诊安排。</p><figure class="hc-process-photo"><img src="/brand/clinic-wall.jpg" alt="兴康明诊所标识墙实景" loading="lazy"></figure></div><ol>${[
    ['选择门店', '查看门店信息，选择方便前往的诊所。'],
    ['选择医生', '查看医生介绍，选择本次就诊的医生。'],
    ['选择时间', '查看可预约日期与时段，安排就诊时间。'],
    ['确认预约', '登录后选择就诊人，核对并确认预约信息。'],
  ]
    .map(
      ([t, d], i) =>
        `<li tabindex="0"><span>0${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`,
    )
    .join('')}</ol></section>
  <section class="hc-community-band"><div class="hc-wrap hc-section"><div class="hc-section-head"><h2>睡眠科普与患者故事，<br>汇聚真实的日常交流。</h2><div><p>围绕睡眠科普、治疗知识与佩戴体验，<br>分享日常记录，交流适应过程中的经验。</p>${btn('进入社区', 'community')}</div></div><div id="home-posts" aria-live="polite"><p>正在加载社区动态…</p></div></div></section>
  <section class="hc-wrap hc-section hc-device"><figure class="hc-carousel" aria-label="阻鼾器实物展示" aria-roledescription="轮播"><div class="hc-carousel-images"><img class="is-active" src="/brand/appliance-blue.jpg" alt="蓝色阻鼾器实物" loading="lazy"><img src="/brand/appliance.jpg" alt="透明阻鼾器实物" loading="lazy" aria-hidden="true"></div><div class="hc-carousel-controls"><button type="button" data-slide="0" aria-label="查看蓝色阻鼾器" aria-pressed="true">01</button><button type="button" data-slide="1" aria-label="查看透明阻鼾器" aria-pressed="false">02</button></div></figure><div><h2>阻鼾器日常管理，<br>持续记录佩戴与维护。</h2><p>佩戴数据、维护记录与使用反馈集中管理，<br>关联治疗追踪中的医嘱建议和设备调整。</p><div class="hc-actions">${btn('阻鼾器管理', 'devices')}${link('健康商城', 'products')}</div></div></section>
  <section class="hc-wrap hc-section hc-faq"><div><h2>就诊与服务疑问，<br>常见问题集中解答。</h2><a class="hc-support" href="#/service"><img src="/brand/service-support.svg" alt="戴耳麦的客服人员插画"><span>在线客服<small>咨询就诊与服务问题</small></span></a></div><div>${[
    [
      '未登录可以使用哪些服务？',
      '你可以先浏览门店、医生、睡眠评估介绍、社区与商城；个人档案和预约确认需要登录。',
    ],
    [
      '可以为家人预约吗？',
      '可以。在就诊人管理中添加家人资料，确认预约时选择对应就诊人。',
    ],
    [
      '在哪里查看报告和治疗记录？',
      '登录后可在个人中心查看病历档案，并在治疗追踪中查看睡眠报告、医嘱建议等信息。',
    ],
    [
      '睡眠评估能替代医生诊断吗？',
      '不能。评估内容用于了解睡眠情况，不替代医生面诊与诊断。',
    ],
  ]
    .map(
      ([q, a], i) =>
        `<div class="hc-faq-item"><h3><button type="button" class="hc-faq-question" aria-expanded="${i === 0}" aria-controls="faq-answer-${i}">${q}<span aria-hidden="true">${i === 0 ? '−' : '+'}</span></button></h3><div id="faq-answer-${i}" class="hc-faq-answer ${i === 0 ? 'is-open' : ''}" aria-hidden="${i !== 0}"><div class="hc-faq-answer-inner"><p>${a}</p></div></div></div>`,
    )
    .join('')}</div></section>
  <section class="hc-wrap hc-book"><div><h2>预约睡眠门诊，<br>安排合适就诊时间。</h2><p>查看门店与医生的可预约时段，为自己或家人预约就诊。</p></div>${btn('预约就诊', 'stores')}</section>`;
}
export const homeDoctors = (doctors) =>
  doctors.length
    ? `<div class="hc-doctors">${doctors
        .slice(0, 3)
        .map(
          (d) =>
            `<a class="hc-doctor" href="#/doctors?id=${encodeURIComponent(d.id)}">${image(d.avatar, d.name)}<span><strong>${esc(d.name)}</strong><small>${esc(d.title)} · ${esc(d.specialty)}</small></span></a>`,
        )
        .join('')}</div>`
    : empty('医生资料更新中', link('查看门店', 'stores'));
export const homePosts = (posts) =>
  `<div class="hc-stories">${records(posts.slice(0, 2), (p) => `<article><div class="hc-post-author">${image(p.avatar, p.author || '鼾友', 'hc-author-avatar')}<div><small>${esc(p.roleLabel)} · ${esc(p.author)}</small><time>${esc(date(p.createdAt))}</time></div></div><h3>${esc(p.title)}</h3><p>${esc((p.summary || p.content || '').slice(0, 100))}</p>${btn('阅读内容', 'post', { id: p.id })}</article>`, '暂无社区动态')}</div>`;
