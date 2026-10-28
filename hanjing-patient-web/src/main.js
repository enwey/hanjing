import {createCheckoutDialog} from './checkout-dialog.js';
import './checkout-dialog.css';
import {updatePendingForm,uploadPendingImage} from './pending-interactions.js';
import './pending-pages.css';
import './ess-report.css';
import {setRecordingPhase,updateRecordingLevel} from './recording-page.js';
import './recording.css';
import {appointmentList} from './appointment-list.js';
import {appointmentActions} from './appointment-detail.js';
import {createDoctorBooking} from './doctor-booking.js';
import './clinic.css';
import './shop.css';
import { createWearingDrawer } from './wearing-drawer.js';
import './wearing-drawer.css';
import { comfortFromPain } from './treatment.js';
import { localMockLogin } from './local-login.js';
import './styles/pc-redesign.css';
import './styles/pc-consumer.css';
import './styles/pc-halcyon.css';
import './style.css';
import './home-refinement.css';
import './header.css';
import './home-motion.css';
import './pages-layout.css';
import './treatment.css';
import './navigation-motion.css';
import './product-images.css';
import './account-pages.css';
import { animateNavigation, revealContent } from './navigation-motion.js';
import { setupHome } from './home-interactions.js';
import { session, request, list, query, post, put } from './api.js';
import {
  esc,
  link,
  btn,
  action,
  empty,
  errors,
  panel,
  kv,
  href,
  money,
  safeUrl,
  select,
} from './ui.js';
import { page, titles, publicPages, postCard, productCard } from './pages.js';
import { home, homeDoctors, homePosts } from './home.js';
import { Recorder } from './recorder.js';

const root = document.querySelector('#root');
let current,
  controller,
  sequence = 0,
  toastTimer,
  recorder = null,
  loginBinding = false,
  authSubmitting = false;
