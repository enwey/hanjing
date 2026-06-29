<script setup lang="ts">
import { computed, useAttrs } from 'vue'

type ShapeNode = {
  tag: string
  attrs: Record<string, string | number>
}

const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  strokeWidth?: number | string
}>(), {
  size: '1em',
  strokeWidth: 2
})

const attrs = useAttrs()

const aliases: Record<string, string> = {
  '📊': 'chart',
  dashboard: 'chart',
  chart: 'chart',
  '📅': 'calendar',
  appointment: 'calendar',
  calendar: 'calendar',
  '📣': 'megaphone',
  '📢': 'megaphone',
  queue: 'megaphone',
  megaphone: 'megaphone',
  '🔊': 'volume',
  volume: 'volume',
  '🩺': 'stethoscope',
  workbench: 'stethoscope',
  stethoscope: 'stethoscope',
  '🧑‍⚕️': 'patient',
  patient: 'patient',
  '👨‍⚕️': 'doctor',
  doctor: 'doctor',
  '🏥': 'store',
  '🏡': 'store',
  '🏬': 'store',
  store: 'store',
  '📦': 'box',
  order: 'box',
  box: 'box',
  '💰': 'money',
  '💵': 'money',
  money: 'money',
  '👥': 'team',
  team: 'team',
  '💳': 'card',
  card: 'card',
  '🛍️': 'bag',
  products: 'bag',
  bag: 'bag',
  '📝': 'file-text',
  content: 'file-text',
  article: 'file-text',
  '📋': 'clipboard',
  clipboard: 'clipboard',
  '🎨': 'image',
  banner: 'image',
  image: 'image',
  '⚙️': 'settings',
  '⚙': 'settings',
  settings: 'settings',
  '🔐': 'lock',
  lock: 'lock',
  '➕': 'plus',
  add: 'plus',
  plus: 'plus',
  '🔍': 'search',
  search: 'search',
  '📥': 'download',
  export: 'download',
  download: 'download',
  '🖨️': 'print',
  '🖨': 'print',
  print: 'print',
  '✏️': 'edit',
  '✏': 'edit',
  edit: 'edit',
  '❌': 'x-circle',
  cancel: 'x-circle',
  close: 'x-circle',
  '✅': 'check-circle',
  '✓': 'check-circle',
  success: 'check-circle',
  '🔔': 'bell',
  bell: 'bell',
  '📞': 'phone',
  phone: 'phone',
  '🕐': 'clock',
  clock: 'clock',
  '🏷️': 'tag',
  '🏷': 'tag',
  tag: 'tag',
  '📁': 'folder',
  folder: 'folder',
  '💬': 'message',
  message: 'message',
  '⚠️': 'alert',
  '⚠': 'alert',
  alert: 'alert',
  '💡': 'lightbulb',
  idea: 'lightbulb',
  lightbulb: 'lightbulb',
  '🛠️': 'tool',
  '🛠': 'tool',
  tool: 'tool',
  '🔄': 'refresh',
  refresh: 'refresh',
  '🚚': 'truck',
  truck: 'truck',
  '🏪': 'pickup',
  pickup: 'pickup',
  '🟢': 'wechat',
  wechat: 'wechat',
  '🔵': 'alipay',
  alipay: 'alipay',
  '🪙': 'coins',
  cash: 'coins',
  coins: 'coins',
  '💾': 'save',
  save: 'save',
  '👤': 'user',
  user: 'user',
  '🌅': 'sunrise',
  sunrise: 'sunrise',
  '🌇': 'sunset',
  sunset: 'sunset',
  '💎': 'gem',
  gem: 'gem',
  '🥇': 'medal-gold',
  '🥈': 'medal-silver',
  '🥉': 'medal-bronze',
  medal: 'medal-gold',
  '🛏️': 'bed',
  '🛏': 'bed',
  bed: 'bed',
  '😷': 'mask',
  mask: 'mask',
  '💨': 'wind',
  wind: 'wind',
  '📚': 'book',
  book: 'book',
  '📜': 'history',
  history: 'history',
  '✍️': 'pen-square',
  '✍': 'pen-square',
  '🏆': 'trophy',
  trophy: 'trophy',
  '⚡': 'bolt',
  bolt: 'bolt',
  '🌱': 'sprout',
  sprout: 'sprout',
  '🌳': 'tree',
  tree: 'tree',
  '🔓': 'unlock',
  unlock: 'unlock',
  '🖼️': 'image-plus',
  '🖼': 'image-plus',
  '📹': 'video',
  '🎥': 'video',
  live: 'video',
  video: 'video',
  '🔗': 'link',
  link: 'link',
  '💊': 'pill',
  pill: 'pill',
  '🙂': 'smile',
  smile: 'smile',
  '🌙': 'moon',
  moon: 'moon',
  '📱': 'mobile',
  mobile: 'mobile',
  '🛡️': 'shield',
  '🛡': 'shield',
  shield: 'shield',
  '🧾': 'receipt',
  receipt: 'receipt',
  '👑': 'crown',
  crown: 'crown'
}

