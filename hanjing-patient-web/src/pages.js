import {pendingPage,pendingRoutes} from './pending-pages.js';
import {essReport} from './ess-report.js';
import {snoreReport} from './snore-report.js';
import {recordingPage} from './recording-page.js';
import {appointmentList} from './appointment-list.js';
import {appointmentDetail} from './appointment-detail.js';
import {doctorSchedule} from './doctor-booking.js';
import {storeCard,doctorCard,doctorDetail} from './clinic.js';
import {shopProductCard,shopProductDetail,relatedProducts} from './shop.js';
import { renderTreatment, treatmentTitles, wearingForm } from './treatment.js';
import { showLocalLogin } from './local-login.js';
import { list, query } from './api.js';
import { legal } from './legal.js';
import {
  esc,
  btn,
  link,
  action,
  image,
  money,
  date,
  today,
  badge,
  empty,
  panel,
  field,
  area,
  select,
  submit,
  form,
  kv,
  records,
  patientSelect,
  pageHead,
  safeUrl,
} from './ui.js';

export const titles = {
  ...treatmentTitles,
  agreement: '用户协议',
  privacy: '隐私政策',
  home: '首页',
  login: '登录',
  stores: '门店与医生',
  doctors: '专业医生团队',
  booking: '预约就诊',
  appointments: '我的预约',
  appointment: '预约详情',
  assessment: '睡眠评估',
  questionnaire: 'ESS 嗜睡量表',
  recording: 'AI 鼾声分析',
  assessments: '评估记录',
  report: '评估报告',
  treatment: '治疗追踪',
  devices: '阻鼾器管理',
  device: '设备详情',
  wearing: '佩戴打卡',
  medical: '病历档案',
  community: '社区',
  post: '社区详情',
  publish: '发布动态',
  products: '健康商城',
  product: '商品详情',
  checkout: '确认订单',
  orders: '我的订单',
  order: '订单详情',
  profile: '个人中心',
  editProfile: '个人资料',
  family: '就诊人管理',
  member: '就诊人资料',
  membership: '会员权益',
  security: '账号安全',
  notifications: '消息通知',
  service: '在线客服',
};
export const publicPages = new Set([
  'agreement',
  'privacy',
  'home',
  'login',
  'stores',
  'doctors',
  'assessment',
  'community',
  'post',
  'products',
  'product',
]);
const head = (id, desc = '', buttons = '') =>
  pageHead(titles[id], desc, buttons);
const hidden = (key, value) =>
  `<input type="hidden" name="${esc(key)}" value="${esc(value)}">`;
const relation = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};
const productCard = shopProductCard;
function linkImage(src, alt, page, params) {
  return `<a href="#/${page}?${new URLSearchParams(params)}">${image(src, alt)}</a>`;
}
const postCard = (p) =>
  `<article class="pc-post">${p.coverUrl ? linkImage(p.coverUrl, p.title, 'post', { id: p.id }) : ''}<div><div class="feed-author"><span class="feed-avatar" aria-hidden="true">${esc((p.author || '用户').slice(0,1))}</span><small>${esc(p.author)} · ${esc(p.roleLabel)}</small></div><h3>${link(p.title, 'post', { id: p.id }, 'text-button')}</h3><p class="clamp">${esc(p.summary || p.content)}</p><div class="feed-bottom"><small>${date(p.createdAt)} · ${esc(p.likes || 0)} 点赞 · ${esc(p.comments || 0)} 评论</small>${link('阅读全文', 'post', { id:p.id })}</div></div></article>`;
async function scoped(c) {
  c.members = list(await c.get('/user/family-members'));
  c.patientId = c.params.get('patientId') || '';
  if (!c.members.length) return '';
  if (!c.members.some((p) => String(p.id) === c.patientId))
    c.patientId = String(c.members[0].id);
  return c.patientId;
}
function scopeBar(c) {
  return patientSelect(c.members, c.patientId);
}