const notify = (text) => {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
};
const wearingDrawer = createWearingDrawer({
  request, post, session,
  getPatientId: () => current?.patientId || current?.params.get('patientId') || '',
  onSaved: async () => {
    const hash = location.hash, top = window.scrollY;
    notify('打卡成功');
    await render();
    if (location.hash === hash) window.scrollTo(0, top);
  },
});
const doctorBooking=createDoctorBooking({getCurrent:()=>current,request,session});
const checkoutDialog=createCheckoutDialog({getCurrent:()=>current,session,updateDelivery,load:async c=>{const checkout={...c,page:'checkout',params:new URLSearchParams({id:c.product.id})};const html=await page(checkout);return {html,product:checkout.product,stores:checkout.stores};}});
function navigate(page, params = {}) {
  const url = href(page, params);
  if (location.hash === url) render();
  else location.hash = url;
}
function route() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, search = ''] = raw.split('?');
  return { page: name, params: new URLSearchParams(search) };
}
function nextRoute() {
  const next = sessionStorage.getItem('pc-login-return') || '#/profile';
  sessionStorage.removeItem('pc-login-return');
  return /^#\/[A-Za-z]+(?:\?[^#]*)?$/.test(next) && next !== '#/login'
    ? next
    : '#/profile';
}
function requireLogin() {
  if (session.token()) return true;
  sessionStorage.setItem('pc-login-return', location.hash || '#/profile');
  navigate('login');
  notify('请先登录患者账号');
  return false;
}
function shell(content, isHome = false) {
  const nav = [
    ['首页', 'home'],
    ['睡眠评估', 'assessment'],
    ['治疗追踪', 'treatment'],
    ['社区', 'community'],
    ['健康商城', 'products'],
  ];
  const groups = {
    assessment: ['questionnaire', 'recording', 'assessments', 'report'],
    treatment: ['devices', 'device', 'wearing', 'treatmentCalendar', 'treatmentTrend', 'treatmentReport', 'treatmentTimeline', 'treatmentAdvice', 'treatmentAdjust'],
    community: ['post', 'publish'],
    products: ['product', 'checkout', 'orders', 'order'],
  };
  return `<div class="app ${isHome ? 'is-home' : ''}"><header class="app-header hc-header"><a class="brand" href="#/home" aria-label="兴康明首页"><img src="/brand/logo.svg" alt=""><span>兴康明<small>专注睡眠呼吸健康</small></span></a><nav class="top-nav" aria-label="网站导航">${nav.map(([t, p]) => `<a href="#/${p}" ${current.page === p || groups[p]?.includes(current.page) ? 'class="current" aria-current="page"' : ''}>${t}</a>`).join('')}</nav><div class="header-user">${session.token() ? link('个人中心', 'profile', {}, 'text-button') + `<button data-action="logout">退出</button>` : link('登录', 'login', {}, 'text-button')}<a class="btn small hc-header-book" href="#/stores">预约就诊</a></div></header><main id="content" class="${isHome ? '' : 'pc-content hc-wrap'}" tabindex="-1">${content}</main>${footer()}</div>`;
}
async function render() {
  wearingDrawer.close({force:true,restoreFocus:false});
  doctorBooking.close(true);
  checkoutDialog.close(true);
  if (['live', 'room'].includes(route().page)) history.replaceState(null, '', href('community'));
  if (['coupons','distribution','team','commissions','withdraws','withdraw'].includes(route().page)) history.replaceState(null, '', href('profile'));
  const requested = route();
  const checkoutRoute=requested.page==='checkout';
  if(checkoutRoute){if(!session.token()){requireLogin();return;}history.replaceState(null,'',href('product',{id:requested.params.get('id')||''}));}
  if(requested.page==='booking'&&!requested.params.get('id')&&requested.params.get('storeId')&&requested.params.get('doctorId'))history.replaceState(null,'',href('doctors',{id:requested.params.get('doctorId'),storeId:requested.params.get('storeId')}));
  const drawerRoute = requested.page === 'wearing' && !!session.token();
  if (drawerRoute) history.replaceState(null, '', href('treatment', {patientId:requested.params.get('patientId') || ''}));
  const preserveView = current?.page === requested.page && current?.params.get('id') === requested.params.get('id') && current?.token === session.token() && !!root.querySelector('#content') && requested.page !== 'home';
  const generation = ++sequence;
  controller?.abort();
  controller = new AbortController();
  recorder?.dispose();
  recorder = null;
  current = {
    ...(preserveView ? current : {}),
    ...route(),
    viewHash: location.hash,
    generation,
    token: session.token(),
    signal: controller.signal,
  };
  const c = current;
  c.get = (path) => request(path, { signal: c.signal, token: c.token });
  document.title = (titles[c.page] || '页面不存在') + ' · 兴康明';
  if (!publicPages.has(c.page) && !session.token()) {
    requireLogin();
    return;
  }
  if (c.page === 'login' && session.token() && !loginBinding) {
    navigate('profile');
    return;
  }
  if (!preserveView) {
  const nextShell = shell(
    c.page === 'home'
      ? home()
      : '<div class="loading-state" role="status">正在加载…</div>',
    c.page === 'home',
  );
  const existingHeader = root.querySelector('.hc-header');
  if (existingHeader) {
    const template = document.createElement('template');
    template.innerHTML = nextShell;
    const nextHeader = template.content.querySelector('.hc-header');
    const nextLinks = nextHeader.querySelectorAll('.top-nav a');
    existingHeader.querySelectorAll('.top-nav a').forEach((link, i) => {
      const selected = nextLinks[i].classList.contains('current');
      link.classList.toggle('current', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const user = existingHeader.querySelector('.header-user');
    const nextUser = nextHeader.querySelector('.header-user');
    if (user.innerHTML !== nextUser.innerHTML) user.innerHTML = nextUser.innerHTML;
    const app = root.querySelector('.app');
    app.className = template.content.querySelector('.app').className;
    root.querySelector('#content').replaceWith(template.content.querySelector('#content'));
  } else root.innerHTML = nextShell;
  window.scrollTo(0, 0);
  animateNavigation();
  }
  if (c.page === 'home') {
    setupHome(document.getElementById('content'), c.signal);
    for (const [path, id, draw] of [
      ['/doctors', 'home-doctors', homeDoctors],
      ['/community/posts', 'home-posts', homePosts],
    ]) {
      c.get(path)
        .then((data) => {
          if (current === c)
            document.getElementById(id).innerHTML = draw(list(data));
        })
        .catch((e) => {
          if (current === c && e.name !== 'AbortError')
            document.getElementById(id).innerHTML = errors(e.message);
        });
    }
    return;
  }
  try {
    const html = await page(c);
    if (current !== c) return;
    const scroll = {x:window.scrollX,y:window.scrollY};
    document.getElementById('content').innerHTML = html;
    if (preserveView) window.scrollTo(scroll.x, scroll.y);
    else revealContent(document.getElementById('content'));
    if(checkoutRoute)await checkoutDialog.open(c);
    if (drawerRoute) wearingDrawer.open({patientId:c.patientId || requested.params.get('patientId') || '',date:requested.params.get('date') || undefined});
    if (c.page === 'login' && loginBinding)
      document.querySelector('#wechat-message').textContent =
        '微信授权已完成，请先使用密码登录已有患者账号，再确认关联。';
  } catch (error) {
    if (current !== c || error.name === 'AbortError') return;
    if (preserveView) notify(error.message);
    else document.getElementById('content').innerHTML = errors(error.message);
  }
}
function active(c) {
  return current === c && session.token() === c.token;
}
function ensureAuth(c) {
  if (!requireLogin()) return false;
  if (c.token !== session.token()) {
    notify('登录状态已变化，请重新操作');
    render();
    return false;
  }
  return true;
}
// Preserve unknown create outcomes across reloads. No automatic repeat POST.
const pendingKey = (c, type) => 'pc-pending:' + type + ':' + c.token;
async function createOnce(c, type, path, data) {
  const key = pendingKey(c, type);
  if (sessionStorage.getItem(key))
    throw new Error(
      `上一次提交结果未确认，请先查看${type === 'booking' ? '我的预约' : '我的订单'}，确认后再创建。`,
    );
  sessionStorage.setItem(key, JSON.stringify({ at: Date.now() }));
  try {
    const result = await post(path, data);
    sessionStorage.removeItem(key);
    return result;
  } catch (e) {
    if (e.status >= 400 && e.status < 500) sessionStorage.removeItem(key);
    throw e;
  }
}
async function confirmDialog(title, message, confirmText = '确认') {
  const dialog = document.createElement('dialog');
  dialog.className = 'pc-dialog';
  dialog.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="prewrap">${esc(message)}</p><div class="pc-actions"><button value="cancel" class="btn secondary">取消</button><button value="ok" class="btn">${esc(confirmText)}</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      'close',
      () => {
        const ok = dialog.returnValue === 'ok';
        dialog.remove();
        resolve(ok);
      },
      { once: true },
    ),
  );
}
async function promptDialog(title, label, max = 500) {
  const d = document.createElement('dialog');
  d.className = 'pc-dialog';
  d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><textarea name="answer" required maxlength="${max}" rows="4" placeholder="${esc(label)}，最多${max}字"></textarea></label><div class="pc-actions"><button value="cancel" formnovalidate class="btn secondary">取消</button><button value="ok" class="btn">确认</button></div></form>`;
  document.body.append(d);
  d.showModal();
  return new Promise((resolve) =>
    d.addEventListener(
      'close',
      () => {
        const value =
          d.returnValue === 'ok'
            ? d.querySelector('textarea').value.trim()
            : null;
        d.remove();
        resolve(value);
      },
      { once: true },
    ),
  );
}
document.addEventListener('submit', async (event) => {
  const f = event.target.closest('[data-form]');
  if (!f) return;
  event.preventDefault();
  if (f.dataset.busy === 'true' || !f.reportValidity()) return;
  const c = current,
    type = f.dataset.form;
  if (type !== 'login' && !ensureAuth(c)) return;
  if (type === 'login' && authSubmitting) return;
  if (type === 'login') authSubmitting = true;
  const data = Object.fromEntries(new FormData(f));
  const message = f.querySelector('.form-message');
  message.textContent = '';
  f.dataset.busy = 'true';
  const controls = [...f.elements];
  controls.forEach((e) => (e.disabled = true));
  try {
    switch (type) {
      case 'login': {
        const result = await post('/auth/password-login', {
          phone: data.phone.trim(),
          password: data.password,
        });
        if (current !== c) return;
        session.save(result.access_token);
        if (loginBinding) {
          const ok = await confirmDialog(
            '关联微信',
            '将刚才扫码的微信关联到当前患者账号？不会合并其他患者账号。',
            '确认关联',
          );
          if (ok) {
            await post('/pc/auth/wechat/bind', { confirm: true });
            notify('微信已关联');
          } else notify('已登录，未关联微信');
          loginBinding = false;
        }
        location.hash = nextRoute();
        break;
      }
      case 'booking': {
        const schedule = c.schedules.find(
            (s) => String(s.id) === data.scheduleId,
          ),
          slot = c.slots.find(
            (s) => s.label === data.appointmentTime && s.status === 'available',
          );
        if (
          !schedule ||
          !slot ||
          String(slot.scheduleId) !== String(schedule.id)
        )
          throw new Error('请选择有效的就诊时段');
        const payload = {
          doctorId: c.doctorId,
          storeId: c.storeId,
          scheduleId: schedule.id,
          appointmentDate: schedule.date,
          appointmentTime: slot.label,
          patientId: data.patientId,
          // Match the mini-program: ordinary booking defaults to first; rescheduling preserves its type.
          type: c.reschedule?.type || 'first',
          symptomDesc: data.symptomDesc || '',
        };
        const referral = sessionStorage.getItem('pc-referral');
        if (referral) payload.referralCode = referral;
        const result = c.reschedule
          ? await post(
              '/appointments/' + c.reschedule.id + '/reschedule',
              payload,
            )
          : await createOnce(c, 'booking', '/appointments', payload);
        if (active(c)) {
          notify('预约已提交，状态以预约详情为准');
          navigate('appointment', { id: c.reschedule?.id || result.id });
        }
        break;
      }
      case 'ess': {
        const answers = Array.from({ length: 8 }, (_, i) =>
          Number(data['answer' + i]),
        );
        const r = await post('/assessments/ess', {
          patientId: data.patientId,
          answers,
        });
        if (active(c))
          navigate('report', { id: r.id, patientId: data.patientId });
        break;
      }
      case 'publish': {
        const tags = [...f.querySelectorAll('[data-publish-tag]:checked')].map(x=>x.value);
        if(tags.length>3)throw Error('最多选择3个标签');
        const r = await post('/community/posts', {
          title: data.title.trim(),
          content: data.content.trim(),
          tags: [data.category,...tags],
        });
        if (active(c)) navigate('post', { id: r.id });
        break;
      }
      case 'comment':
        await post('/community/posts/' + c.post.id + '/comment', {
          content: data.content.trim(),
          parentId: data.parentId || null,
        });
        if (active(c)) {
          notify('评论已提交');
          render();
        }
        break;
      case 'order': {
        const quantity = Number(data.quantity);
        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > Math.min(99, c.product.stock)
        )
          throw new Error('商品数量超出库存');
        const store = c.stores.find((v) => String(v.id) === data.storeId);
        const shippingAddress = {
          deliveryMethod: data.deliveryMethod,
          contactName: data.contactName.trim(),
          phone: data.phone,
          detailAddress: data.detailAddress.trim(),
          ...(data.deliveryMethod === 'pickup'
            ? { storeId: data.storeId, storeName: store?.name || '' }
            : {}),
        };
        const result = await createOnce(c, 'order', '/orders', {
          items: [{ productId: c.product.id, quantity }],
          shippingAddress,
          ...(data.couponId ? { couponId: data.couponId } : {}),
        });
        if (active(c)) navigate('order', { id: result.id });
        break;
      }
      case 'profile': {
        const avatar = data.avatarFile?.size ? await uploadPendingImage(data.avatarFile,c) : undefined;
        if(!active(c))return;
        await put('/user/profile', {
          nickname: data.nickname.trim(),
          ...(avatar ? {avatar} : {}),
          ...(data.idCard?.trim() ? {idCard:data.idCard.trim()} : {}),
          birthday: data.birthday,
          gender: data.gender === '' ? null : Number(data.gender),
        });
        if (active(c)) {
          notify('资料已保存');
          navigate('profile');
        }
        break;
      }
      case 'member': {
        const payload = {
          ...data,
          name: data.name.trim(),
          gender: Number(data.gender),
        };
        if(data.avatarFile?.size){payload.avatar=await uploadPendingImage(data.avatarFile,c);if(!active(c))return;}
        delete payload.avatarFile;
        // Existing PUT treats an omitted identity as null: preserve the full identity
        // returned by the authorized detail API when the user leaves this field blank.
        if (!payload.idCard) payload.idCard = c.member.idCard || '';
        if (c.member.id)
          await put('/user/family-members/' + c.member.id, payload);
        else await post('/user/family-members', payload);
        if (active(c)) {
          notify('就诊人资料已保存');
          navigate('family');
        }
        break;
      }
      case 'password':
        if (data.newPassword !== data.confirmPassword)
          throw new Error('两次输入的新密码不一致');
        await put('/user/password', data);
        if (active(c)) {
          notify('密码已更新');
          f.reset();
        }
        break;
      case 'evaluation':
        await post('/appointments/' + c.appointment.id + '/evaluation', {
          rating: Number(data.rating),
          content: data.content,
        });
        if (active(c)) {notify('评价已提交');render();}
        break;
      case 'wearing':
        await post('/treatment/wearing', {
          ...data,
          wearDuration: Number(data.wearDuration),
          comfort: comfortFromPain(data.painScore),
          painScore: Number(data.painScore),
          painLocations: [...f.querySelectorAll('[name="painLocations"]:checked')].map(input => input.value),
        });
        if (active(c)) {
          notify('佩戴记录已保存');
          render();
        }
        break;
      case 'feedback':
        await post('/treatment/feedback', {
          ...data,
          rating: Number(data.rating),
        });
        if (active(c)) {
          notify('反馈已提交');
          render();
        }
        break;
      case 'message': {
        const text=data.text.trim();
        if(!text&&!data.messageFile?.size)throw Error('请输入内容或选择图片');
        if(text&&data.messageFile?.size)throw Error('请分别发送文字和图片');
        const url=data.messageFile?.size?await uploadPendingImage(data.messageFile,c):'';
        if(!active(c))return;
        await post('/im/send',{text:url?'[image]'+url:text});
        if(active(c))render();
        break;
      }
      case 'attachment': {
        const file = data.file;
        if (
          !(file instanceof File) ||
          !['image/jpeg', 'image/png', 'image/gif'].includes(file.type) ||
          file.size > 8 * 1024 * 1024
        )
          throw new Error('请选择 8 MB 以内的 JPG、PNG 或 GIF 图片');
        const ext = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
        }[file.type];
        const res = await fetch('/api/v1/user/upload?ext=' + ext, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + c.token,
            'Content-Type': 'application/octet-stream',
          },
          body: file,
        });
        const result = await res.json();
        if (!res.ok || ![0, 200].includes(result.code))
          throw new Error(result.message || '上传失败');
        if (!active(c)) return;
        await post('/user/medical-records/' + data.recordId + '/attachments', {
          url: result.data.url,
        });
        if (active(c)) {
          notify('附件已上传');
          render();
        }
        break;
      }

    }
  } catch (error) {
    if (current === c) {
      message.textContent = error.message;
      if (type === 'login' && session.token()) {
        loginBinding = false;
        message.textContent += '；密码登录已成功，可前往个人中心。';
        message.insertAdjacentHTML('beforeend', link('个人中心', 'profile'));
      }
    }
  } finally {
    if (type === 'login') authSubmitting = false;
    f.dataset.busy = 'false';
    controls.forEach((e) => (e.disabled = false));
    if (type === 'order') updateDelivery(f);
  }
});
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const c = current,
    name = button.dataset.action;
  if (name === 'retry') {
    render();
    return;
  }
  if (name === 'logout') {
    session.clear();
    loginBinding = false;
    recorder?.dispose();
    navigate('home');
    return;
  }
  if (name === 'login-mode') {
    const wx = button.dataset.mode === 'wechat';
    document.querySelector('#password-login').hidden = wx;
    document.querySelector('#wechat-login').hidden = !wx;
    document
      .querySelectorAll('[data-action="login-mode"]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    revealContent(document.querySelector(wx ? '#wechat-login' : '#password-login'));
    return;
  }
  const isAuthAction = name === 'local-login' || name === 'wechat-start';
  if (isAuthAction && authSubmitting) return;
  if (isAuthAction) authSubmitting = true;
  button.disabled = true;
  try {
    if (name === 'local-login') {
      if (loginBinding) throw new Error('请先使用密码登录完成微信关联');
      const ok = await localMockLogin({ post, session, isActive: () => current === c });
      if (ok) { notify('本地模拟登录成功'); location.hash = nextRoute(); }
      return;
    }
    if (name === 'wechat-start') {
      sessionStorage.setItem(
        'pc-login-return',
        sessionStorage.getItem('pc-login-return') || '#/profile',
      );
      const r = await post('/pc/auth/wechat/start');
      const url = new URL(r.authorizeUrl);
      if (
        url.origin !== 'https://open.weixin.qq.com' ||
        url.pathname !== '/connect/qrconnect'
      )
        throw new Error('微信登录地址无效');
      if (current === c) location.assign(url.href);
      return;
    }
    if (name === 'product-gallery') {
      const cover=document.querySelector('.shop-cover-detail');
      if(cover && safeUrl(button.dataset.src)) {
        let img=cover.querySelector('img');
        if(!img){img=document.createElement('img');img.setAttribute('data-product-cover','');img.alt='商品图片';cover.append(img);}
        img.src=safeUrl(button.dataset.src);
      }
      document.querySelectorAll('[data-action="product-gallery"]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
      return;
    }
    if(name==='checkout-open'){
      if(!session.token()){sessionStorage.setItem('pc-login-return',href('checkout',{id:c.product.id}));navigate('login');return;}
      if(ensureAuth(c))await checkoutDialog.open(c);return;
    }
    if (!ensureAuth(c)) return;
    switch (name) {
      case 'appointment-tab':
        c.appointmentTab=button.dataset.tab==='history'?'history':'upcoming';
        document.querySelector('#appointment-list').innerHTML=appointmentList(c);
        history.replaceState(null,'','#/appointments'+(c.appointmentTab==='history'?'?tab=history':''));
        break;
      case 'appointment-copy':
        await navigator.clipboard.writeText(c.appointment.appointmentNo);
        if(active(c))notify('预约单号已复制');
        break;
      case 'doctor-book':
        await doctorBooking.open(c);
        break;
      case 'cancel-appointment': {
        const appointment=button.dataset.appointmentId?c.appointments?.find(a=>String(a.id)===button.dataset.appointmentId):c.appointment;
        if(!appointment)throw new Error('预约记录不存在，请刷新后重试');
        if (!appointmentActions(appointment,c.bookingSettings).canCancel) throw new Error('已超过取消截止时间，请联系门店处理');
        const confirmed = await confirmDialog('取消预约', '确定要取消这次预约吗？', '确认取消预约');
        if (confirmed && active(c)) {
          if (!appointmentActions(appointment,c.bookingSettings).canCancel) throw new Error('已超过取消截止时间，请联系门店处理');
          await post('/appointments/' + appointment.id + '/cancel', {
            reason: '用户主动取消',
          });
          if (active(c)) { notify('预约已取消'); await render(); }
        }
        break;
      }
      case 'post-like':
        await post('/community/posts/' + c.post.id + '/like', {
          isLiked: !c.post.isLiked,
        });
        if (active(c)) {
          c.post.likes = Math.max(0, Number(c.post.likes || 0) + (c.post.isLiked ? -1 : 1));
          c.post.isLiked = !c.post.isLiked;
          button.textContent = `${c.post.isLiked ? '已点赞' : '点赞'} · ${c.post.likes}`;
        }
        break;
      case 'post-favorite':
        await post('/community/posts/' + c.post.id + '/favorite', {
          isFavorited: !c.post.isFavorited,
        });
        if (active(c)) {
          c.post.favoritesCount = Math.max(0, Number(c.post.favoritesCount || 0) + (c.post.isFavorited ? -1 : 1));
          c.post.isFavorited = !c.post.isFavorited;
          button.textContent = `${c.post.isFavorited ? '已收藏' : '收藏'} · ${c.post.favoritesCount}`;
        }
        break;
      case 'post-share':
        await navigator.clipboard.writeText(location.href);
        if (!active(c)) break;
        await post('/community/posts/' + c.post.id + '/share');
        if (active(c)) notify('链接已复制');
        break;
      case 'post-report': {
        const reason = await promptDialog('举报内容', '请说明举报原因');
        if (reason && active(c)) {
          await post('/community/posts/' + c.post.id + '/report', { reason });
          if (active(c)) notify('举报已提交');
        }
        break;
      }
      case 'comment-like': {
        const comment = c.post.comments.find(
          (m) => String(m.id) === button.dataset.id,
        );
        if (!comment) throw new Error('评论不存在');
        await post('/community/comments/' + comment.id + '/like', {
          isLiked: !comment.isLiked,
        });
        if (active(c)) {
          comment.likes = Math.max(0, Number(comment.likes || 0) + (comment.isLiked ? -1 : 1));
          comment.isLiked = !comment.isLiked;
          button.textContent = `${comment.isLiked ? '已点赞' : '点赞'} · ${comment.likes}`;
        }
        break;
      }
      case 'comment-reply': {
        const comment = c.post.comments.find(
          (m) => String(m.id) === button.dataset.id,
        );
        document.querySelector('[name="parentId"]').value = comment.id;
        document.querySelector('#reply-label').textContent =
          '回复 ' + comment.author;
        document.querySelector('[name="content"]').focus();
        break;
      }
      case 'cancel-order':
      case 'receive-order':
      case 'refund-order': {
        const suffix = {
          'cancel-order': 'cancel',
          'receive-order': 'confirm-receipt',
          'refund-order': 'refund',
        }[name];
        let data = {};
        if (name === 'refund-order') {
          const reason = await promptDialog('申请退款', '请说明退款原因');
          if (!reason) return;
          data = { reason };
        } else if (
          !(await confirmDialog(
            button.textContent,
            `确认${button.textContent}？`,
          ))
        )
          return;
        if (!active(c)) return;
        await post('/orders/' + c.order.id + '/' + suffix, data);
        if (active(c)) {
          notify('操作已提交');
          render();
        }
        break;
      }
      case 'logistics': {
        const r = await c.get('/orders/' + c.order.id + '/logistics');
        if (active(c))
          document.querySelector('#logistics').innerHTML = panel(
            '物流信息',
            kv([
              ['承运公司', r.company],
              ['运单号', r.trackingNumber],
            ]) +
              `<p>${esc(r.message === '尚未接入物流轨迹服务，请凭运单号向承运方查询' ? '暂无物流轨迹，请凭运单号向承运方查询' : r.message || '')}</p>` +
              (r.steps || [])
                .map(
                  (t) =>
                    `<p>${esc(t.time)} ${esc(t.description || t.context)}</p>`,
                )
                .join(''),
          );
        break;
      }
      case 'delete-member':
        if (
          (await confirmDialog(
            '移除就诊人',
            '确认移除此就诊人？移除后将无法在当前账号中查看其就诊记录。',
          )) &&
          active(c)
        ) {
          await request('/user/family-members/' + c.member.id, {
            method: 'DELETE',
          });
          if (active(c)) navigate('family');
        }
        break;
      case 'read-all':
        await post('/user/notifications/read-all');
        if (active(c)) render();
        break;
      case 'read':
        await post('/user/notifications/' + button.dataset.id + '/read');
        if (active(c)) render();
        break;
      case 'record-start':
        await startRecording(c);
        break;
      case 'record-pause':
        await recorder?.pause();
        if(active(c)){setRecordingPhase('paused');document.querySelector('#record-status').textContent='录音已暂停，可生成分析报告';}
        break;
      case 'record-resume':
        await recorder?.resume();
        if(active(c)){setRecordingPhase('recording');document.querySelector('#record-status').textContent='正在录音，请保持页面在前台';}
        break;
      case 'record-stop':
        await stopRecording(c);
        break;
      case 'record-save': {
        await generateSnoreReport(c);
        break;
      }
      case 'acknowledge-create':
        if (
          (await confirmDialog(
            '确认已核对记录',
            '只有确认上一次没有创建成功，才应允许重新提交。确认已查看现有记录？',
          )) &&
          active(c)
        ) {
          sessionStorage.removeItem(pendingKey(c, button.dataset.type));
          render();
        }
        break;
    }
  } catch (error) {
    if (current === c) notify(error.message);
  } finally {
    if (isAuthAction) authSubmitting = false;
    if (name !== 'record-stop') button.disabled = false;
  }
});
document.addEventListener('click', event => {
  const button=event.target.closest('[data-patient-option]');
  if(!button)return;
  const bar=button.closest('.patient-options-bar'),select=bar.querySelector('[data-patient-select]');
  if(select.disabled||select.value===button.dataset.patientOption)return;
  select.value=button.dataset.patientOption;
  bar.querySelectorAll('[data-patient-option]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
  select.dispatchEvent(new Event('change',{bubbles:true}));
});
function disablePatientChoice(select, disabled) {
  if(!select)return;
  select.disabled=disabled;
  select.closest('.patient-options-bar')?.querySelectorAll('[data-patient-option]').forEach(x=>x.disabled=disabled);
}

document.addEventListener('change', async (event) => {
  const target = event.target,
    c = current;
  if (target.matches('[data-schedule-select]')) {
    const value = target.value;
    c.slots = [];
    const container = document.querySelector('#booking-slots');
    container.textContent = value ? '正在加载时段…' : '请选择排班';
    if (!value) return;
    try {
      const slots = list(
        await c.get('/schedules/' + encodeURIComponent(value) + '/slots'),
      );
      if (current !== c || target.value !== value) return;
      c.slots = slots;
      container.innerHTML = slots.length
        ? slots
            .map(
              (s) =>
                `<label class="slot ${s.status !== 'available' ? 'unavailable' : ''}"><input required type="radio" name="appointmentTime" value="${esc(s.label)}" ${s.status !== 'available' ? 'disabled' : ''}><span>${esc(s.label)}${s.status === 'available' ? '' : ' · 不可约'}</span></label>`,
            )
            .join('')
        : empty('暂无可预约时段');
    } catch (e) {
      if (current === c && target.value === value)
        container.innerHTML = errors(e.message);
    }
  }
  if (target.matches('[data-patient-select]')) {
    if(target.closest('.clinic-confirm-dialog'))return;
    if (c.page === 'questionnaire') {
      document
        .querySelectorAll('.question input')
        .forEach((e) => (e.checked = false));
      return;
    }
    if (c.page === 'recording') {
      c.recordPayload = null;
      setRecordingPhase('ready');
      document.querySelector('#record-time').textContent='00:00';
      document.querySelector('#record-level').textContent='—';
      document.querySelector('#record-peak').textContent='—';
      document.querySelector('#record-progress').value=0;
      document.querySelectorAll('.snore-wave i').forEach(bar=>bar.style.setProperty('--level','6px'));
      document.querySelector('[data-action="record-save"]').hidden = true;
      document.querySelector('#record-result').innerHTML = '';
      document.querySelector('#record-status').textContent =
        '就诊人已切换，请重新录音。';
      return;
    }
    if (c.page === 'booking') return;
    navigate(c.page, { ...Object.fromEntries(c.params), patientId: target.value });
  }
  const pendingMessage=updatePendingForm(target,c);if(pendingMessage)notify(pendingMessage);
  if (target.matches('[data-delivery-method]')) updateDelivery(target.form);
  if (target.matches('[data-product-category]')) filterProducts();
});
document.addEventListener('input', (event) => {
  const pendingMessage=updatePendingForm(event.target,current);if(pendingMessage)notify(pendingMessage);
  if (event.target.dataset.search === 'posts') {
    filterPosts();
  }
  if (event.target.dataset.search === 'products') filterProducts();
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-browse-product], [data-browse-post]');
  if (!button) return;
  button.parentElement.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed',String(item===button)));
  if (button.hasAttribute('data-browse-product')) filterProducts();
  else filterPosts();
});
function filterPosts() {
  const term = (document.querySelector('[data-search="posts"]')?.value || '').toLowerCase();
  const category = document.querySelector('[data-browse-post][aria-pressed="true"]')?.dataset.browsePost;
  document.querySelector('#search-results').innerHTML = current.posts.filter(p =>
    (!category || (Array.isArray(p.tags) && p.tags.includes(category))) &&
    (p.title+' '+p.content).toLowerCase().includes(term)
  ).map(postCard).join('') || empty('没有找到相关内容');
}
function filterProducts() {
  const term = (
      document.querySelector('[data-search="products"]')?.value || ''
    ).toLowerCase(),
    category = document.querySelector('[data-browse-product][aria-pressed="true"]')?.dataset.browseProduct;
  document.querySelector('#search-results').innerHTML =
    current.products
      .filter(
        (p) =>
          (!category || p.category === category) &&
          (p.name + ' ' + p.description).toLowerCase().includes(term),
      )
      .map(productCard)
      .join('') || empty('没有找到相关商品');
}
function updateDelivery(f) {
  const pickup = f.elements.deliveryMethod.value === 'pickup';
  f.querySelector('#shipping-fields').hidden = pickup;
  f.querySelector('#pickup-fields').hidden = !pickup;
  f.elements.detailAddress.required = !pickup;
  f.elements.storeId.required = pickup;
}
async function startRecording(c) {
  const member = document.querySelector('[name="patientId"]');
  if (!member.value) throw new Error('请先选择就诊人');
  const patientId = member.value;
  recorder?.dispose();
  c.recordPayload = null;
  c.recordPeak=0;
  document.querySelector('#record-time').textContent='00:00';
  document.querySelector('#record-level').textContent='—';
  document.querySelector('#record-peak').textContent='—';
  document.querySelectorAll('.snore-wave i').forEach(bar=>bar.style.setProperty('--level','6px'));
  document.querySelector('#record-result').innerHTML = '';
  const instance = new Recorder(({ seconds, decibel, audioLevels, error }) => {
    if (current !== c) return;
    if (error) {
      setRecordingPhase('error');
      document.querySelector('#record-status').textContent = error;
      document.querySelector('[data-action="record-start"]').hidden = false;
      document.querySelector('[data-action="record-stop"]').disabled = true;
      disablePatientChoice(member,false);
      return;
    }
    document.querySelector('#record-time').textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    c.recordPeak=Math.max(c.recordPeak,decibel);
    updateRecordingLevel(decibel,c.recordPeak,audioLevels);
    if (seconds >= 600) stopRecording(c).catch((e) => notify(e.message));
  });
  recorder = instance;
  disablePatientChoice(member,true);
  document.querySelector('#record-status').textContent='正在请求麦克风权限…';
  try { await instance.start(); } catch(error) {
    if(current===c){disablePatientChoice(member,false);setRecordingPhase('error');document.querySelector('#record-status').textContent=error.message;}
    throw error;
  }
  if (current !== c) {
    instance.dispose();
    return;
  }
  c.recordPatient = patientId;
  setRecordingPhase('recording');
  disablePatientChoice(member,true);
  document.querySelector('[data-action="record-start"]').hidden = true;
  document.querySelector('[data-action="record-save"]').hidden = true;
  document.querySelector('#record-status').textContent =
    '正在录音，请保持页面在前台。';
}
async function stopRecording(c) {
  if (!recorder || recorder.stopping) return;
  if(Math.floor(recorder.length/(recorder.context?.sampleRate||8000))<5)
    throw new Error('录音时间过短，分析前请至少录制5秒');
  const instance = recorder;
  document.querySelector('[data-action="record-stop"]').disabled = true;
  setRecordingPhase('analyzing');
  document.querySelector('#record-status').textContent = '正在分析录音…';
  try {
    const r = await instance.stop();
    if (current !== c) return;
    c.recordPayload = {
      patientId: c.recordPatient,
      duration: r.duration,
      localId: crypto.randomUUID(),
      client_side_analysis: true,
      analysis_result: r.analysis,
    };
    await generateSnoreReport(c);
  } catch (e) {
    if (current === c) {
      setRecordingPhase(c.recordPayload?'complete':'error');
      document.querySelector('[data-action="record-save"]').hidden=!c.recordPayload;
      document.querySelector('#record-status').textContent = e.message;
    }
    throw e;
  } finally {
    if (current === c) {
      document.querySelector('[data-action="record-start"]').hidden = false;
      disablePatientChoice(document.querySelector('[name="patientId"]'),false);
    }
  }
}
async function generateSnoreReport(c) {
  if(c.recordSubmitting)return;
  if(!c.recordPayload)throw new Error('请先完成录音');
  c.recordSubmitting=true;
  const payload=c.recordPayload;
  setRecordingPhase('analyzing');
  disablePatientChoice(document.querySelector('[name="patientId"]'),true);
  document.querySelector('#record-status').textContent='正在生成分析报告…';
  try {
    const result=await post('/assessments/snore',payload);
    if(!active(c))return;
    if(!result?.id)throw new Error('报告生成结果未确认，请重试');
    c.recordPayload=null;
    navigate('report',{id:result.id,patientId:payload.patientId});
  }catch(error){
    if(active(c)){
      setRecordingPhase('complete');
      document.querySelector('[data-action="record-save"]').hidden=false;
      document.querySelector('#record-status').textContent=error.message+'；录音分析结果已保留，可重试生成报告。';
      disablePatientChoice(document.querySelector('[name="patientId"]'),false);
    }
    throw error;
  }finally{c.recordSubmitting=false;}
}
window.addEventListener('hashchange', render);
window.addEventListener('patient-session-expired', () => {
  recorder?.dispose();
  loginBinding = false;
  notify('登录已过期，请重新登录');
  if (!publicPages.has(current?.page)) {
    sessionStorage.setItem('pc-login-return', location.hash);
    navigate('login');
  } else render();
});
window.addEventListener('pagehide', () => recorder?.dispose());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && recorder?.running)
    stopRecording(current).catch(() => {});
});
window.addEventListener('beforeunload', (event) => {
  if (recorder?.running) {
    event.preventDefault();
    event.returnValue = '';
  }
});
root.addEventListener(
  'error',
  (event) => {
    if (event.target instanceof HTMLImageElement) {
      const img = event.target;
      if((img.hasAttribute('data-product-cover')||img.hasAttribute('data-clinic-cover'))){img.remove();return;}

      const fallback = document.createElement('div');
      fallback.className = 'image-fallback ' + img.className;
      fallback.textContent = img.matches('.parity-thumb') ? (img.alt?.slice(0,1) || '兴') : (img.alt || '暂无图片');
      if(img.matches('.parity-thumb')){fallback.setAttribute('role','img');fallback.setAttribute('aria-label','暂无图片');}
      img.replaceWith(fallback);
    }
  },
  true,
);
async function boot() {
  const search = new URLSearchParams(location.search);
  const code = search.get('code'),
    state = search.get('state');
  const referral = search.get('referralCode');
  if (referral && /^[A-Za-z0-9_-]{1,64}$/.test(referral))
    sessionStorage.setItem('pc-referral', referral);
  if (search.get('wechat') === 'callback') {
    history.replaceState(null, '', location.pathname + '#/login');
    render();
    try {
      if (!code || !state) throw new Error('微信授权未完成，请重新扫码');
      const r = await post('/pc/auth/wechat/exchange', { code, state });
      if (r.bindingRequired) {
        loginBinding = true;
        session.clear();
        await render();
        notify(r.message);
      } else {
        session.save(r.access_token);
        location.hash = nextRoute();
      }
    } catch (e) {
      notify(e.message);
    }
  } else render();
}
// Acknowledgement is only shown on the lists after a result was uncertain.
const listObserver = new MutationObserver(() => {
  if (!current || !['appointments', 'orders'].includes(current.page)) return;
  const type = current.page === 'appointments' ? 'booking' : 'order',
    key = pendingKey(current, type),
    content = document.querySelector('#content');
  if (
    sessionStorage.getItem(key) &&
    content &&
    !content.querySelector('.pending-notice') &&
    !content.querySelector('.loading-state, .error-state')
  )
    content.insertAdjacentHTML(
      'afterbegin',
      `<div class="notice pending-notice"><p>上一笔提交结果未确认。请核对以下记录，不要重复提交。</p>${action('已核对，允许重新提交', 'acknowledge-create', `data-type="${type}"`)}</div>`,
    );
});
listObserver.observe(root, { childList: true, subtree: true });
boot();
import { footer } from './footer.js';
