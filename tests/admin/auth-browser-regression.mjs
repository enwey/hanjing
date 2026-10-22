import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
import { get, run, closePool } from '../../hanjing-clinic-backend/db.js';
import { hashPassword } from '../../hanjing-clinic-backend/helpers.js';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9237;
const baseUrl = 'http://127.0.0.1:3000';
const username = `browser_logout_${Date.now()}`;
const password = `BrowserLogout!${Date.now()}`;
let adminId = 0;
let chrome;
let profileDir;
const clients = [];

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
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result.value;
  }
  close() { this.ws.close(); }
}

async function newTab(url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await response.json();
  const client = await new CdpClient(target.webSocketDebuggerUrl).open();
  clients.push(client);
  await waitFor(async () => await client.evaluate(`location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`), `page load ${url}`);
  return client;
}

async function clickText(client, text) {
  return await client.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('button')];
    const node = nodes.find(el => el.textContent?.trim() === ${JSON.stringify(text)} && el.offsetParent !== null);
    if (!node) return false;
    node.click();
    return true;
  })()`);
}

async function clickSelector(client, selector) {
  const point = await client.evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)});
    if (!node || node.offsetParent === null) return null;
    const rect=node.getBoundingClientRect();
    return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  })()`);
  if (!point) return false;
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}

try {
  const role = await get('SELECT id FROM roles WHERE code = ? AND status = ? LIMIT 1', ['super_admin', 'active']);
  if (!role) throw new Error('No active super_admin role available');
  const created = await run(
    'INSERT INTO admin_users (username,password_hash,name,role_id,status,token_version) VALUES (?,?,?,?,?,0)',
    [username, hashPassword(password), 'Browser logout fixture', role.id, 'online']
  );
  adminId = Number(created.id);

  profileDir = await mkdtemp(join(tmpdir(), 'hanjing-auth-browser-'));
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; }
  }, 'Chrome DevTools');

  const tab1 = await newTab(`${baseUrl}/login`);
  const login = await tab1.evaluate(`(async () => {
    const response = await fetch('/api/admin/login', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)}})});
    const body = await response.json();
    localStorage.setItem('auth_token', body.data.token);
    localStorage.setItem('user_info', JSON.stringify(body.data.user));
    return {status:response.status, token:body.data.token};
  })()`);
  await tab1.send('Page.navigate', { url: `${baseUrl}/dashboard` });
  await waitFor(async () => await tab1.evaluate(`location.pathname === '/dashboard' && !!document.querySelector('.topbar-user')`), 'dashboard navigation');
  const payload = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString('utf8'));

  const tab2 = await newTab(`${baseUrl}/dashboard`);
  await waitFor(async () => await tab2.evaluate(`location.pathname === '/dashboard' && !!document.querySelector('.topbar-user')`), 'second dashboard');

  console.log(JSON.stringify({ pageBeforeLogout: await tab1.evaluate(`({path:location.pathname,title:document.title,topbarUsers:document.querySelectorAll('.topbar-user').length,text:document.body.innerText.slice(0,300)})`) }));
  await clickSelector(tab1, '.topbar-user');
  await waitFor(async () => await tab1.evaluate('!!document.querySelector(".user-menu-item.logout")?.offsetParent'), 'logout menu');
  await tab1.evaluate('document.querySelector(".user-menu-item.logout").click()');
  const dialog = await waitFor(async () => await tab1.evaluate(`document.body.innerText.includes('您确定要安全退出当前系统账号吗')`), 'logout dialog');
  console.log(JSON.stringify({ dialogButtons: await tab1.evaluate(`([...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>({text:b.textContent.trim(),className:b.className,rect:(()=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()})))`) }));
  await tab1.evaluate(`localStorage.removeItem('auth_token');localStorage.removeItem('user_info')`);
  await delay(800);
  const tab2State = await tab2.evaluate(`({path:location.pathname,token:localStorage.getItem('auth_token'),showsWorkbench:document.body.innerText.includes('工作台')})`);

  const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 7 * 86400 })).toString('base64url');
  await tab2.evaluate(`localStorage.setItem('auth_token','x.${expiredPayload}.x');localStorage.setItem('user_info','{}')`);
  await tab2.send('Page.navigate', { url: `${baseUrl}/dashboard` });
  await waitFor(async () => (await tab2.evaluate('location.pathname')) === '/login', 'expired token redirect');
  const expiredState = await tab2.evaluate(`({path:location.pathname,token:localStorage.getItem('auth_token'),user:localStorage.getItem('user_info')})`);

  console.log(JSON.stringify({
    issuedTtlSeconds: payload.exp - payload.iat,
    dialogVisible: dialog,
    tab2StateBeforeNavigation: tab2State,
    expiredTokenSevenDaysPast: expiredState
  }));
} finally {
  for (const client of clients) client.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([
      new Promise(resolve => chrome.once('exit', resolve)),
      delay(3000)
    ]);
  }
  if (adminId) {
    await run('DELETE FROM audit_logs WHERE admin_id = ?', [adminId]);
    await run('DELETE FROM admin_users WHERE id = ? AND username = ?', [adminId, username]);
  }
  const remaining = await get('SELECT COUNT(*) AS count FROM admin_users WHERE username LIKE ?', ['browser_logout_%']);
  console.log(JSON.stringify({ remainingTemporaryAccounts: Number(remaining.count) }));
  await closePool();
  if (profileDir) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await rm(profileDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await delay(500);
      }
    }
  }
}
