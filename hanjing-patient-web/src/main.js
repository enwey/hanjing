import './styles/pc-redesign.css';
import './styles/pc-consumer.css';
import './styles/pc-halcyon.css';
import './style.css';
import './home-refinement.css';
import './header.css';
import './home-motion.css';
import './pages-layout.css';
import './navigation-motion.css';
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
  loginBinding = false;
const notify = (text) => {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
};
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
    treatment: ['devices', 'device', 'wearing'],
    community: ['post', 'publish', 'live', 'room'],
    products: ['product', 'checkout', 'orders', 'order'],
  };
  return `<div class="app ${isHome ? 'is-home' : ''}"><header class="app-header hc-header"><a class="brand" href="#/home" aria-label="兴康明首页"><img src="/brand/logo.svg" alt=""><span>兴康明<small>专注睡眠呼吸健康</small></span></a><nav class="top-nav" aria-label="网站导航">${nav.map(([t, p]) => `<a href="#/${p}" ${current.page === p || groups[p]?.includes(current.page) ? 'class="current" aria-current="page"' : ''}>${t}</a>`).join('')}</nav><div class="header-user">${session.token() ? link('个人中心', 'profile') + `<button data-action="logout">退出</button>` : link('登录', 'login')}<a class="btn small hc-header-book" href="#/stores">预约就诊</a></div></header><main id="content" class="${isHome ? '' : 'pc-content hc-wrap'}" tabindex="-1">${content}</main>${footer()}</div>`;
}
async function render() {
  const generation = ++sequence;
  controller?.abort();
  controller = new AbortController();
  recorder?.dispose();
  recorder = null;
  current = {
    ...route(),
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
    document.getElementById('content').innerHTML = html;
    revealContent(document.getElementById('content'));
    if (c.page === 'login' && loginBinding)
      document.querySelector('#wechat-message').textContent =
        '微信授权已完成，请先使用密码登录已有患者账号，再确认关联。';
  } catch (error) {
    if (current !== c || error.name === 'AbortError') return;
    document.getElementById('content').innerHTML = errors(error.message);
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
  d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><textarea name="answer" required maxlength="${max}" rows="4"></textarea></label><div class="pc-actions"><button value="cancel" formnovalidate class="btn secondary">取消</button><button value="ok" class="btn">确认</button></div></form>`;
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
          type: data.type || c.reschedule?.type,
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
        const r = await post('/community/posts', {
          title: data.title.trim(),
          content: data.content.trim(),
          tags: [data.category],
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
      case 'profile':
        await put('/user/profile', {
          nickname: data.nickname.trim(),
          birthday: data.birthday,
          gender: data.gender === '' ? null : Number(data.gender),
        });
        if (active(c)) {
          notify('资料已保存');
          navigate('profile');
        }
        break;
      case 'member': {
        const payload = {
          ...data,
          name: data.name.trim(),
          gender: Number(data.gender),
        };
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
        if (active(c)) notify('评价已提交');
        break;
      case 'wearing':
        await post('/treatment/wearing', {
          ...data,
          wearDuration: Number(data.wearDuration),
          comfort: Number(data.comfort),
          painScore: Number(data.painScore),
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
      case 'message':
        await post('/im/send', { text: data.text.trim() });
        if (active(c)) render();
        break;
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
      case 'withdraw': {
        const amount = Math.round(Number(data.amount) * 100);
        if (!Number.isSafeInteger(amount) || amount <= 0)
          throw new Error('请输入有效金额');
        if (
          !(await confirmDialog(
            '确认提现申请',
            `申请金额 ${money(amount)}，将提交至后台审核。实际到账金额扣除现行规则手续费。`,
          ))
        )
          break;
        if (!active(c)) return;
        await post('/distribution/withdraw', {
          amount,
          method: 'bank',
          bankInfo: {
            bankName: data.bankName.trim(),
            accountName: data.accountName.trim(),
            accountNo: data.accountNo.trim(),
          },
        });
        if (active(c)) {
          notify('提现申请已提交');
          navigate('withdraws');
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
  button.disabled = true;
  try {
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
    if (!ensureAuth(c)) return;
    switch (name) {
      case 'cancel-appointment': {
        const reason = await promptDialog('取消预约', '请填写取消原因');
        if (reason && active(c)) {
          await post('/appointments/' + c.appointment.id + '/cancel', {
            reason,
          });
          if (active(c)) render();
        }
        break;
      }
      case 'post-like':
        await post('/community/posts/' + c.post.id + '/like', {
          isLiked: !c.post.isLiked,
        });
        if (active(c)) render();
        break;
      case 'post-favorite':
        await post('/community/posts/' + c.post.id + '/favorite', {
          isFavorited: !c.post.isFavorited,
        });
        if (active(c)) render();
        break;
      case 'post-share':
        await navigator.clipboard.writeText(location.href);
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
        if (active(c)) render();
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
              `<p>${esc(r.message || '')}</p>` +
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
            '确认移除此就诊人的关联？此操作将按现有系统规则执行。',
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
      case 'redeem': {
        const coupon = c.coupons.find(
          (v) => String(v.id) === button.dataset.id,
        );
        if (!coupon) throw new Error('优惠券不存在');
        if (
          (await confirmDialog(
            '兑换优惠券',
            `使用 ${coupon.pointsCost} 积分兑换 ${coupon.title}？`,
          )) &&
          active(c)
        ) {
          await post('/user/coupons/redeem', { couponId: coupon.id });
          if (active(c)) {
            notify('兑换成功');
            render();
          }
        }
        break;
      }
      case 'distribution-open':
        if (
          (await confirmDialog('开通推广', '确定生成个人推广身份与邀请码？')) &&
          active(c)
        ) {
          await post('/distribution/open');
          if (active(c)) render();
        }
        break;
      case 'record-start':
        await startRecording(c);
        break;
      case 'record-stop':
        await stopRecording(c);
        break;
      case 'record-save': {
        if (!c.recordPayload) throw new Error('请先完成录音');
        const result = await post('/assessments/snore', c.recordPayload);
        if (active(c)) {
          c.recordPayload = null;
          navigate('report', { id: result.id, patientId: result.patientId });
        }
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
    if (name !== 'record-stop') button.disabled = false;
  }
});
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
    if (c.page === 'questionnaire') {
      document
        .querySelectorAll('.question input')
        .forEach((e) => (e.checked = false));
      return;
    }
    if (c.page === 'recording') {
      c.recordPayload = null;
      document.querySelector('[data-action="record-save"]').hidden = true;
      document.querySelector('#record-result').innerHTML = '';
      document.querySelector('#record-status').textContent =
        '就诊人已切换，请重新录音。';
      return;
    }
    if (c.page === 'booking') return;
    navigate(c.page, { patientId: target.value });
  }
  if (target.matches('[data-delivery-method]')) updateDelivery(target.form);
  if (target.matches('[data-product-category]')) filterProducts();
});
document.addEventListener('input', (event) => {
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
  document.querySelector('#shipping-fields').hidden = pickup;
  document.querySelector('#pickup-fields').hidden = !pickup;
  f.elements.detailAddress.required = !pickup;
  f.elements.storeId.required = pickup;
}
async function startRecording(c) {
  const member = document.querySelector('[name="patientId"]');
  if (!member.value) throw new Error('请先选择就诊人');
  const patientId = member.value;
  recorder?.dispose();
  c.recordPayload = null;
  document.querySelector('#record-result').innerHTML = '';
  const instance = new Recorder(({ seconds, dbfs, error }) => {
    if (current !== c) return;
    if (error) {
      document.querySelector('#record-status').textContent = error;
      document.querySelector('[data-action="record-start"]').hidden = false;
      document.querySelector('[data-action="record-stop"]').disabled = true;
      member.disabled = false;
      return;
    }
    document.querySelector('#record-time').textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    document.querySelector('#record-level').textContent = dbfs.toFixed(1);
    document.querySelector('#record-progress').value = Math.max(0, 100 + dbfs);
    if (seconds >= 600) stopRecording(c).catch((e) => notify(e.message));
  });
  recorder = instance;
  await instance.start();
  if (current !== c) {
    instance.dispose();
    return;
  }
  c.recordPatient = patientId;
  member.disabled = true;
  document.querySelector('[data-action="record-start"]').hidden = true;
  document.querySelector('[data-action="record-stop"]').disabled = false;
  document.querySelector('[data-action="record-save"]').hidden = true;
  document.querySelector('#record-status').textContent =
    '正在录音，请保持页面在前台。';
}
async function stopRecording(c) {
  if (!recorder || recorder.stopping) return;
  const instance = recorder;
  document.querySelector('[data-action="record-stop"]').disabled = true;
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
    document.querySelector('#record-result').innerHTML = panel(
      '本次录音结果',
      kv([
        ['录音时长', r.duration + ' 秒'],
        ['估算平均音量', r.analysis.avgDecibel + ' dB'],
        ['估算峰值音量', r.analysis.peakDecibel + ' dB'],
        ['疑似鼾声占比', r.analysis.snoreRate + '%'],
      ]) +
        '<p class="muted">分析结果仅供参考；音量为估算值，不是校准声级计读数，不能据此诊断呼吸暂停。</p>',
    );
    document.querySelector('[data-action="record-save"]').hidden = false;
    document.querySelector('#record-status').textContent =
      '分析完成，保存后可在评估记录中查看。';
  } catch (e) {
    if (current === c)
      document.querySelector('#record-status').textContent = e.message;
    throw e;
  } finally {
    if (current === c) {
      document.querySelector('[data-action="record-start"]').hidden = false;
      document.querySelector('[name="patientId"]').disabled = false;
    }
  }
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
      const fallback = document.createElement('div');
      fallback.className = 'image-fallback ' + img.className;
      fallback.textContent = img.alt || '暂无图片';
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
    !content.querySelector('.loading-state')
  )
    content.insertAdjacentHTML(
      'afterbegin',
      `<div class="notice pending-notice"><p>上一笔提交结果未确认。请核对以下记录，不要重复提交。</p>${action('已核对，允许重新提交', 'acknowledge-create', `data-type="${type}"`)}</div>`,
    );
});
listObserver.observe(root, { childList: true, subtree: true });
boot();
import { footer } from './footer.js';
