type VisitStep = { dot: string; time: string; title: string; content: string; badge?: string }

export function appointmentTimeline(appointment: any): VisitStep[] {
  const status = appointment.status
  const steps: VisitStep[] = [{ dot: 'green', time: appointment.createTime || '', title: '创建预约', content: appointment.dateTime ? `已预约 ${appointment.dateTime}` : '已为患者安排本次就诊' }]
  const terminal: Record<string, string> = { cancelled: '本次预约已取消', no_show: '患者未按预约时间到诊', refunding: '预约费用退款处理中', refunded: '预约费用已退回' }
  if (terminal[status]) return [...steps, { dot: 'orange', time: '', title: status === 'no_show' ? '未到诊' : status === 'cancelled' ? '取消预约' : '预约退款', content: terminal[status] }]
  if (status === 'pending_payment') return [...steps, { dot: 'orange', time: '', title: '等待支付', content: '请完成预约费用支付，保留本次就诊安排' }]
  if (!['pending', 'confirmed', 'waiting', 'called', 'checked_in', 'completed', 'arrived', 'settled'].includes(status)) return steps
  const completed = ['completed', 'arrived', 'settled'].includes(status)
  const consulting = status === 'checked_in' || completed
  const skipped = appointment.checkin_mode === 'skipped'
  const signedIn = appointment.checkin_mode === 'normal' || Boolean(appointment.checkin_at)
  const doctor = appointment.doctor ? `${appointment.doctor}医生` : '医生'
  steps.push({
    dot: skipped ? 'gray' : signedIn ? 'green' : 'gray',
    time: skipped ? '' : appointment.checkin_at || '', title: '到店签到',
    ...(skipped ? { badge: '已跳过' } : {}),
    content: skipped ? '患者已就诊，无需候诊' : signedIn ? (consulting ? '患者已到店' : '患者已到店，等待医生接诊') : consulting ? '患者已就诊' : ['confirmed', 'waiting', 'called'].includes(status) ? '等待医生接诊' : '等待患者到店'
  })
  steps.push({ dot: consulting ? 'green' : 'gray', time: appointment.consultation_started_at || '', title: '医生接诊', content: consulting ? `${doctor}开始看诊` : '等待医生接诊' })
  steps.push({ dot: completed ? 'green' : 'gray', time: appointment.consultation_completed_at || '', title: '诊疗结束', content: completed ? '本次看诊已完成' : '等待看诊结束' })
  return steps
}
