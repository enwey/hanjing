// Never trust forwarded headers to authorize a development login.
export function canUseLocalDevLogin(req, env = process.env) {
  const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
  return env.NODE_ENV === 'development' && env.ENABLE_LOCAL_DEV_LOGIN === 'true'
    && ['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST || '')
    && loopback(req.socket?.remoteAddress)
    && !req.headers?.['x-forwarded-for'] && !req.headers?.['x-forwarded-host']
    && !req.headers?.['x-forwarded-proto'];
}
