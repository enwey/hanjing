import request from '@/utils/request'
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const shanghaiTime = (v:any) => v ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(v)) : ''
export const itemLabels: Record<string, string> = { pending: '待寄出', shipped: '待工厂签收', received: '工厂已签收', producing: '制作中', exception: '工厂异常', retake: '已退回重新取模', returned: '已回店验收', cancelled: '已取消' }
export function moldDescription(m: any = {}) {
  if (typeof m.description === 'string') return m.description
  return [m.method && `取模方式：${m.method}`, m.storage_location && `存放位置：${m.storage_location}`,
    ...(m.parameters || []).map((p: any) => `${p.name}：${p.value} ${p.unit || ''}`),
    m.wear_hours && `每日计划佩戴：${m.wear_hours}小时`, m.wear_period && `佩戴时段：${m.wear_period}`,
    m.adaptation && `适应期要求：${m.adaptation}`, m.requirements && `制作要求：${m.requirements}`,
    m.note && `备注：${m.note}`].filter(Boolean).join('\n')
}
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function downloadMoldFile(caseId: number, file: any) {
  const blob: any = await request.get(`/api/admin/fulfillment/cases/${caseId}/mold-files/${file.id}`, { responseType: 'blob' })
  saveFile(blob, file.name)
}
export async function exportManifest(batch: any) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('送厂清单')
  sheet.columns = [
    {header:'批次编号',key:'batch',width:28},{header:'制作工厂',key:'factory',width:20},
    {header:'患者',key:'patient',width:16},{header:'患者档案号',key:'ref',width:22},
    {header:'口模编号',key:'mold',width:28},{header:'取模日期',key:'date',width:16},
    {header:'取模技师',key:'technician',width:16},{header:'取模说明 / 制作要求',key:'description',width:55},
    {header:'设备商品',key:'products',width:30},{header:'医生处方',key:'prescription',width:40},{header:'医嘱',key:'advice',width:40},
    {header:'已绑定设备参数',key:'devices',width:36},{header:'本次微调要求',key:'adjustments',width:40},{header:'附件名称',key:'files',width:30}
  ]
  for (const item of batch.items || []) {
    const s = item.snapshot
    if (!s?.mold) continue
    sheet.addRow({batch:batch.batch_no,factory:batch.factory_name,patient:s.patient_name || '',ref:s.patient_ref,
      mold:s.mold.mold_no,date:s.mold.taken_date,technician:s.technician_name,description:moldDescription(s.mold),
      products:(s.products || []).map((p:any)=>`${p.product_name} ×${p.quantity}`).join('；'),prescription:s.prescription || '',advice:s.doctor_advice || '',
      devices:(s.devices || []).map((d:any)=>`${d.name}：初始前移量 ${d.initial_advancement ?? '未记录'}mm`).join('；'),
      adjustments:(s.devices || []).flatMap((d:any)=>(d.adjustments || []).map((a:any)=>`${a.adjusted_advancement}mm：${a.instructions || ''}`)).join('；'),
      files:(s.files || []).map((f:any)=>f.name).join('；')})
  }
  sheet.eachRow((row, index) => {
    row.alignment = { vertical:'top', wrapText:true }
    row.height = index === 1 ? 28 : 72
    if(index === 1) { row.font={bold:true,color:{argb:'FFFFFFFF'}}; row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3B6BF5'}}}) }
  })
  sheet.views=[{state:'frozen',ySplit:1}]
  sheet.autoFilter='A1:N1'
  const buffer = await workbook.xlsx.writeBuffer()
  saveFile(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${batch.batch_no}-送厂清单.xlsx`)
}
