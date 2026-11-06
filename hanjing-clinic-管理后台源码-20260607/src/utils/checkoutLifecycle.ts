export interface CheckoutAttempt {
  readonly identity: string
  orderId: string | null
}

export function createCheckoutLifecycle(identity: () => string) {
  let active: CheckoutAttempt | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pollVersion = 0
  const isCurrent = (attempt: CheckoutAttempt | null): attempt is CheckoutAttempt =>
    !!attempt && active === attempt && attempt.identity === identity()
  function stopPolling() {
    pollVersion++
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function invalidate() { stopPolling(); active = null }
  return {
    isCurrent, stopPolling, invalidate,
    capture: () => active,
    begin() {
      invalidate()
      active = { identity: identity(), orderId: null }
      return active
    },
    bindOrder(attempt: CheckoutAttempt | null, orderId: number | string) {
      if (!isCurrent(attempt) || !orderId) return false
      const id = String(orderId)
      if (attempt.orderId && attempt.orderId !== id) throw new Error('收银会话与原订单不一致，请核对原付款单')
      attempt.orderId = id
      return true
    },
    poll(attempt: CheckoutAttempt | null, task: (isActive: () => boolean) => Promise<void>, delay = 2000) {
      if (!isCurrent(attempt)) return
      stopPolling()
      const version = pollVersion
      const isActive = () => isCurrent(attempt) && version === pollVersion
      const tick = async () => {
        if (!isActive()) return
        try { await task(isActive) }
        finally {
          // Schedule only after completion: slow responses cannot overlap or revive old polling.
          if (isActive()) timer = setTimeout(tick, delay)
        }
      }
      timer = setTimeout(tick, delay)
    }
  }
}
