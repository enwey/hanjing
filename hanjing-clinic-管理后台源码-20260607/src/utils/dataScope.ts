export interface DataScope { type: 'self' | 'store' | 'system'; all_stores: boolean; store_ids: number[] }
export const personalScope = (): DataScope => ({ type: 'self', all_stores: false, store_ids: [] })
export function scopeLabel(scope?: DataScope | null, stores: Array<{ id: string | number; name: string }> = []) {
  if (!scope || scope.type === 'self') return '个人数据'
  if (scope.type === 'system') return '系统数据'
  if (scope.all_stores) return '门店数据 · 全部门店'
  return '门店数据 · ' + scope.store_ids.map(id => stores.find(store => Number(store.id) === Number(id))?.name || `门店 ${id}`).join('、')
}
