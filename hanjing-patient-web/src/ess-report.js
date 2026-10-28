import { esc, btn } from './ui.js';
export function getEssLevelInfo(score) {
  if (score <= 5) {
    return {
      level: '正常',
      color: 'linear-gradient(135deg, #10B981, #059669)',
      desc: '您的日间嗜睡程度在正常范围内，白天精神状态良好。',
      advice: '保持现有作息规律，定期关注睡眠质量变化。如仍存在打鼾问题，建议进行睡眠评估。',
      adviceBg: '#f0fdf4',
      adviceBorder: '#bbf7d0',
      adviceTitleColor: '#166534',
      adviceTextColor: '#15803d',
      adviceIcon: '/static/icons/heart.svg',
    };
  }
  if (score <= 10) {
    return {
      level: '轻度嗜睡',
      color: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
      desc: '本次评估记录为轻度嗜睡，请结合自身情况关注睡眠质量。',
      advice: '注意保持规律作息，避免熬夜。建议使用 本网站的 AI 鼾声分析功能，了解夜间睡眠状况。',
      adviceBg: '#eff6ff',
      adviceBorder: '#bfdbfe',
      adviceTitleColor: '#1e40af',
      adviceTextColor: '#1d4ed8',
      adviceIcon: '/static/icons/info.svg',
    };
  }
  if (score <= 15) {
    return {
      level: '中度嗜睡',
      color: 'linear-gradient(135deg, #F97316, #C2410C)',
      desc: '您存在中度日间嗜睡，日常活动受到明显影响，需引起重视。',
      advice: '强烈建议尽快预约专业门诊。可能需要进行睡眠监测，评估是否存在睡眠呼吸暂停。',
      adviceBg: '#fff7ed',
      adviceBorder: '#ffedd5',
      adviceTitleColor: '#9a3412',
      adviceTextColor: '#c2410c',
      adviceIcon: '/static/icons/alert.svg',
    };
  }
  return {
    level: '重度嗜睡',
    color: 'linear-gradient(135deg, #EF4444, #B91C1C)',
    desc: '您存在重度日间嗜睡，可能对健康和安全造成严重影响。',
    advice: '请立即预约兴康明门诊进行专业诊断。建议避免长途驾驶，尽快进行多导睡眠监测。',
    adviceBg: '#fef2f2',
    adviceBorder: '#fee2e2',
    adviceTitleColor: '#991b1b',
    adviceTextColor: '#b91c1c',
    adviceIcon: '/static/icons/alert.svg',
  };
}

export function getAnswerPresentation(score) {
  if (score === 0) return { label: '从不', color: '#10B981', background: '#ECFDF5', borderColor: '#A7F3D0' };
  if (score === 1) return { label: '轻度', color: '#D97706', background: '#FFFBEB', borderColor: '#FDE68A' };
  if (score === 2) return { label: '中度', color: '#C2410C', background: '#FFF7ED', borderColor: '#FDBA74' };
  if (score === 3) return { label: '高度', color: '#B91C1C', background: '#FEF2F2', borderColor: '#FCA5A5' };
  return { label: '未答', color: '#64748B', background: '#F8FAFC', borderColor: '#E2E8F0' };
}


export function essReport(a, questions = []) {
  const valid = a.essScore !== null && a.essScore !== undefined && a.essScore !== '' && Number.isInteger(Number(a.essScore)) && Number(a.essScore) >= 0 && Number(a.essScore) <= 24;
  const score = valid ? Number(a.essScore) : null;
  const info = valid ? getEssLevelInfo(score) : {level:'待评估', color:'#64748b', desc:'暂无有效评分，请重新完成 ESS 嗜睡量表评估。', advice:'暂无评估建议。',adviceBg:'#f8fafc',adviceBorder:'#e2e8f0',adviceTitleColor:'#334155',adviceTextColor:'#475569'};
  const answers = Array.isArray(a.essAnswers) ? a.essAnswers : [];
  return `<div class="ess-report"><div class="ess-report-summary"><section class="ess-score-card" style="background:${info.color}"><span>ESS 评分</span><strong>${score ?? '—'}<small>/ 24 分</small></strong><b>${info.level}</b></section><section class="ess-interpretation"><h2>评分解读</h2><p>${info.desc}</p><p class="muted">评估结果仅供参考，不替代医生诊断。</p></section></div><section class="ess-answer-card"><h2>答案回顾</h2><div class="ess-answer-list">${questions.length ? questions.map((q,i)=>{const answer=getAnswerPresentation(answers[i]);return `<div class="ess-answer-row"><span>第${i+1}题. ${esc(q.situation || '')}</span><b style="color:${answer.color};background:${answer.background};border-color:${answer.borderColor}">${answer.label}</b></div>`;}).join('') : '<p class="muted">暂无题目数据</p>'}</div></section><section class="ess-advice" style="background:${info.adviceBg};border-color:${info.adviceBorder};color:${info.adviceTextColor}"><h2 style="color:${info.adviceTitleColor}">专业建议</h2><p>${info.advice}</p></section><div class="ess-report-actions">${btn('立即预约门诊','stores')}${btn('返回睡眠评估','assessment')}${btn('重新评估','questionnaire',{patientId:a.patientId || ''})}</div></div>`;
}