const iconMap: Record<string, ShapeNode[]> = {
  chart: [
    { tag: 'line', attrs: { x1: 18, y1: 20, x2: 18, y2: 10 } },
    { tag: 'line', attrs: { x1: 12, y1: 20, x2: 12, y2: 4 } },
    { tag: 'line', attrs: { x1: 6, y1: 20, x2: 6, y2: 14 } }
  ],
  calendar: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 } },
    { tag: 'line', attrs: { x1: 16, y1: 2, x2: 16, y2: 6 } },
    { tag: 'line', attrs: { x1: 8, y1: 2, x2: 8, y2: 6 } },
    { tag: 'line', attrs: { x1: 3, y1: 10, x2: 21, y2: 10 } }
  ],
  megaphone: [
    { tag: 'path', attrs: { d: 'M11 5L6 9H2v6h4l5 4V5z' } },
    { tag: 'path', attrs: { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' } },
    { tag: 'path', attrs: { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' } }
  ],
  volume: [
    { tag: 'polygon', attrs: { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' } },
    { tag: 'path', attrs: { d: 'M15.5 8.5a5 5 0 0 1 0 7' } },
    { tag: 'path', attrs: { d: 'M18.5 5.5a9 9 0 0 1 0 13' } }
  ],
  stethoscope: [
    { tag: 'path', attrs: { d: 'M4.8 3h14.4' } },
    { tag: 'path', attrs: { d: 'M4.8 3v4.8c0 4.8 7.2 4.8 7.2 9.6v1.8' } },
    { tag: 'path', attrs: { d: 'M19.2 3v4.8c0 3.6-3.6 4.8-4.8 6.4' } },
    { tag: 'circle', attrs: { cx: 12, cy: 21, r: 2 } }
  ],
  patient: [
    { tag: 'path', attrs: { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' } },
    { tag: 'circle', attrs: { cx: 9, cy: 7, r: 4 } },
    { tag: 'path', attrs: { d: 'M23 21v-2a4 4 0 0 0-3-3.87' } },
    { tag: 'path', attrs: { d: 'M16 3.13a4 4 0 0 1 0 7.75' } }
  ],
  doctor: [
    { tag: 'rect', attrs: { x: 2, y: 7, width: 20, height: 14, rx: 2, ry: 2 } },
    { tag: 'path', attrs: { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' } }
  ],
  store: [
    { tag: 'path', attrs: { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } },
    { tag: 'polyline', attrs: { points: '9 22 9 12 15 12 15 22' } }
  ],
  box: [
    { tag: 'polyline', attrs: { points: '21 8 21 21 3 21 3 8' } },
    { tag: 'rect', attrs: { x: 1, y: 3, width: 22, height: 5 } },
    { tag: 'line', attrs: { x1: 10, y1: 12, x2: 14, y2: 12 } }
  ],
  money: [
    { tag: 'line', attrs: { x1: 12, y1: 1, x2: 12, y2: 23 } },
    { tag: 'path', attrs: { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' } }
  ],
  team: [
    { tag: 'path', attrs: { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' } },
    { tag: 'circle', attrs: { cx: 9, cy: 7, r: 4 } },
    { tag: 'path', attrs: { d: 'M23 21v-2a4 4 0 0 0-3-3.87' } },
    { tag: 'path', attrs: { d: 'M16 3.13a4 4 0 0 1 0 7.75' } }
  ],
  card: [
    { tag: 'rect', attrs: { x: 1, y: 4, width: 22, height: 16, rx: 2, ry: 2 } },
    { tag: 'line', attrs: { x1: 1, y1: 10, x2: 23, y2: 10 } }
  ],
  bag: [
    { tag: 'path', attrs: { d: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z' } },
    { tag: 'line', attrs: { x1: 3, y1: 6, x2: 21, y2: 6 } },
    { tag: 'path', attrs: { d: 'M16 10a4 4 0 0 1-8 0' } }
  ],
  'file-text': [
    { tag: 'path', attrs: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
    { tag: 'polyline', attrs: { points: '14 2 14 8 20 8' } },
    { tag: 'line', attrs: { x1: 16, y1: 13, x2: 8, y2: 13 } },
    { tag: 'line', attrs: { x1: 16, y1: 17, x2: 8, y2: 17 } },
    { tag: 'polyline', attrs: { points: '10 9 9 9 8 9' } }
  ],
  clipboard: [
    { tag: 'path', attrs: { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' } },
    { tag: 'rect', attrs: { x: 8, y: 2, width: 8, height: 4, rx: 1, ry: 1 } }
  ],
  image: [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 } },
    { tag: 'circle', attrs: { cx: 8.5, cy: 8.5, r: 1.5 } },
    { tag: 'polyline', attrs: { points: '21 15 16 10 5 21' } }
  ],
  video: [
    { tag: 'rect', attrs: { x: 3, y: 6, width: 13, height: 12, rx: 2, ry: 2 } },
    { tag: 'path', attrs: { d: 'M16 10l5-3v10l-5-3z' } }
  ],
  settings: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
    { tag: 'path', attrs: { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' } }
  ],
  lock: [
    { tag: 'rect', attrs: { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 } },
    { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 10 0v4' } }
  ],
  plus: [
    { tag: 'line', attrs: { x1: 12, y1: 5, x2: 12, y2: 19 } },
    { tag: 'line', attrs: { x1: 5, y1: 12, x2: 19, y2: 12 } }
  ],
  search: [
    { tag: 'circle', attrs: { cx: 11, cy: 11, r: 8 } },
    { tag: 'line', attrs: { x1: 21, y1: 21, x2: 16.65, y2: 16.65 } }
  ],
  download: [
    { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
    { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
    { tag: 'line', attrs: { x1: 12, y1: 15, x2: 12, y2: 3 } }
  ],
  print: [
    { tag: 'polyline', attrs: { points: '6 9 6 2 18 2 18 9' } },
    { tag: 'path', attrs: { d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' } },
    { tag: 'rect', attrs: { x: 6, y: 14, width: 12, height: 8 } }
  ],
  edit: [
    { tag: 'path', attrs: { d: 'M12 20h9' } },
    { tag: 'path', attrs: { d: 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z' } }
  ],
  'x-circle': [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'line', attrs: { x1: 9, y1: 9, x2: 15, y2: 15 } },
    { tag: 'line', attrs: { x1: 15, y1: 9, x2: 9, y2: 15 } }
  ],
  'check-circle': [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'polyline', attrs: { points: '9 12 11 14 15 10' } }
  ],
  bell: [
    { tag: 'path', attrs: { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' } },
    { tag: 'path', attrs: { d: 'M13.73 21a2 2 0 0 1-3.46 0' } }
  ],
  phone: [
    { tag: 'path', attrs: { d: 'M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 4.18 2 2 0 0 1 5.06 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.59 2.61a2 2 0 0 1-.45 2.11L9.1 9.91a16 16 0 0 0 5 5l1.47-1.1a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.61.59A2 2 0 0 1 22 16.92z' } }
  ],
  clock: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'polyline', attrs: { points: '12 7 12 12 16 14' } }
  ],
  tag: [
    { tag: 'path', attrs: { d: 'M20.59 13.41 11 23l-9-9 9.59-9.59A2 2 0 0 1 13 4h6a2 2 0 0 1 2 2v6a2 2 0 0 1-.41 1.41Z' } },
    { tag: 'circle', attrs: { cx: 17.5, cy: 6.5, r: 1.5 } }
  ],
  folder: [
    { tag: 'path', attrs: { d: 'M3 7h5l2 3h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z' } }
  ],
  message: [
    { tag: 'path', attrs: { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } }
  ],
  alert: [
    { tag: 'path', attrs: { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' } },
    { tag: 'line', attrs: { x1: 12, y1: 9, x2: 12, y2: 13 } },
    { tag: 'line', attrs: { x1: 12, y1: 17, x2: 12.01, y2: 17 } }
  ],
  lightbulb: [
    { tag: 'path', attrs: { d: 'M9 18h6' } },
    { tag: 'path', attrs: { d: 'M10 22h4' } },
    { tag: 'path', attrs: { d: 'M12 2a7 7 0 0 0-4 12.74V18h8v-3.26A7 7 0 0 0 12 2z' } }
  ],
  tool: [
    { tag: 'path', attrs: { d: 'M14.7 6.3a4 4 0 0 0-5.66 5.66L3 18v3h3l6.04-6.04A4 4 0 0 0 17.7 9.3l-3 3-3-3 3-3z' } }
  ],
  refresh: [
    { tag: 'polyline', attrs: { points: '23 4 23 10 17 10' } },
    { tag: 'polyline', attrs: { points: '1 20 1 14 7 14' } },
    { tag: 'path', attrs: { d: 'M3.51 9a9 9 0 0 1 14.13-3.36L23 10' } },
    { tag: 'path', attrs: { d: 'M20.49 15a9 9 0 0 1-14.13 3.36L1 14' } }
  ],
  truck: [
    { tag: 'rect', attrs: { x: 1, y: 7, width: 12, height: 10 } },
    { tag: 'path', attrs: { d: 'M13 10h4l3 3v4h-7z' } },
    { tag: 'circle', attrs: { cx: 6, cy: 18, r: 2 } },
    { tag: 'circle', attrs: { cx: 18, cy: 18, r: 2 } }
  ],
  pickup: [
    { tag: 'path', attrs: { d: 'M3 7h18l-2 13H5L3 7z' } },
    { tag: 'path', attrs: { d: 'M7 7a5 5 0 0 1 10 0' } }
  ],
  wechat: [
    { tag: 'path', attrs: { d: 'M8.5 6C4.9 6 2 8.5 2 11.6c0 1.8 1 3.4 2.6 4.4L4 19l3.1-1.6c.5.1.9.1 1.4.1 3.6 0 6.5-2.5 6.5-5.6S12.1 6 8.5 6z' } },
    { tag: 'path', attrs: { d: 'M15.5 9c3.6 0 6.5 2.4 6.5 5.4 0 1.7-.9 3.2-2.4 4.2l.4 2.4-2.6-1.3c-.6.1-1.2.2-1.9.2-3.6 0-6.5-2.4-6.5-5.5S11.9 9 15.5 9z' } },
    { tag: 'circle', attrs: { cx: 6.8, cy: 11.4, r: 0.8 } },
    { tag: 'circle', attrs: { cx: 10.2, cy: 11.4, r: 0.8 } },
    { tag: 'circle', attrs: { cx: 14.2, cy: 14.2, r: 0.8 } },
    { tag: 'circle', attrs: { cx: 17.6, cy: 14.2, r: 0.8 } }
  ],
  alipay: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M8 8h8' } },
    { tag: 'path', attrs: { d: 'M10 8v4.5c0 2.5 1.6 3.5 4 3.5' } },
    { tag: 'path', attrs: { d: 'M8 14c1.5.2 3.5-.1 5.5-1.1 1.9-.9 3.2-2.1 4.5-3.9' } }
  ],
  coins: [
    { tag: 'ellipse', attrs: { cx: 12, cy: 6, rx: 6, ry: 3 } },
    { tag: 'path', attrs: { d: 'M6 6v6c0 1.66 2.69 3 6 3s6-1.34 6-3V6' } },
    { tag: 'path', attrs: { d: 'M6 12v6c0 1.66 2.69 3 6 3s6-1.34 6-3v-6' } }
  ],
  save: [
    { tag: 'path', attrs: { d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' } },
    { tag: 'polyline', attrs: { points: '17 21 17 13 7 13 7 21' } },
    { tag: 'polyline', attrs: { points: '7 3 7 8 15 8' } }
  ],
  user: [
    { tag: 'path', attrs: { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' } },
    { tag: 'circle', attrs: { cx: 12, cy: 7, r: 4 } }
  ],
  sunrise: [
    { tag: 'path', attrs: { d: 'M17 18a5 5 0 0 0-10 0' } },
    { tag: 'line', attrs: { x1: 12, y1: 2, x2: 12, y2: 6 } },
    { tag: 'line', attrs: { x1: 4.93, y1: 10.93, x2: 7.76, y2: 8.1 } },
    { tag: 'line', attrs: { x1: 19.07, y1: 10.93, x2: 16.24, y2: 8.1 } },
    { tag: 'line', attrs: { x1: 2, y1: 18, x2: 22, y2: 18 } }
  ],
  sunset: [
    { tag: 'path', attrs: { d: 'M17 18a5 5 0 0 0-10 0' } },
    { tag: 'line', attrs: { x1: 12, y1: 12, x2: 12, y2: 22 } },
    { tag: 'line', attrs: { x1: 4.93, y1: 10.93, x2: 7.76, y2: 8.1 } },
    { tag: 'line', attrs: { x1: 19.07, y1: 10.93, x2: 16.24, y2: 8.1 } },
    { tag: 'line', attrs: { x1: 2, y1: 18, x2: 22, y2: 18 } }
  ],
  gem: [
    { tag: 'polygon', attrs: { points: '6 3 18 3 22 9 12 21 2 9 6 3' } }
  ],
  'medal-gold': [
    { tag: 'path', attrs: { d: 'M8 3h8l-1 6h-6L8 3z' } },
    { tag: 'circle', attrs: { cx: 12, cy: 15, r: 5 } },
    { tag: 'polyline', attrs: { points: '10.5 15 11.5 16 14 13.5' } }
  ],
  'medal-silver': [
    { tag: 'path', attrs: { d: 'M8 3h8l-1 6h-6L8 3z' } },
    { tag: 'circle', attrs: { cx: 12, cy: 15, r: 5 } },
    { tag: 'path', attrs: { d: 'M10.5 14.2c.7-.8 1.4-1.2 2.2-1.2 1.1 0 1.8.6 1.8 1.5 0 .9-.7 1.5-1.7 2.1l-1.3.7h3' } }
  ],
  'medal-bronze': [
    { tag: 'path', attrs: { d: 'M8 3h8l-1 6h-6L8 3z' } },
    { tag: 'circle', attrs: { cx: 12, cy: 15, r: 5 } },
    { tag: 'path', attrs: { d: 'M10.6 13.5h2.1a1.4 1.4 0 1 1 0 2.8h-1.2' } },
    { tag: 'path', attrs: { d: 'M10.6 16.3h1.4a1.4 1.4 0 1 1 0 2.8h-1.4' } }
  ],
  bed: [
    { tag: 'path', attrs: { d: 'M3 12h18v7H3z' } },
    { tag: 'path', attrs: { d: 'M7 12V9a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3' } },
    { tag: 'line', attrs: { x1: 3, y1: 19, x2: 3, y2: 21 } },
    { tag: 'line', attrs: { x1: 21, y1: 19, x2: 21, y2: 21 } }
  ],
  mask: [
    { tag: 'path', attrs: { d: 'M4 9c0 7 3.5 11 8 11s8-4 8-11l-8-4-8 4z' } },
    { tag: 'path', attrs: { d: 'M9 12h6' } },
    { tag: 'path', attrs: { d: 'M4 11 2 9' } },
    { tag: 'path', attrs: { d: 'M20 11 22 9' } }
  ],
  wind: [
    { tag: 'path', attrs: { d: 'M3 8h10a3 3 0 1 0-3-3' } },
    { tag: 'path', attrs: { d: 'M2 13h15a2 2 0 1 1-2 2' } },
    { tag: 'path', attrs: { d: 'M4 18h9a2 2 0 1 0-2 2' } }
  ],
  book: [
    { tag: 'path', attrs: { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' } },
    { tag: 'path', attrs: { d: 'M20 22H6.5A2.5 2.5 0 0 1 4 19.5V4a2 2 0 0 1 2-2h14z' } }
  ],
  history: [
    { tag: 'polyline', attrs: { points: '1 4 1 10 7 10' } },
    { tag: 'path', attrs: { d: 'M3.51 15a9 9 0 1 0 .49-9L1 10' } },
    { tag: 'polyline', attrs: { points: '12 7 12 12 15 15' } }
  ],
  'pen-square': [
    { tag: 'path', attrs: { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' } },
    { tag: 'path', attrs: { d: 'M18.5 2.5a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4Z' } }
  ],
  trophy: [
    { tag: 'path', attrs: { d: 'M8 21h8' } },
    { tag: 'path', attrs: { d: 'M12 17v4' } },
    { tag: 'path', attrs: { d: 'M7 4h10v3a5 5 0 0 1-10 0V4z' } },
    { tag: 'path', attrs: { d: 'M5 6H3a2 2 0 0 0 0 4h2' } },
    { tag: 'path', attrs: { d: 'M19 6h2a2 2 0 0 1 0 4h-2' } }
  ],
  bolt: [
    { tag: 'polygon', attrs: { points: '13 2 3 14 11 14 10 22 20 10 12 10 13 2' } }
  ],
  sprout: [
    { tag: 'path', attrs: { d: 'M7 20c0-6 3-10 5-12' } },
    { tag: 'path', attrs: { d: 'M12 8c-3 0-6-1.5-8-4 0 5 3 8 8 8' } },
    { tag: 'path', attrs: { d: 'M12 8c3 0 6-1.5 8-4 0 5-3 8-8 8' } }
  ],
  tree: [
    { tag: 'path', attrs: { d: 'M12 22V12' } },
    { tag: 'path', attrs: { d: 'M5 12a7 7 0 1 1 14 0Z' } },
    { tag: 'path', attrs: { d: 'M7 12a5 5 0 1 1 10 0' } }
  ],
  unlock: [
    { tag: 'rect', attrs: { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 } },
    { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 9.9-1' } }
  ],
  'image-plus': [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 } },
    { tag: 'circle', attrs: { cx: 8.5, cy: 8.5, r: 1.5 } },
    { tag: 'polyline', attrs: { points: '21 15 16 10 5 21' } },
    { tag: 'line', attrs: { x1: 18, y1: 5, x2: 18, y2: 9 } },
    { tag: 'line', attrs: { x1: 16, y1: 7, x2: 20, y2: 7 } }
  ],
  link: [
    { tag: 'path', attrs: { d: 'M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L10.7 5.2' } },
    { tag: 'path', attrs: { d: 'M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 1 0 7.07 7.07l1.41-1.41' } }
  ],
  pill: [
    { tag: 'path', attrs: { d: 'M10.5 4.5a5 5 0 0 1 7.07 7.07l-3.5 3.5a5 5 0 1 1-7.07-7.07z' } },
    { tag: 'line', attrs: { x1: 8.5, y1: 13.5, x2: 15.5, y2: 6.5 } }
  ],
  smile: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M8 14s1.5 2 4 2 4-2 4-2' } },
    { tag: 'line', attrs: { x1: 9, y1: 10, x2: 9.01, y2: 10 } },
    { tag: 'line', attrs: { x1: 15, y1: 10, x2: 15.01, y2: 10 } }
  ],
  moon: [
    { tag: 'path', attrs: { d: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z' } }
  ],
  mobile: [
    { tag: 'rect', attrs: { x: 7, y: 2, width: 10, height: 20, rx: 2, ry: 2 } },
    { tag: 'line', attrs: { x1: 12, y1: 18, x2: 12.01, y2: 18 } }
  ],
  shield: [
    { tag: 'path', attrs: { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' } }
  ],
  receipt: [
    { tag: 'path', attrs: { d: 'M6 2h12v20l-3-2-3 2-3-2-3 2V2z' } },
    { tag: 'line', attrs: { x1: 9, y1: 7, x2: 15, y2: 7 } },
    { tag: 'line', attrs: { x1: 9, y1: 11, x2: 15, y2: 11 } },
    { tag: 'line', attrs: { x1: 9, y1: 15, x2: 13, y2: 15 } }
  ],
  crown: [
    { tag: 'path', attrs: { d: 'M3 18h18l-2-10-5 4-4-6-4 6-5-4-2 10z' } }
  ]
}

const resolvedName = computed(() => aliases[props.name] || props.name || 'file-text')
const nodes = computed(() => iconMap[resolvedName.value] || iconMap['file-text'])
</script>

<template>
  <svg
    v-bind="attrs"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    style="display: inline-flex; vertical-align: middle; flex-shrink: 0;"
  >
    <component
      :is="node.tag"
      v-for="(node, index) in nodes"
      :key="index"
      v-bind="node.attrs"
    />
  </svg>
</template>
