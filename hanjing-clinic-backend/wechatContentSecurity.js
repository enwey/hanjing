import { getWechatMiniAccessToken, isWechatAccessTokenInvalid } from './wechatMiniToken.js';

export async function checkWechatText({ openid, scene, content, title }) {
  if (!openid) return 'unavailable';

  const signal = AbortSignal.timeout(5000);
  const payload = JSON.stringify({ openid, scene, version: 2, content, title });
  try {
    for (const forceRefresh of [false, true]) {
      const token = await getWechatMiniAccessToken({ forceRefresh, signal });
      const url = new URL('https://api.weixin.qq.com/wxa/msg_sec_check');
      url.searchParams.set('access_token', token);
      const response = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: payload
      });
      const data = await response.json();
      if (isWechatAccessTokenInvalid(data) && !forceRefresh) continue;
      if (data?.errcode === 87014) return 'blocked';
      if (response.ok && data?.errcode === 0) {
        const suggest = data.result?.suggest;
        if (suggest === 'pass') return 'pass';
        if (suggest === 'risky' || suggest === 'review') return 'blocked';
      }
      console.warn('WeChat text check unavailable', {
        scene,
        status: response.status,
        errcode: typeof data?.errcode === 'number' ? data.errcode : undefined,
        traceId: data?.trace_id
      });
      return 'unavailable';
    }
  } catch (error) {
    console.warn('WeChat text check request failed', { scene, errorName: error?.name });
  }
  return 'unavailable';
}

export function rejectUncheckedContent(res, decision) {
  if (decision === 'pass') return false;
  if (decision === 'blocked') {
    res.status(422).json({ code: 'CONTENT_REJECTED', message: '发布内容包含违规信息，请修改后重试' });
  } else {
    res.status(503).json({ code: 'CONTENT_CHECK_UNAVAILABLE', message: '暂时无法发布，请稍后重试' });
  }
  return true;
}
