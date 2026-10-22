import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
import { get, run, closePool } from '../../hanjing-clinic-backend/db.js';
import { hashPassword } from '../../hanjing-clinic-backend/helpers.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9243;
const baseUrl = 'http://127.0.0.1:3000';
const username = `dashboard_test_${Date.now()}`;
const password = `DashboardTest!${Date.now()}`;
const expectFixed = process.env.DASHBOARD_EXPECT_FIXED === '1';
let adminId = 0;
let chrome;
let profileDir;
let client;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
      const message = JSON.parse(String(raw));
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id); this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
    await this.send('Runtime.enable'); await this.send('Page.enable'); return this;
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
  const created = await run('INSERT INTO admin_users (username,password_hash,name,role_id,status,token_version) VALUES (?,?,?,?,?,0)', [username, hashPassword(password), 'Dashboard fixture', role.id, 'online']);
  adminId = Number(created.id);

  const loginResponse = await fetch('http://127.0.0.1:5005/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const loginBody = await loginResponse.json();
  const token = loginBody.data?.token;
  const apiResults = [];
  for (const range of ['today', 'week', 'month', 'invalid']) {
    const response = await fetch(`http://127.0.0.1:5005/api/admin/dashboard/stats?range=${range}`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    apiResults.push({ range, status: response.status, code: body.code, dataRange: body.data?.range, keys: body.data ? Object.keys(body.data).sort() : [] });
  }
  const unauthenticated = await fetch('http://127.0.0.1:5005/api/admin/dashboard/stats?range=month');
  console.log(JSON.stringify({ loginStatus: loginResponse.status, apiResults, unauthenticatedStatus: unauthenticated.status }));

  profileDir = await mkdtemp(join(tmpdir(), 'hanjing-dashboard-'));
  chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; } }, 'Chrome DevTools');
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: 'PUT' })).json();
  client = await new CdpClient(target.webSocketDebuggerUrl).open();
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(async () => await client.evaluate(`document.readyState==='complete'`), 'login page');
  await client.evaluate(`localStorage.setItem('auth_token',${JSON.stringify(token)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(loginBody.data.user))})`);
  await client.send('Page.navigate', { url: `${baseUrl}/dashboard` });
  await waitFor(async () => await client.evaluate(`location.pathname==='/dashboard' && document.body.innerText.includes('数据看板') && !document.body.innerText.includes('加载中')`), 'dashboard data');
  const desktop = await client.evaluate(`({path:location.pathname,title:document.querySelector('.page-title')?.textContent?.trim(),kpi:[...document.querySelectorAll('.stat-card')].map(x=>x.innerText),canvases:document.querySelectorAll('canvas').length,emptyStates:[...document.querySelectorAll('.table-empty')].map(x=>x.textContent.trim()),errors:[...document.querySelectorAll('.error-text')].map(x=>x.innerText),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,resizeListeners:typeof getEventListeners==='function'?(getEventListeners(window).resize||[]).length:null})`);
  await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  await delay(600);
  const narrow = await client.evaluate(`({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,kpiWidths:[...document.querySelectorAll('.stat-card')].map(x=>Math.round(x.getBoundingClientRect().width)),tableWidths:[...document.querySelectorAll('table')].map(x=>Math.round(x.getBoundingClientRect().width)),panelWidths:[...document.querySelectorAll('.panel')].map(x=>Math.round(x.getBoundingClientRect().width))})`);

  await client.evaluate(`localStorage.setItem('dashboard_filter_time','corrupt');localStorage.setItem('dashboard_chart_filter_time','corrupt');localStorage.setItem('dashboard_active_trend_type','corrupt')`);
  await client.send('Page.navigate', { url: `${baseUrl}/dashboard` });
  await waitFor(async () => await client.evaluate(expectFixed
    ? `document.body.innerText.includes('数据看板') && !document.body.innerText.includes('加载中') && !document.body.innerText.includes('加载失败')`
    : `document.body.innerText.includes('统计加载失败') && document.body.innerText.includes('趋势数据加载失败')`), expectFixed ? 'corrupt persisted state recovery' : 'corrupt persisted state error');
  const corruptState = await client.evaluate(`({primaryButtons:[...document.querySelectorAll('.btn-primary')].map(x=>x.textContent.trim()),errors:document.body.innerText.split('\\n').filter(x=>x.includes('加载失败')),stored:{filter:localStorage.getItem('dashboard_filter_time'),chart:localStorage.getItem('dashboard_chart_filter_time'),type:localStorage.getItem('dashboard_active_trend_type')}})`);
  let faultIsolation = null;
  let lifecycle = null;
  if (expectFixed) {
    await client.send('Network.enable');
    await client.send('Network.setBlockedURLs', { urls: ['*api/admin/orders*'] });
    await client.send('Page.navigate', { url: `${baseUrl}/dashboard` });
    await waitFor(async () => await client.evaluate(`document.body.innerText.includes('最新订单加载失败')`), 'isolated order failure');
    faultIsolation = await client.evaluate(`({appointmentEmpty:document.body.innerText.includes('暂无今日预约'),appointmentFailed:document.body.innerText.includes('今日预约加载失败'),orderFailed:document.body.innerText.includes('最新订单加载失败')})`);
    await client.send('Network.setBlockedURLs', { urls: [] });
    const listenerCounts = [];
    for (let i = 0; i < 2; i += 1) {
      await client.send('Page.navigate', { url: `${baseUrl}/appointment` });
      await waitFor(async () => await client.evaluate(`location.pathname==='/appointment'`), 'appointment navigation');
      await client.send('Page.navigate', { url: `${baseUrl}/dashboard` });
      await waitFor(async () => await client.evaluate(`location.pathname==='/dashboard' && document.querySelectorAll('canvas').length===1 && !document.body.innerText.includes('加载中')`), 'dashboard remount');
      listenerCounts.push(await client.evaluate(`typeof getEventListeners==='function'?(getEventListeners(window).resize||[]).length:null`));
    }
    lifecycle = { listenerCounts, canvasCount: await client.evaluate(`document.querySelectorAll('canvas').length`) };
  }
  console.log(JSON.stringify({ desktop, narrow, corruptState, faultIsolation, lifecycle }));
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null) { chrome.kill(); await delay(1000); }
  if (adminId) {
    await run('DELETE FROM audit_logs WHERE admin_id=?', [adminId]);
    await run('DELETE FROM admin_users WHERE id=? AND username=?', [adminId, username]);
  }
  const remaining = await get('SELECT COUNT(*) count FROM admin_users WHERE username LIKE ?', ['dashboard_test_%']);
  console.log(JSON.stringify({ remainingTemporaryAccounts: Number(remaining.count) }));
  await closePool();
  if (profileDir) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { await rm(profileDir, { recursive: true, force: true }); break; }
      catch (error) { if (attempt === 2) console.log(JSON.stringify({ profileCleanupWarning: error.code })); else await delay(500); }
    }
  }
}
