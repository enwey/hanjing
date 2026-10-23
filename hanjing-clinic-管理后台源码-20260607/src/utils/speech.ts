const MANDARIN_NAME_HINTS = [
  'mandarin',
  '普通话',
  '国语',
  'xiaoxiao',
  'xiaoyi',
  'yunxi',
  'yunyang',
  'huihui',
  'kangkang'
]

const isCantoneseVoice = (voice: SpeechSynthesisVoice) => {
  const lang = voice.lang.toLowerCase()
  const name = voice.name.toLowerCase()
  return /^(yue|zh-(hk|mo|tw))\b/.test(lang) || name.includes('cantonese') || name.includes('粤语')
}

const findMandarinVoice = (voices: SpeechSynthesisVoice[]) => {
  const candidates = voices.filter(voice => !isCantoneseVoice(voice))
  return candidates.find(voice => voice.lang.toLowerCase() === 'zh-cn')
    || candidates.find(voice => voice.lang.toLowerCase() === 'zh-sg')
    || candidates.find(voice => {
      const name = voice.name.toLowerCase()
      return MANDARIN_NAME_HINTS.some(hint => name.includes(hint))
    })
}

export const speakMandarin = (text: string, rate = 0.9) => {
  if (!('speechSynthesis' in window)) return false

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate

  const voice = findMandarinVoice(window.speechSynthesis.getVoices())
  if (voice) utterance.voice = voice

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}