export async function page(c) {
  if (!pendingRoutes.has(c.page)) return basePage(c);
  const originalGet = c.get, cache = new Map();
  c.get = path => {if(!cache.has(path))cache.set(path,originalGet(path));return cache.get(path);};
  try { return await pendingPage(c, await basePage(c), titles); }
  finally { c.get = originalGet; }
}
async function basePage(c) {
  const p = c.params,
    id = p.get('id') || '',
    get = c.get;
  switch (c.page) {
    case 'agreement':
    case 'privacy':
      return head(c.page) + `<article class="pc-legal">${legal[c.page].map(item => item.type === 'section-title' || item.type === 'article-title' ? `<h2>${esc(item.text)}</h2>` : `<p class="${item.type==='important'?'legal-important':item.type==='article-meta'?'legal-meta':''}">${esc(item.text)}</p>`).join('')}</article>`;
    case 'login':
      return (
        `<div class="login-layout"><section class="login-intro"><h2>从今天起，<br>持续关注每一夜好眠。</h2><p>预约就诊、管理家庭成员，<br>查看评估报告和治疗记录。</p>${image('/brand/clinic-wall.jpg', '兴康明诊所')}</section>${panel('欢迎来到兴康明', `<div class="login-modes"><button type="button" data-action="login-mode" data-mode="password" aria-pressed="true">密码登录</button><button type="button" data-action="login-mode" data-mode="wechat" aria-pressed="false">微信扫码登录</button></div><div id="password-login">${form('login', field('手机号', 'phone', '', 'tel', 'required pattern="1[0-9]{10}" maxlength="11" autocomplete="username" placeholder="请输入手机号"') + field('密码', 'password', '', 'password', 'required maxlength="128" autocomplete="current-password" placeholder="请输入密码"') + submit('登录'))}</div><div id="wechat-login" hidden><h3>微信扫码登录</h3><p>打开微信官方登录页后，使用微信扫一扫二维码完成授权。</p>${action('前往微信扫码', 'wechat-start', '', false)}</div>${showLocalLogin() ? `<div class="local-login-entry">${action('本地模拟登录', 'local-login')}<small>使用独立测试账号</small></div>` : ''}<div id="wechat-message" role="alert"></div>`, 'login-panel')}</div>`
      );
    case 'stores': {
      const stores=list(await get('/stores'));c.stores=stores;
      return pageHead('请选择就诊门店','选择方便前往的诊所，查看医生和可预约时间。',btn('我的预约','appointments'))+`<div class="clinic-store-grid">${records(stores,storeCard,'暂无可展示的门店')}</div>`;
    }
    case 'doctors': {
      const storeId=p.get('storeId')||'';
      const doctors=list(await get('/doctors'+query({storeId})));
      const shown=id?doctors.filter(d=>String(d.id)===id):doctors;
      if(id && shown.length){
        c.clinicDoctor=shown[0];c.doctorId=String(c.clinicDoctor.id);
        const stores=list(await get('/stores'));
        c.clinicStores=stores.filter(s=>s.status==='open'&&(c.clinicDoctor.storeIds||[]).some(v=>String(v)===String(s.id)));
        c.storeId=String(storeId||c.clinicStores[0]?.id||'');
        if(c.storeId&&!c.clinicStores.some(s=>String(s.id)===c.storeId))return pageHead('医生详情')+empty('该门店暂不可预约',btn('选择门店','stores'));
        c.clinicSlot=null;c.clinicSchedule=null;c.clinicMonth=null;c.clinicDate=null;
        if(c.storeId){const [rawSchedules,rawDates]=await Promise.all([get('/schedules'+query({storeId:c.storeId,doctorId:c.doctorId})),get('/schedules/dates'+query({storeId:c.storeId,doctorId:c.doctorId}))]);c.clinicDates=list(rawDates);c.schedules=list(rawSchedules).filter(s=>s.status==='available'&&s.date>=today()&&c.clinicDates.includes(s.date));}else{c.schedules=[];c.clinicDates=[];}c.slots=[];
        return pageHead('医生详情','查看医生介绍，选择门店与就诊时段。',btn('我的预约','appointments'))+`<div class="doctor-booking-layout">${doctorDetail(c.clinicDoctor,c.storeId,true)}${doctorSchedule(c)}</div>`;
      }
      return (id?pageHead('医生详情','查看专业领域、医生介绍与就诊安排。',btn('选择门店','stores')):pageHead('请选择医生','查看专业领域、医生介绍与就诊安排。',btn('选择门店','stores')))+(id?records(shown,d=>doctorDetail(d,storeId),'暂无可预约医生'):`<div class="clinic-doctor-grid">${records(shown,d=>doctorCard(d,storeId),'暂无可预约医生')}</div>`);
    }
    case 'booking': {
      c.reschedule = id
        ? (await get('/appointments/' + encodeURIComponent(id))).appointment
        : null;
      c.storeId = String(c.reschedule?.storeId || p.get('storeId') || '');
      c.doctorId = String(c.reschedule?.doctorId || p.get('doctorId') || '');
      if (!c.storeId || !c.doctorId)
        return (
          head('booking') +
          empty('请先选择门店与医生', btn('选择门店', 'stores'))
        );
      const [stores, doctors, schedules, members] = await Promise.all([
        get('/stores'),
        get('/doctors' + query({ storeId: c.storeId })),
        get('/schedules' + query({ storeId: c.storeId, doctorId: c.doctorId })),
        get('/user/family-members'),
      ]);
      c.schedules = list(schedules);
      c.members = list(members);
      c.slots = [];
      const doctor = list(doctors).find((d) => String(d.id) === c.doctorId),
        store = list(stores).find((s) => String(s.id) === c.storeId);
      if (!doctor || !store || store.status !== 'open')
        throw new Error('门店或医生已不可预约，请重新选择');
      return (
        head(
          'booking',
          c.reschedule
            ? '修改就诊时间，费用与预约状态按现有规则处理。'
            : '选择就诊人和预约时段。',
        ) +
        `<div class="pc-grid booking-grid">${panel(
          doctor.name,
          `${image(doctor.avatar, doctor.name, 'doctor-avatar')}<p>${esc(doctor.title)}</p>${kv(
            [
              ['门店', store.name],
              ['地址', store.address],
              ['诊金', money(doctor.consultFee)],
            ],
          )}<p class="muted">预约费用请联系门店支付。</p>`,
        )}${panel(
          c.reschedule ? '修改预约' : '确认预约',
          !c.members.length
            ? empty('请先添加就诊人', btn('就诊人管理', 'family'))
            : form(
                'booking',
                `${c.reschedule ? hidden('patientId', c.reschedule.patientId) + `<p>就诊人：${esc(c.reschedule.patientName)}</p>` : patientSelect(c.members)}${select('就诊日期与时段', 'scheduleId', [['', '请选择排班'], ...c.schedules.filter((s) => s.status === 'available').map((s) => [s.id, `${s.date} ${s.startTime.slice(0, 5)}—${s.endTime.slice(0, 5)}`])], '', 'required data-schedule-select')}<div id="booking-slots" class="slots"><p>选择排班后显示具体时段。</p></div>${
                  c.reschedule
                    ? ''
                    : area(
                        '症状描述（选填）',
                        'symptomDesc',
                        '',
                        'maxlength="1000"',
                      )
                }${submit(c.reschedule ? '确认修改' : '提交预约')}<p class="muted">如提交后网络中断，请先查看“我的预约”，避免重复预约。</p>`,
              ),
        )}</div>`
      );
    }
    case 'appointments': {
      const [appointments,settings]=await Promise.all([get('/appointments'),get('/settings/booking')]);
      c.appointments=list(appointments);c.bookingSettings=settings;c.appointmentTab=p.get('tab')==='history'?'history':'upcoming';
      return head('appointments','查看本人及家人的预约安排。',btn('预约就诊','stores'))+`<div id="appointment-list">${appointmentList(c)}</div>`;
    }
    case 'appointment': {
      const [detail,settings]=await Promise.all([get('/appointments/'+encodeURIComponent(id)),get('/settings/booking')]);
      c.appointment={...detail.appointment,medicalRecord:detail.medicalRecord};c.bookingSettings=settings;
      return head('appointment','',btn('全部预约','appointments'))+appointmentDetail(detail,settings,medicalCard);
    }
    case 'assessment':
      return (
        head(
          'assessment',
          '了解日间嗜睡和夜间声音情况，评估结果不替代医生诊断。',
          link('评估记录', 'assessments'),
        ) +
        `<div class="assessment-overview"><div class="pc-grid two assessment-choices">
          <section class="pc-panel assessment-choice"><img class="assessment-art" src="/brand/assessment-day.svg" alt="日间阅读场景插画"><span class="assessment-type">日间状态</span><h2>ESS 嗜睡量表</h2><p>通过 8 个日常情景，了解近期白天的嗜睡程度。</p>${btn('开始评估', 'questionnaire')}</section>
          <section class="pc-panel assessment-choice assessment-night"><img class="assessment-art" src="/brand/assessment-night.svg" alt="月夜与声音波形示意，非检测数据"><span class="assessment-type">睡眠声音 · 波形示意</span><h2>AI 鼾声分析</h2><p>记录睡眠中的声音，查看本次录音的分析报告。</p>${btn('开始录音', 'recording')}</section>
        </div></div>`
      );
    case 'questionnaire': {
      c.members = list(await get('/user/family-members'));
      c.questions = list(await get('/assessments/ess-questions'));
      if (c.questions.length !== 8) throw new Error('量表加载不完整，请重试');
      return (
        head('questionnaire', '根据近期情况回答全部 8 题，结果仅供参考。') +
        panel(
          '',
          !c.members.length
            ? empty('请先添加就诊人', btn('就诊人管理', 'family'))
            : form(
                'ess',
                patientSelect(c.members) +
                  c.questions
                    .map(
                      (q, i) =>
                        `<fieldset class="question"><legend>${i + 1}. ${esc(q.situation)}</legend><p>${esc(q.hint)}</p><div class="answer-options">${['不会打瞌睡', '轻度可能', '中度可能', '很可能'].map((v, j) => `<label><input required type="radio" name="answer${i}" value="${j}"><span>${v}</span></label>`).join('')}</div></fieldset>`,
                    )
                    .join('') +
                  submit('提交评估'),
              ),
        )
      );
    }
    case 'assessments': {
      await scoped(c);
      if (!c.patientId)
        return (
          head('assessments') +
          empty('请先添加就诊人', btn('就诊人管理', 'family'))
        );
      const rows = list(
        await get('/assessments' + query({ patientId: c.patientId })),
      );
      c.assessments = rows;
      return (
        head(
          'assessments',
          '查看历次评估，不以单次结果替代医生诊断。',
          btn('开始评估', 'assessment'),
        ) +
        scopeBar(c) +
        panel(
          '',
          records(
            rows,
            (a) =>
              `<article class="pc-list-row"><div><h3>${a.type === 'ess' ? 'ESS 嗜睡量表' : 'AI 鼾声分析'}</h3><p>${date(a.createdAt)} · ${esc(a.essScore ?? a.snoreAnalysis?.riskScore ?? '—')} 分</p></div>${link('查看报告', 'report', { id: a.id, patientId: c.patientId })}</article>`,
            '暂无评估记录',
          ),
        )
      );
    }
    case 'report': {
      const all = list(
        await get('/assessments' + query({ patientId: p.get('patientId') })),
      );
      const a = all.find((v) => String(v.id) === id);
      if (!a) throw new Error('评估记录不存在或无权访问');
      return (
        pageHead(
          a.type==='ess'?'评估报告':'鼾声分析报告',
          date(a.createdAt),
          link('全部评估', 'assessments', {
            patientId: p.get('patientId') || '',
          }),
        ) + reportCard(a, a.type === 'ess' ? list(await get('/assessments/ess-questions')) : [])
      );
    }
    case 'recording': {
      c.members=list(await get('/user/family-members'));
      return head('recording','记录睡眠声音，了解夜间呼吸情况。')+(c.members.length?recordingPage(c.members,p.get('patientId')):empty('请先添加就诊人',btn('就诊人管理','family')));
    }
    case 'community': {
      c.posts = list(await get('/community/posts'));
      return (
        head(
          'community',
          '睡眠科普、患者故事与佩戴经验，在这里分享和交流。',
          btn('发布动态', 'publish'),
        ) +
        `<div class="browse-toolbar"><div class="browse-tabs" aria-label="社区分类">${['全部', '分享', '提问', '科普'].map((name,i)=>`<button type="button" data-browse-post="${i ? name : ''}" aria-pressed="${i===0}">${name}</button>`).join('')}</div><label class="field browse-search"><span class="sr-only">搜索社区</span><input type="search" data-search="posts" placeholder="搜索标题或内容"></label></div><div id="search-results" class="post-list community-feed">${records(c.posts, postCard, '暂无社区动态')}</div>`
      );
    }
    case 'post': {
      c.post = await get('/community/posts/' + encodeURIComponent(id));
      const a = c.post;
      return (
        head('post', '', link('返回社区', 'community')) +
        panel(
          '',
          `<article><small>${esc(a.author)} · ${esc(a.roleLabel)} · ${date(a.createdAt)}</small><h1 class="article-title">${esc(a.title)}</h1>${a.coverUrl ? image(a.coverUrl, a.title, 'article-cover') : ''}<p class="prewrap article-content">${esc(a.content)}</p><div class="pc-actions">${action(`${a.isLiked ? '已点赞' : '点赞'} · ${a.likes || 0}`, 'post-like')}${action(`${a.isFavorited ? '已收藏' : '收藏'} · ${a.favoritesCount || 0}`, 'post-favorite')}${action('复制链接', 'post-share')}${action('举报', 'post-report')}</div></article>`,
        ) +
        panel(
          '评论',
          records(
            a.comments || [],
            (m) =>
              `<article class="comment"><small>${esc(m.author)}${m.parentAuthor ? ' 回复 ' + esc(m.parentAuthor) : ''} · ${date(m.createdAt)}</small><p>${esc(m.content)}</p>${action(`${m.isLiked ? '已点赞' : '点赞'} · ${m.likes || 0}`, 'comment-like', `data-id="${esc(m.id)}"`)}${action('回复', 'comment-reply', `data-id="${esc(m.id)}"`)}</article>`,
            '暂无评论',
          ) +
            form(
              'comment',
              '<p id="reply-label"></p>' +
                hidden('parentId', '') +
                area('写下评论', 'content', '', 'required maxlength="1000"') +
                submit('发表评论'),
            ),
        )
      );
    }
    case 'publish':
      return (
        head(
          'publish',
          '分享真实体验，请勿发布个人隐私或未经证实的疗效宣传。',
        ) +
        panel(
          '',
          form(
            'publish',
            field('标题', 'title', '', 'text', 'required maxlength="40"') +
              select('分类', 'category', [
                ...['睡眠科普','治疗知识','设备介绍','患者故事','阻鼾器配戴','科普问答'].map(x=>[x,x]),
              ]) +
              area('内容', 'content', '', 'required maxlength="1000" data-publish-content placeholder="详细描述你的情况、问题或分享经验..."') + '<p class="parity-count" data-publish-count>0/1000</p><fieldset class="parity-tag-options"><legend>标签（最多3个）</legend>'+['适应期','治疗分享','AHI改善','设备保养','情感支持','经验交流'].map(t=>`<label><input type="checkbox" name="tags" value="${t}" data-publish-tag>${t}</label>`).join('')+'</fieldset>'+
              submit('发布帖子'),
          ),
        )
      );
    case 'products': {
      const [products, categories] = await Promise.all([
        get('/products'),
        get('/product-categories'),
      ]);
      c.products = list(products);
      c.categories = list(categories);
      return (
        head(
          'products',
          '阻鼾器、配件耗材与服务套餐，选择日常护理所需。',
          btn('我的订单', 'orders'),
        ) +
        `<div class="browse-toolbar"><div class="browse-tabs" aria-label="商品分类">${[['','全部'],...c.categories.map(v=>[v.code,v.name])].map(([value,name],i)=>`<button type="button" data-browse-product="${esc(value)}" aria-pressed="${i===0}">${esc(name)}</button>`).join('')}</div>${field('搜索商品', 'search', '', 'search', 'data-search="products" placeholder="搜索商品名称或描述"')}</div><div id="search-results" class="product-grid compact-products">${records(c.products, productCard, '暂无在售商品')}</div>`
      );
    }
    case 'product': {
      c.product = await get('/products/' + encodeURIComponent(id));
      const a = c.product;
      const similar = list(await get('/products'));
      return (
        head('product', '', link('全部商品', 'products')) +
        panel(
          '',
          shopProductDetail(a),
          'shop-detail-panel',
        )+relatedProducts(a,similar)
      );
    }
    case 'checkout': {
      c.product = await get('/products/' + encodeURIComponent(id));
      c.stores = list(await get('/stores')).filter((s) => s.status === 'open');
      return (
        head('checkout', '请核对商品与订单信息，付款请联系门店。') +
        panel(
          c.product.name,
          `${image(c.product.imageUrl,c.product.name,'parity-thumb')}<p class="price">${money(c.product.price)}</p>${form(
            'order',
            field(
              '数量',
              'quantity',
              1,
              'number',
              `required min="1" max="${Math.min(99, c.product.stock)}" step="1"`,
            ) +
              select(
                '配送方式',
                'deliveryMethod',
                [
                  ['online', '快递配送'],
                  ['pickup', '门店自提'],
                ],
                '',
                'data-delivery-method',
              ) +
              field(
                '联系人',
                'contactName',
                '',
                'text',
                'required maxlength="50" autocomplete="name"',
              ) +
              field(
                '联系电话',
                'phone',
                '',
                'tel',
                'required pattern="1[0-9]{10}" maxlength="11" autocomplete="tel"',
              ) +
              `<div id="shipping-fields">${area('完整收货地址', 'detailAddress', '', 'required maxlength="255" autocomplete="street-address"')}</div><div id="pickup-fields" hidden>${select('自提门店', 'storeId', [['', '请选择门店'], ...c.stores.map((s) => [s.id, s.name])])}</div>` +
              `<div class="parity-fee" aria-live="polite"><span>商品金额：<b data-checkout-total>${money(c.product.price)}</b></span></div>`+submit('创建订单'),
          )}`,
        )
      );
    }
    case 'orders':
      return (
        head(
          'orders',
          '查看订单状态、商品与配送信息。',
          btn('健康商城', 'products'),
        ) +
        panel(
          '',
          records(
            list(await get('/orders')),
            (a) =>
              `<article class="pc-list-row"><div><small>${esc(a.orderNo)}</small><h3>${esc(a.items?.map((v) => v.productName).join('、'))}</h3><p>${date(a.createdAt)} · ${money(a.payAmount)}</p></div><div>${badge(a.status === 'pending' ? 'pending_payment' : a.status)}${link('查看详情', 'order', { id: a.id })}</div></article>`,
            '暂无订单',
          ),
        )
      );
    case 'order': {
      c.order = await get('/orders/' + encodeURIComponent(id));
      const a = c.order;
      return (
        head('order', a.orderNo, link('全部订单', 'orders')) +
        panel(
          '',
          `${badge(a.status === 'pending' ? 'pending_payment' : a.status)}${records(a.items || [], (v) => `<div class="pc-list-row"><div><h3>${esc(v.productName)}</h3><p>数量 ${esc(v.quantity)}</p></div><strong>${money(v.price)}</strong></div>`)}${kv(
            [
              ['商品金额', money(a.totalAmount)],
              ['优惠金额', money(a.discountAmount)],
              ['应付金额', money(a.payAmount)],
              ['联系人', a.shippingAddress?.contactName],
              ['电话', a.shippingAddress?.phone],
              [
                '地址 / 自提门店',
                a.shippingAddress?.detailAddress ||
                  a.shippingAddress?.storeName,
              ],
            ],
          )}<div class="pc-actions">${a.status === 'pending' ? action('取消订单', 'cancel-order') : ''}${a.status === 'shipped' ? action('确认收货', 'receive-order') : ''}${['paid', 'shipping', 'shipped', 'completed'].includes(a.status) ? action('申请退款', 'refund-order') : ''}${action('查看物流', 'logistics')}</div><div id="logistics"></div>${a.status === 'pending' ? '<p class="notice">订单待支付，请联系门店完成付款。</p>' : ''}`,
        )
      );
    }
    case 'profile': {
      c.profile = await get('/user/profile');
      return (
        head('profile', '管理自己的睡眠健康，也照顾家人的就诊需要。') +
        panel(
          '',
          `<div class="profile-heading">${image(c.profile.avatar, c.profile.nickname, 'avatar')}<div><h2>${esc(c.profile.nickname || '患者')}</h2><p>${esc(c.profile.phone)} · ${esc(c.profile.memberLevelTitle || '普通会员')}</p></div>${link('编辑资料', 'editProfile')}</div>`,
        ) +
        `<div class="account-links">${[
          ['我的预约', 'appointments', '查看就诊安排'],
          ['就诊人管理', 'family', '本人及家庭成员'],
          ['病历档案', 'medical', '诊断、处方与医嘱'],
          ['评估记录', 'assessments', 'ESS 与鼾声报告'],
          ['阻鼾器管理', 'devices', '设备与调整记录'],
          ['我的订单', 'orders', '订单及配送信息'],
          ['会员权益', 'membership', '会员等级与积分'],
          ['消息通知', 'notifications', '接收服务动态'],
          ['账号安全', 'security', '修改登录密码'],
          ['在线客服', 'service', '咨询就诊与服务问题'],
        ]
          .map(
            ([t, p, d]) =>
              `<a class="pc-panel" href="#/${p}"><h3>${t}</h3><p>${d}</p></a>`,
          )
          .join('')}</div>`
      );
    }
    case 'editProfile': {
      c.profile = await get('/user/profile');
      const a = c.profile;
      return (
        head('editProfile', '', link('返回个人中心','profile')) +
        panel(
          '个人资料',
          form(
            'profile',
            `<div class="profile-heading">${image(a.avatar,a.nickname,'avatar')}${field('更换头像','avatarFile','','file','accept="image/jpeg,image/png,image/gif"')}</div>${kv([['手机号',a.phone||'未绑定'],['病历号',a.cardNo]])}`+field('身份证号（留空保留原值）','idCard','','text','pattern="[0-9]{17}[0-9Xx]" maxlength="18"')+(a.idCard?`<p>已保存：${esc(a.idCard)}</p>`:'')+field(
              '昵称',
              'nickname',
              a.nickname,
              'text',
              'required maxlength="50"',
            ) +
              field(
                '出生日期',
                'birthday',
                a.birthday || '',
                'date',
                `max="${today()}"`,
              ) +
              select(
                '性别',
                'gender',
                [
                  ['', '未设置'],
                  [1, '男'],
                  [2, '女'],
                ],
                a.gender==='male'?1:a.gender==='female'?2:a.gender,
              ) +
              submit('保存资料'),
          ),
        )
      );
    }
    case 'family': {
      c.members = list(await get('/user/family-members'));
      return (
        head(
          'family',
          '就诊资料用于预约与健康记录，请填写真实信息。',
          btn('添加就诊人', 'member'),
        ) +
        `<div class="pc-grid two">${records(
          c.members,
          (a) =>
            panel(
              a.name,
              `${badge(relation[a.relation] || a.relation)}${kv([
                ['电话', a.phone],
                ['出生日期', a.birthday],
                ['身份证', a.idCard],
                ['档案号', a.cardNo],
              ])}${link('查看与编辑', 'member', { id: a.id })}`,
            ),
          '暂无就诊人',
        )}</div>`
      );
    }
    case 'member': {
      c.member = id
        ? await get('/user/family-members/' + encodeURIComponent(id))
        : {};
      const a = c.member;
      const memberStores = list(await get('/stores'));
      if (id && a.relation === 'self')
        return (
          pageHead('就诊人详情', '', link('就诊人管理','family')) +
          panel(
            a.name,
            kv([
              ['关系', '本人'],
              ['联系电话', a.phone],
              ['出生日期', a.birthday],
              ['病历号', a.cardNo],
              ['性别',a.gender===1||a.gender==='male'?'男':a.gender===2||a.gender==='female'?'女':'未填写'],['身份证',a.idCard],['所属诊所',a.storeName],['地区',a.region],['地址',a.address],
            ]) + link('编辑本人资料', 'editProfile'),
          )
        );
      return (
        pageHead(
          id ? '编辑就诊人' : '新增就诊人',
          id ? '修改已关联就诊人的资料。' : '添加本人或家庭成员的就诊资料。', link('就诊人管理','family'),
        ) +
        panel(
          id ? '编辑就诊资料' : '新增就诊资料',
          form(
            'member',
            `<div class="profile-heading">${image(a.avatar||a.avatarUrl,a.name,'avatar')}${field('头像','avatarFile','','file','accept="image/jpeg,image/png,image/gif"')}</div>`+select('所属诊所','storeId',[['','请选择诊所'],...memberStores.map(x=>[x.id,x.name])],a.storeId||'')+field('病历号','cardNo',a.cardNo,'text','maxlength="50"')+field('姓名', 'name', a.name, 'text', 'required maxlength="50"') +
              select(
                '关系',
                'relation',
                Object.entries(relation),
                a.relation || 'other',
              ) +
              select(
                '性别',
                'gender',
                [
                  [1, '男'],
                  [2, '女'],
                ],
                a.gender==='male'?1:a.gender==='female'?2:a.gender,
              ) +
              field(
                '出生日期',
                'birthday',
                a.birthday || '',
                'date',
                `required max="${today()}"`,
              ) +
              field(
                '联系电话',
                'phone',
                a.phone,
                'tel',
                'pattern="1[3-9][0-9]{9}" maxlength="11"',
              ) +
              field(
                '身份证号码（已有号码留空则保留）',
                'idCard',
                '',
                'text',
                'pattern="[0-9]{17}[0-9Xx]" maxlength="18"',
              ) +
              (a.idCard ? `<p>已保存：${esc(a.idCard)}</p>` : '') +
              field('所在地区', 'region', a.region, 'text', 'maxlength="120"') +
              area('详细地址', 'address', a.address, 'maxlength="255"') +
              submit(id ? '保存修改' : '添加就诊人'),
          ) +
            (id && a.relation !== 'self'
              ? `<hr>${action('解除关联', 'delete-member')}`
              : ''),
        )
      );
    }
    case 'security': {
      c.security = await get('/user/account-security');
      return (
        head('security', '管理账号信息与登录密码。', link('个人中心','profile')) +
        panel(
          '登录密码',
          form(
            'password',
            field(
              '原密码（未设置密码可留空）',
              'oldPassword',
              '',
              'password',
              'autocomplete="current-password"',
            ) +
              field(
                '新密码',
                'newPassword',
                '',
                'password',
                'required minlength="6" maxlength="20" autocomplete="new-password"',
              ) +
              field(
                '确认新密码',
                'confirmPassword',
                '',
                'password',
                'required minlength="6" maxlength="20" autocomplete="new-password"',
              ) +
              submit('更新密码'),
          ),
        ) +
        panel(
          '手机号与实名认证',
          '<p>如需更换手机号或完成实名认证，请前往小程序“账号安全”。</p>',
        )
      );
    }
    case 'notifications':
      return (
        head(
          'notifications',
          '服务动态与系统通知。',
          action('全部标为已读', 'read-all'),
        ) +
        panel(
          '',
          records(
            list(await get('/user/notifications')),
            (a) =>
              `<article class="pc-list-row"><div><h3>${esc(a.title)} ${a.isRead ? '' : '<span class="badge">未读</span>'}</h3><p>${esc(a.content)}</p><small>${date(a.createdAt)}</small></div>${a.isRead ? '' : action('标为已读', 'read', `data-id="${esc(a.id)}"`)}</article>`,
            '暂无通知',
          ),
        )
      );
    case 'medical': {
      await scoped(c);
      if (!c.patientId)
        return (
          head('medical') + empty('请先添加就诊人', btn('就诊人管理', 'family'))
        );
      c.medical = list(
        await get('/user/medical-records' + query({ patientId: c.patientId })),
      );
      return (
        head('medical', '查看历次门诊诊断、治疗处方与医嘱。') +
        scopeBar(c) +
        records(
          c.medical,
          (m) =>
            panel(
              `${({first:'初诊',followup:'复诊',adjust:'调整'})[m.type]||'就诊记录'} · ${date(m.visitDate)} · ${m.storeName||m.hospital||''}`,
              medicalCard(m) +
                form(
                  'attachment',
                  hidden('recordId', m.id) +
                    field(
                      '上传病历图片',
                      'file',
                      '',
                      'file',
                      'required accept="image/jpeg,image/png,image/gif"',
                    ) +
                    submit('上传附件'),
                ),
            ),
          '暂无病历记录',
        )
      );
    }
    case 'treatment':
    case 'treatmentCalendar':
    case 'treatmentTrend':
    case 'treatmentReport':
    case 'treatmentTimeline':
    case 'treatmentAdvice':
    case 'treatmentAdjust':
      return renderTreatment(c, { scoped, scopeBar, head });
    case 'devices':
    case 'device':
    case 'wearing': {
      await scoped(c);
      if (!c.patientId)
        return (
          head(c.page) + empty('请先添加就诊人', btn('就诊人管理', 'family'))
        );
      const q = query({ patientId: c.patientId, treatmentId: id });
      let body =
        head(
          c.page,
          '查看治疗记录，持续记录佩戴与设备使用情况。',
          link('病历档案', 'medical', { patientId: c.patientId }),
        ) + scopeBar(c);
      if (c.page === 'devices') {
        const rows = list(await get('/treatment/records' + q));
        return (
          body +
          records(
            rows,
            (a) =>
              panel(
                a.deviceModel,
                `${badge(a.status)}${kv([
                  ['绑定日期', a.startDate],
                  ['当前前移量', `${a.adjustmentValue} mm`],
                  ['医生', a.doctorName],
                ])}${btn('查看设备', 'device', { id: a.id, patientId: c.patientId })}`,
              ),
            '暂无已绑定设备',
          )
        );
      }
      if (c.page === 'wearing') {
        const rows = list(await get('/treatment/wearing-records' + q));
        return (
          body +
          wearingForm(c, rows) +
          panel(
            '佩戴记录',
            records(
              rows,
              (a) =>
                `<div class="pc-list-row"><div><h3>${esc(a.date)}</h3><p>${esc(a.note)}</p></div><span>${esc(a.wearDuration)} 小时 · 疼痛 ${esc(a.painScore)} 分</span></div>`,
              '暂无佩戴记录',
            ),
          )
        );
      }
      c.device = await get('/treatment/record' + q);
      if (!c.device)
        return (
          body + empty('暂无治疗或绑定设备记录', link('预约就诊', 'stores'))
        );
      const a = c.device;
      body += panel(
        a.device?.name || a.deviceModel,
        `${kv([
          ['设备编号',a.serialNumber||a.device?.serialNumber||a.deviceProductId],
          ['下颌前移量',a.adjustmentValue==null?'—':a.adjustmentValue+' mm'],
          ['就诊人', a.patientName],
          ['医生', a.doctorName],
          ['诊断', a.diagnosis],
          ['治疗方案', a.treatmentPlan],
          ['医嘱', a.doctorAdvice],
          ['下次调整日期', a.nextAdjustDate],
        ])}<div class="pc-actions">${btn('佩戴打卡', 'wearing', { patientId: c.patientId })}${link('全部设备', 'devices', { patientId: c.patientId })}</div>`,
      );
      const [adjustments, maintenance, feedback] = await Promise.all([
        get('/treatment/adjustments' + q),
        get('/treatment/device-maintenance' + q),
        get('/treatment/device-feedback' + q),
      ]);
      return (
        body +
        panel(
          '调整记录',
          records(
            list(adjustments),
            (v) =>
              `<div class="pc-list-row"><div><h3>${esc(v.date)} · ${esc(v.value)} mm</h3><p>${esc(v.note)}</p></div><span>${esc(v.doctor)}</span></div>`,
            '暂无调整记录',
          ),
        ) +
        panel(
          '维护记录',
          records(
            list(maintenance),
            (v) =>
              `<div class="pc-list-row"><div><h3>${esc(v.date)} · ${esc(v.type)}</h3><p>${esc(v.description)}</p></div><span>${money(v.cost)}</span></div>`,
            '暂无维护记录',
          ),
        ) +
        panel(
          '使用反馈',
          records(
            list(feedback),
            (v) =>
              `<div class="comment"><p>${esc(v.content)}</p><small>${esc(v.date)}</small>${v.reply ? `<p>回复：${esc(v.reply)}</p>` : ''}</div>`,
            '暂无反馈',
          ) +
            form(
              'feedback',
              hidden('patientId', c.patientId) +
                hidden('treatmentId', a.id) +
                select('评分', 'rating', [
                  [5, '5 分'],
                  [4, '4 分'],
                  [3, '3 分'],
                  [2, '2 分'],
                  [1, '1 分'],
                ]) +
                area('反馈内容', 'content', '', 'required maxlength="1000"') +
                submit('提交反馈'),
            ),
        )
      );
    }
    case 'membership': {
      const [info, levels] = await Promise.all([
        get('/user/member-info'),
        get('/user/member-levels'),
      ]);
      return (
        head('membership', '会员等级由实际消费及现行规则计算。') +
        panel(
          '我的会员',
          kv([
            [
              '当前等级',
              list(levels).find((l) => l.level === info.memberLevel)?.title ||
                info.memberLevel,
            ],
            ['积分', info.points],
            ['累计消费', money(info.totalSpent)],
          ]),
        ) +
        panel(
          '等级权益',
          records(
            list(levels),
            (l) =>
              `<article class="pc-list-row"><div><h3>${esc(l.title || l.name || l.level)}</h3><p>累计消费满 ${money(l.spentRequired)} · ${esc((l.benefits || []).map((b) => b.title + '：' + b.desc).join('；'))}</p></div><span>${l.discountRate != null ? `${Number(l.discountRate) * 10} 折` : ''}</span></article>`,
            '暂无等级规则',
          ),
        )
      );
    }
    case 'service': {
      const messages = list(await get('/im/messages'));
      return (
        head(
          'service',
          '发送咨询内容，客服回复后可刷新查看。',
          action('刷新消息', 'retry'),
        ) +
        panel(
          '',
          `<div class="messages">${records(messages, (a) => `<article class="message ${a.sender === 'patient' ? 'mine' : ''}"><small>${esc(a.senderName || '客服')} · ${esc(a.time)}</small><p>${esc(a.text)}</p></article>`, '暂无消息')}</div>${form('message', area('咨询内容', 'text', '', 'required maxlength="1000"') + submit('发送消息'))}`,
        )
      );
    }
    default:
      return head('home') + empty('页面不存在', btn('返回首页', 'home'));
  }
}
function medicalCard(m) {
  return (
    kv([
      ['就诊人', m.patientName],
      ['医生', m.doctorName],
      ['诊断', m.diagnosis],
      ['治疗处方', m.prescription],
      ['医嘱', m.doctorAdvice],
      ['备注', m.note],
    ]) +
    `<div class="attachments">${(m.attachments || [])
      .map((a) => {
        const u = safeUrl(typeof a === 'string' ? a : a.url);
        return u
          ? `<a target="_blank" rel="noopener noreferrer" href="${esc(u)}">${image(u, '病历附件')}</a>`
          : '';
      })
      .join('')}</div>`
  );
}
export function reportCard(a, questions = []) {
  return a.type === 'ess' ? essReport(a, questions) : snoreReport(a);
}
export { productCard, postCard };
