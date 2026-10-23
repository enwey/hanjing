const normalizeLang = (lang: string): string => {
  return (lang || '').toLowerCase().replace(/_/g, '-')
}

/**
 * 判断是否为粤语/香港/澳门方言语音
 */
export const isCantoneseVoice = (voice: SpeechSynthesisVoice): boolean => {
  const lang = normalizeLang(voice.lang)
  const name = (voice.name || '').toLowerCase()

  if (
    lang.startsWith('yue') ||
    lang.startsWith('zh-hk') ||
    lang.startsWith('zh-mo') ||
    lang.startsWith('zh-yue')
  ) {
    return true
  }

  const cantoneseHints = [
    'cantonese',
    '粤语',
    '粵語',
    '廣東話',
    '广东话',
    'sinji',
    'sin-ji',
    'hiugaai',
    'hiumaan',
    'wanlung',
    'danny',
    'tracy',
    'hong kong',
    'hongkong'
  ]

  return cantoneseHints.some(hint => name.includes(hint))
}

const MANDARIN_KEYWORDS = [
  '普通话',
  'mandarin',
  'xiaoxiao',
  '晓晓',
  'yunxi',
  '云希',
  'tingting',
  '婷婷',
  'xiaoyi',
  '晓伊',
  'yunyang',
  '云扬',
  'huihui',
  '慧慧',
  'yaoyao',
  '瑶瑶',
  'kangkang',
  '康康',
  'reed',
  'flo',
  'eddy',
  'rocko',
  'sandy',
  'shelley',
  'grandma',
  'grandpa',
  'yushu',
  'yu-shu',
  'limu',
  'li-mu',
  '国语',
  '國語',
  'meijia',
  '美佳',
  'hanhan',
  'zhiwei'
]

/**
 * 为语音进行普通话匹配打分，分值越高表示越纯正的普通话音色
 * 粤语直接返回 -9999
 */
export const rateMandarinVoice = (voice: SpeechSynthesisVoice): number => {
  if (isCantoneseVoice(voice)) return -9999

  const lang = normalizeLang(voice.lang)
  const name = (voice.name || '').toLowerCase()

  let score = 0

  // 1. 语言代码权重
  if (
    lang === 'zh-cn' ||
    lang === 'zh-hans-cn' ||
    lang === 'cmn-hans-cn' ||
    lang === 'cmn-cn'
  ) {
    score += 1000
  } else if (
    lang.startsWith('zh-cn') ||
    lang.startsWith('zh-hans') ||
    lang.startsWith('cmn')
  ) {
    score += 800
  } else if (lang === 'zh-sg' || lang.startsWith('zh-sg')) {
    score += 600
  } else if (lang === 'zh-tw' || lang.startsWith('zh-tw') || lang.startsWith('zh-hant')) {
    score += 400
  } else if (lang.startsWith('zh')) {
    score += 200
  } else {
    // 语言代码不以 zh 开头，检查名称是否包含普通话特征
    const hasMandarinKeyword = MANDARIN_KEYWORDS.some(k => name.includes(k))
    if (!hasMandarinKeyword) return -100
    score += 100
  }

  // 2. 名称特征加分
  if (name.includes('普通话') || name.includes('mandarin')) {
    score += 500
  }
  if (name.includes('tingting') || name.includes('婷婷') || name.includes('xiaoxiao') || name.includes('yunxi')) {
    score += 300
  }
  if (name.includes('natural') || name.includes('online')) {
    score += 80
  }

  return score
}

/**
 * 在所有可用语音中挑选最佳普通话音色
 */
export const findMandarinVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (!voices || voices.length === 0) return null

  let bestVoice: SpeechSynthesisVoice | null = null
  let highestScore = 0

  for (const voice of voices) {
    const score = rateMandarinVoice(voice)
    if (score > highestScore) {
      highestScore = score
      bestVoice = voice
    }
  }

  return bestVoice
}

let cachedVoices: SpeechSynthesisVoice[] = []

const refreshVoices = (): SpeechSynthesisVoice[] => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const list = window.speechSynthesis.getVoices()
    if (list && list.length > 0) {
      cachedVoices = list
    }
  }
  return cachedVoices
}

// 模块加载时立即初始化预加载
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices()
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      refreshVoices()
    }
  }
}

export const speakMandarin = (text: string, rate = 0.95): boolean => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false

  // 叫号前取消尚未播完的旧语音，避免连续点击堆叠
  window.speechSynthesis.cancel()

  const executeSpeech = (voices: SpeechSynthesisVoice[]) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    utterance.pitch = 1.0

    const voice = findMandarinVoice(voices)
    if (voice) {
      utterance.voice = voice
    }
    window.speechSynthesis.speak(utterance)
  }

  const currentVoices = refreshVoices()

  if (currentVoices.length > 0) {
    executeSpeech(currentVoices)
  } else {
    // 部分 Chromium 浏览器初次调用 getVoices() 时异步返回空列表，在此做短延迟容错
    let executed = false
    const handleVoices = () => {
      if (executed) return
      executed = true
      const freshList = refreshVoices()
      executeSpeech(freshList.length > 0 ? freshList : window.speechSynthesis.getVoices())
    }

    const prevOnVoices = window.speechSynthesis.onvoiceschanged
    window.speechSynthesis.onvoiceschanged = (e) => {
      if (typeof prevOnVoices === 'function') prevOnVoices.call(window.speechSynthesis, e)
      handleVoices()
    }

    setTimeout(() => {
      if (!executed) {
        executed = true
        const freshList = refreshVoices()
        executeSpeech(freshList.length > 0 ? freshList : window.speechSynthesis.getVoices())
      }
    }, 150)
  }

  return true
}
