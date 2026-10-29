export const BRAND_AUTHOR = '兴康明诊所';
export const BRAND_AVATAR = '/api/v1/community/brand-logo.png';
const BRAND_OPENID = 'editorial:xkm:community-official';

export async function resolveArticlePublisher(value, { get, run }) {
  if (value === undefined || value === null || value === '') {
    await run('INSERT IGNORE INTO users(openid,nickname,avatar_url) VALUES(?,?,?)', [BRAND_OPENID, BRAND_AUTHOR, BRAND_AVATAR]);
    const user = await get('SELECT id FROM users WHERE openid=?', [BRAND_OPENID]);
    if (!user) throw new Error('品牌發布者建立失敗');
    return { id: user.id, role: 'admin' };
  }
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw Object.assign(new Error('發布者無效，請重新選擇'), { statusCode: 400 });
  }
  const user = await get('SELECT id,openid FROM users WHERE id=?', [Number(value)]);
  if (!user || user.openid === BRAND_OPENID) throw Object.assign(new Error('發布者不存在，請重新選擇'), { statusCode: 400 });
  return { id: user.id, role: 'patient' };
}

export function communityPublisher(post) {
  if (post.user_role === 'admin') return { author: BRAND_AUTHOR, avatar: BRAND_AVATAR, role: 'admin', roleLabel: '诊所官方' };
  return { author: post.author_name || '', avatar: post.author_avatar || '', role: post.user_role,
    roleLabel: post.user_role === 'doctor' ? '专家医生' : post.user_role === 'expert' ? '睡眠专家' : '鼾友' };
}
