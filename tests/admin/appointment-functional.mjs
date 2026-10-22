import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
import { get, run, closePool } from '../../hanjing-clinic-backend/db.js';
import { hashPassword } from '../../hanjing-clinic-backend/helpers.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9246;
const baseUrl = 'http://127.0.0.1:3000';
const username = `appointment_test_${Date.now()}`;
const password = `AppointmentTest!${Date.now()}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let adminId = 0, chrome, profileDir, client;

async function waitFor(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
    this.ws.on('message', raw => {
      const msg = JSON.parse(String(raw));
      if (!msg.id || !this.pending.has(msg.id)) return;
      const pending = this.pending.get(msg.id); this.pending.delete(msg.id);
      msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
    });
    await this.send('Runtime.enable'); await this.send('Page.enable'); await this.send('Network.enable');
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result.value;
  }
  close() { this.ws.close(); }
}

try {
  const role = await get('SELECT id FROM roles WHERE code=? AND status=? LIMIT 1', ['super_admin', 'active']);
  if (!role) throw new Error('No active super_admin role');
  const created = await run('INSERT INTO admin_users (username,password_hash,name,role_id,status,token_version) VALUES (?,?,?,?,?,0)', [username, hashPassword(password), 'Appointment fixture', role.id, 'online']);
  adminId = Number(created.id);
  const loginRes = await fetch('http://127.0.0.1:5005/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const loginBody = await loginRes.json();
  const token = loginBody.data.token;
  const api = async path => {
    const response = await fetch(`http://127.0.0.1:5005${path}`, { headers: { authorization: `Bearer ${token}` } });
    let body; try { body = await response.json(); } catch { body = null; }
    return { status: response.status, code: body?.code, data: body?.data, message: body?.message };
  };
  const list = await api('/api/admin/appointments?page=1&pageSize=30');
  const firstNo = list.data?.list?.[0]?.appointment_no || null;
  const exactSearch = firstNo ? await api(`/api/admin/appointments?page=1&pageSize=30&search=${encodeURIComponent(firstNo)}`) : null;
  const apiResults = {
    login: loginRes.status,
    unauthenticated: (await fetch('http://127.0.0.1:5005/api/admin/appointments?page=1&pageSize=30')).status,
    list: { status: list.status, total: list.data?.total, returned: list.data?.list?.length, firstNo },
    exactAppointmentNoSearch: exactSearch ? { status: exactSearch.status, total: exactSearch.data?.total, returned: exactSearch.data?.list?.length } : 'not-executed-no-record',
    invalidStatus: await api('/api/admin/appointments?page=1&pageSize=30&status=corrupt'),
    negativePage: await api('/api/admin/appointments?page=-1&pageSize=30'),
    negativePageSize: await api('/api/admin/appointments?page=1&pageSize=-1')
  };
  for (const key of ['invalidStatus', 'negativePage', 'negativePageSize']) {
    const value = apiResults[key];
    apiResults[key] = { status: value.status, code: value.code, total: value.data?.total, message: value.message };
  }
  console.log(JSON.stringify({ apiResults }));

  profileDir = await mkdtemp(join(tmpdir(), 'hanjing-appointment-'));
  chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; } }, 'Chrome DevTools');
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: 'PUT' })).json();
  client = await new CdpClient(target.webSocketDebuggerUrl).open();
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(async () => await client.evaluate(`location.origin===${JSON.stringify(baseUrl)} && document.readyState==='complete'`), 'login page');
  await client.evaluate(`localStorage.setItem('auth_token',${JSON.stringify(token)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(loginBody.data.user))})`);
  await client.send('Page.navigate', { url: `${baseUrl}/appointment` });
  await waitFor(async () => await client.evaluate(`location.pathname==='/appointment' && document.body.innerText.includes('预约管理') && !document.body.innerText.includes('加载中')`), 'appointment page');
  await delay(1500);
  const desktop = await client.evaluate(`({title:document.querySelector('.page-title')?.textContent.trim(),tabs:[...document.querySelectorAll('.filter-tab')].map(x=>x.innerText.trim()),active:[...document.querySelectorAll('.filter-tab.active')].map(x=>x.innerText.trim()),rows:document.querySelectorAll('tbody tr').length,empty:document.body.innerText.includes('暂无匹配的预约记录数据'),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth})`);
  await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  await delay(500);
  const narrow = await client.evaluate(`({viewport:innerWidth,documentScrollWidth:document.documentElement.scrollWidth,contentScrollWidth:document.querySelector('.app-content')?.scrollWidth,panelWidth:Math.round(document.querySelector('.panel')?.getBoundingClientRect().width||0),tableWidth:Math.round(document.querySelector('.data-table')?.getBoundingClientRect().width||0),tableScrollClientWidth:document.querySelector('.table-scroll')?.clientWidth,tableScrollWidth:document.querySelector('.table-scroll')?.scrollWidth})`);
  await client.evaluate(`localStorage.setItem('appt_list_active_tab','corrupt');localStorage.setItem('appt_list_filter_store','已删除门店');localStorage.setItem('appt_list_filter_doctor','已删除医生')`);
  await client.send('Page.navigate', { url: `${baseUrl}/appointment` });
  await waitFor(async () => await client.evaluate(`location.pathname==='/appointment' && document.body.innerText.includes('预约管理')`), 'corrupt state page');
  await delay(800);
  const corruptState = await client.evaluate(`({active:[...document.querySelectorAll('.filter-tab.active')].map(x=>x.innerText.trim()),stored:{tab:localStorage.getItem('appt_list_active_tab'),store:localStorage.getItem('appt_list_filter_store'),doctor:localStorage.getItem('appt_list_filter_doctor')},empty:document.body.innerText.includes('暂无匹配的预约记录数据'),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText)})`);
  await client.send('Network.setBlockedURLs', { urls: ['*api/admin/appointments*'] });
  await client.evaluate(`document.querySelectorAll('.filter-tab')[1]?.click()`);
  await delay(1000);
  const blockedRequest = await client.evaluate(`({active:[...document.querySelectorAll('.filter-tab.active')].map(x=>x.innerText.trim()),rows:document.querySelectorAll('tbody tr').length,empty:document.body.innerText.includes('暂无匹配的预约记录数据'),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText),errorText:document.body.innerText.includes('加载失败')})`);
  console.log(JSON.stringify({ desktop, narrow, corruptState, blockedRequest }));
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null) { chrome.kill(); await delay(1000); }
  if (adminId) {
    await run('DELETE FROM audit_logs WHERE admin_id=?', [adminId]);
    await run('DELETE FROM admin_users WHERE id=? AND username=?', [adminId, username]);
  }
  const remaining = await get('SELECT COUNT(*) count FROM admin_users WHERE username LIKE ?', ['appointment_test_%']);
  console.log(JSON.stringify({ remainingTemporaryAccounts: Number(remaining.count) }));
  await closePool();
  if (profileDir) {
    for (let i = 0; i < 3; i += 1) {
      try { await rm(profileDir, { recursive: true, force: true }); break; }
      catch (error) { if (i === 2) console.log(JSON.stringify({ profileCleanupWarning: error.code })); else await delay(500); }
    }
  }
}
