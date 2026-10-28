export function isLocalMockLoginAvailable(
  dev = import.meta.env?.DEV === true,
  hostname = globalThis.location?.hostname || '',
) {
  return dev === true && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

export async function localMockLogin({ post, session, isActive = () => true, enabled = isLocalMockLoginAvailable() }) {
  if (!enabled) throw new Error('本地模拟登录仅限本地开发环境');
  const result = await post('/auth/local-login', {});
  if (!isActive()) return false;
  if (!result?.access_token) throw new Error('登录未完成，请重试');
  session.save(result.access_token, { local: true });
  return true;
}

// Explicit local diagnostic access; never shown in the normal patient flow.
export function showLocalLogin(available = isLocalMockLoginAvailable(), search = globalThis.location?.search || '') {
  return available && new URLSearchParams(search).get('localLogin') === '1';
}
