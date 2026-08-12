const pad = (value: number) => String(value).padStart(2, '0')

const getShanghaiDate = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

export const formatShanghaiDateTime = (value: string | number | Date, includeSeconds = true) => {
  if (!value) return ''
  const parts = getShanghaiDate(value)
  if (!parts) return String(value).replace('T', ' ').slice(0, includeSeconds ? 19 : 16)
  const base = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
  return includeSeconds ? `${base}:${parts.second}` : base
}

export const formatShanghaiDateOnly = (value: string | number | Date) => {
  if (!value) return ''
  const text = String(value).trim()
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (matched) return matched[1]
  const parts = getShanghaiDate(value)
  if (!parts) return text
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const formatShanghaiMonthDayTime = (value: string | number | Date) => {
  if (!value) return ''
  const parts = getShanghaiDate(value)
  if (!parts) return String(value)
  return `${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}`
}

export const getShanghaiTodayString = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
