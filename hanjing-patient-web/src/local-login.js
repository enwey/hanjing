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
  if (!result?.access_token) throw new Error('本地登录响应缺少凭据');
  session.save(result.access_token, { local: true });
  return true;
}
