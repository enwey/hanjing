import type { Directive } from 'vue'
import { hasPermission } from '@/utils/permission'
type Requirement = string | string[] | { any: string[] }
function update(el: HTMLElement, binding: { value: Requirement }) {
  const value = binding.value
  const allowed = typeof value === 'object' && !Array.isArray(value) ? value.any.some(hasPermission) : (Array.isArray(value) ? value : [value]).every(hasPermission)
  el.hidden = !allowed
  if (!allowed) el.style.setProperty('display', 'none', 'important')
  else if (el.dataset.permissionHidden) el.style.removeProperty('display')
  el.dataset.permissionHidden = allowed ? '' : '1'
}
export const permission: Directive<HTMLElement, Requirement> = { mounted: update, updated: update }
