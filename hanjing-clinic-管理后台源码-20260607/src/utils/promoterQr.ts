// Keep the WeChat code's data ring and finder marks untouched.
export async function brandPromoterQr(source: string): Promise<string> {
  const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    const timer = window.setTimeout(() => reject(new Error('小程序码图片加载超时')), 15000)
    img.onload = () => { window.clearTimeout(timer); resolve(img) }
    img.onerror = () => { window.clearTimeout(timer); reject(new Error('小程序码图片加载失败')) }
    img.src = url
  })
  if (!/^data:image\/(png|jpeg);base64,/.test(source)) throw new Error('小程序码图片格式无效')
  const [qr, logo] = await Promise.all([load(source), load(import.meta.env.BASE_URL + 'brand-logo.png')])
  if (!qr.naturalWidth || qr.naturalWidth !== qr.naturalHeight) throw new Error('小程序码尺寸无效')
  const canvas = document.createElement('canvas')
  canvas.width = qr.naturalWidth; canvas.height = qr.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成品牌小程序码')
  context.drawImage(qr, 0, 0)
  // The 430px unlimited WeChat code has a central ~190px avatar disc.
  const size = canvas.width * 0.44, offset = (canvas.width - size) / 2
  context.save()
  context.beginPath(); context.arc(canvas.width / 2, canvas.height / 2, size / 2, 0, Math.PI * 2); context.clip()
  context.fillStyle = '#ffffff'; context.fillRect(offset, offset, size, size)
  context.drawImage(logo, offset, offset, size, size)
  context.restore()
  return canvas.toDataURL('image/png')
}
