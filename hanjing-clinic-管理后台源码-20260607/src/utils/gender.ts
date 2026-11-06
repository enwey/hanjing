export function genderValue(value: unknown): number {
  const text = String(value ?? '').trim().toLowerCase()
  if (['1', '男', 'male', 'm'].includes(text)) return 1
  if (['2', '女', 'female', 'f'].includes(text)) return 2
  return 0
}
export function genderLabel(value: unknown): string {
  return genderValue(value) === 1 ? '男' : genderValue(value) === 2 ? '女' : '未设置'
}
export function genderColor(value: unknown): string {
  return genderValue(value) === 1 ? '#3B6BF5' : genderValue(value) === 2 ? '#EC4899' : '#94A3B8'
}
