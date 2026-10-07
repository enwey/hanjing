import request from '@/utils/request'
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const shanghaiTime = (v:any) => v ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(v)) : ''
export const itemLabels: Record<string, string> = { pending: '待寄出', shipped: '待工厂签收', received: '工厂已签收', producing: '制作中', exception: '工厂异常', retake: '已退回重新取模', returned: '已回店验收', cancelled: '已取消' }
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function downloadMoldFile(caseId: number, file: any) {
  const blob: any = await request.get(`/api/admin/fulfillment/cases/${caseId}/mold-files/${file.id}`, { responseType: 'blob' })
  saveFile(blob, file.name)
}
export function exportManifest(batch: any) {
  const rows: any[][] = [['批次', '工厂', '快递公司', '运单号', '寄出时间', '寄件人', '取模技师', '交付单', '患者档案编号', '口模编号', '取模日期', '取模方式', '取模参数', '每日计划佩戴小时', '佩戴时段', '适应期要求', '制作要求', '设备商品', '绑定设备/初始前移量', '医生处方', '医嘱', '本次微调要求', '取模备注', '附件名称']]
  for (const item of batch.items) {
    const s = item.snapshot, m = s?.mold
    if (!m) continue
    rows.push([batch.batch_no, batch.factory_name, batch.carrier, batch.tracking_no, shanghaiTime(batch.sent_at), batch.sender_name, s.technician_name,
      s.case_id, s.patient_ref, m.mold_no, m.taken_date, m.method,
      m.parameters.map((p: any) => `${p.name}: ${p.value} ${p.unit}`).join('；'), m.wear_hours, m.wear_period, m.adaptation, m.requirements,
      s.products.map((p: any) => `${p.product_name} ×${p.quantity}`).join('；'),
      s.devices.map((d: any) => `${d.name} / 初始 ${d.initial_advancement ?? '未记录'} mm`).join('；'),
      s.prescription, s.doctor_advice,
      s.devices.flatMap((d: any) => d.adjustments.map((a: any) => `${a.adjusted_advancement} mm：${a.instructions || ''}`)).join('；'),
      m.note, s.files.map((f: any) => f.name).join('；')])
  }
  const cell = (value: any) => {
    let s = String(value ?? '')
    if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s
    return '"' + s.replace(/"/g, '""') + '"'
  }
  saveFile(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${batch.batch_no}-制作清单${batch.status === 'draft' ? '-草稿' : ''}.csv`)
}
