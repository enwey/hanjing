const TOKEN_KEY = 'promoter_auth_token'
const USER_KEY = 'promoter_user_info'

export const getPromoterToken = () => localStorage.getItem(TOKEN_KEY) || ''

export const setPromoterAuth = (token: string, user: unknown) => {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}))
}

export const clearPromoterAuth = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export const getPromoterUser = () => {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
