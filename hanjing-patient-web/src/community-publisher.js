import { esc } from './ui.js';

export function communityPublisherIdentity(post) {
  const official = post.role === 'admin';
  const role = official
    ? '<span class="community-official-badge" aria-label="诊所官方认证"><img class="community-official-badge__icon" src="/static/icons/official-verified.svg" alt="" aria-hidden="true"><span>官方</span></span>'
    : post.roleLabel ? `<span class="community-publisher__role">· ${esc(post.roleLabel)}</span>` : '';
  return `<span class="community-publisher"><span class="community-publisher__name">${esc(post.author || '用户')}</span>${role}</span>`;
}

export function communityPublisherAvatar(post) {
  if (post.role !== 'admin') return `<span class="feed-avatar" aria-hidden="true">${esc((post.author || '用户').slice(0, 1))}</span>`;
  return '<span class="community-official-avatar" role="img" aria-label="兴康明诊所官方头像"></span>';
}
