// UI checks prevent requests for unavailable features. The API remains authoritative.
export function hasPermission(permission: string): boolean {
  try {
    const user = JSON.parse(localStorage.getItem('user_info') || '{}')
    return user.role_code === 'super_admin' || user.role === 'super_admin' ||
      (Array.isArray(user.permissions) && user.permissions.includes(permission))
  } catch { return false }
}
export function isSuperAdmin(): boolean {
  try { const user = JSON.parse(localStorage.getItem('user_info') || '{}'); return (user.role_code || user.role) === 'super_admin' }
  catch { return false }
}
