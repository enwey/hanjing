export function appointmentTimeline(appointment: any) {
  const steps = [{dot:'green',time:appointment.createTime || '时间未记录',title:'创建预约',content:'预约记录已创建'}]
  const status = appointment.status
  const terminal: Record<string, string> = {cancelled:'预约已取消',no_show:'患者未到诊',refunding:'预约退款处理中',refunded:'预约已退款'}
  if (terminal[status]) return [...steps,{dot:'orange',time:'时间未记录',title:terminal[status],content:'当前预约状态'}]
  if (status === 'pending_payment') return [...steps,{dot:'orange',time:'待完成',title:'等待支付',content:'预约处于待支付状态'}]
  if (!['pending','confirmed','waiting','called','checked_in','completed','arrived','settled'].includes(status)) {
    return [...steps,{dot:'gray',time:'--',title:'状态待核实',content:'无法确认当前预约进度'}]
  }
  steps.push({dot:'green',time:'时间未记录',title:'确认预约',content:'预约已确认，不代表全部费用已结清'})
  const stages = [
    {title:'到店签到',done:['confirmed','waiting','called','checked_in','completed','arrived','settled'].includes(status),content:'已进入到诊流程'},
    {title:'医生接诊',done:['checked_in','completed','arrived','settled'].includes(status),content:'已进入诊疗流程'},
    {title:'诊疗结束',done:['completed','arrived','settled'].includes(status),content:'诊疗已结束'},
    {title:'结算完成',done:['arrived','settled'].includes(status),content:'预约已完成结算'}
  ]
  for (const stage of stages) steps.push({dot:stage.done?'green':'gray',time:stage.done?'时间未记录':'待完成',title:stage.title,content:stage.done?stage.content:'等待完成'})
  return steps
}
