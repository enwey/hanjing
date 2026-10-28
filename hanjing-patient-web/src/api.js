import { isLocalMockLoginAvailable } from './local-login.js';
const KEY = 'xingkangming.patient.pc.session';
export const session = {
  token() {
    if (sessionStorage.getItem(KEY + '.mode') === 'local' && !isLocalMockLoginAvailable()) {
      this.clear();
      return '';
    }
    return sessionStorage.getItem(KEY) || '';
  },
  save(token, { local = false } = {}) {
    if (!token) throw new Error('登录响应缺少凭据');
    sessionStorage.setItem(KEY, token);
    if (local) sessionStorage.setItem(KEY + '.mode', 'local');
    else sessionStorage.removeItem(KEY + '.mode');
  },
  clear() {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY + '.mode');
  },
};
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
export async function request(
  path,
  { method = 'GET', data, signal, token = session.token() } = {},
) {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('无效接口路径');
  let response;
  const timeout = AbortSignal.timeout(30000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    response = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      signal: combined,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted)
      throw new ApiError('请求超时，提交类操作请先查看记录确认结果');
    throw new ApiError('网络连接失败，请检查网络后重试');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || ![0, 200].includes(body.code)) {
    if (response.status === 401 && token && session.token() === token) {
      session.clear();
      window.dispatchEvent(new Event('patient-session-expired'));
    }
    throw new ApiError(
      body?.message || '服务暂不可用，请稍后重试',
      response.status,
    );
  }
  return body.data !== undefined ? body.data : body;
}
export const list = (value) =>
  Array.isArray(value) ? value : value?.list || value?.items || [];
export const query = (values) => {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== '' && value != null) q.set(key, value);
  return '?' + q;
};
export const post = (path, data = {}) =>
  request(path, { method: 'POST', data });
export const put = (path, data) => request(path, { method: 'PUT', data });
