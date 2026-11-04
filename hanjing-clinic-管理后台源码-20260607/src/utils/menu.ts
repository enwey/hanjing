import { permissionCatalog as catalog } from './permissionCatalog'
export interface MenuItem { path: string; label: string; icon: string; permission: string; requiredPermissions?: string[]; badge?: string; badgeColor?: string; superAdminOnly?: boolean }
export function getMenuGroups(activeCount = 0, withdrawCount = 0): Array<{ title: string; items: MenuItem[] }> {
  const groups = [
    { title: '概览', modules: ['dashboard'] },
    { title: '业务管理', modules: ['appointment','queue','workbench','patient','doctor','store','order','fulfillment','after_sales'] },
    { title: '分销管理', modules: ['distribution','promoter','withdraw','product','product_category'] },
    { title: '内容', modules: ['content','content_category','live','banner'] },
    { title: '系统', modules: ['settings','wechat_notification','member','role','audit_log','mini_log','database'] }
  ]
  const icons: Record<string,string> = { dashboard:'📊',appointment:'📅',queue:'📣',workbench:'🩺',patient:'🧑‍⚕️',doctor:'👨‍⚕️',store:'🏥',order:'📦',fulfillment:'🧰',after_sales:'🛠️',distribution:'💰',promoter:'👥',withdraw:'💳',product:'🛍️',product_category:'🏷️',content:'📝',content_category:'🏷️',live:'video',banner:'🎨',settings:'⚙️',wechat_notification:'bell',member:'team',role:'🔐',audit_log:'📋',mini_log:'📱',database:'🗄️' }
  return groups.map(group => ({title:group.title,items:group.modules.filter(module => catalog.some(entry => entry.module === module)).map(module => {
    const entry = catalog.find(g => g.module === module)!
    const count = module === 'appointment' ? activeCount : module === 'withdraw' ? withdrawCount : 0
    return { path:entry.path,label:entry.label,icon:icons[module],permission:module+':view',badge:count>0?String(count):undefined,badgeColor:module==='withdraw'?'gold':'red' }
  })}))
}

export function visibleMenuGroups(user: any, groups = getMenuGroups()) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : []
  const superAdmin = user?.role_code === 'super_admin'
  return groups.map(group => ({ ...group, items: group.items.filter(item =>
    superAdmin || (!item.superAdminOnly && (!item.permission || permissions.includes(item.permission)) && (item.requiredPermissions || []).every(p => permissions.includes(p)))
  ) })).filter(group => group.items.length)
}
export function firstMenuPath(user: any) {
  return visibleMenuGroups(user)[0]?.items[0]?.path || '/profile'
}
export function storedFirstMenuPath() {
  try { return firstMenuPath(JSON.parse(localStorage.getItem('user_info') || '{}')) }
  catch { return firstMenuPath({}) }
}
