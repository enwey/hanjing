import fullCatalog from '../../../hanjing-clinic-backend/admin-permission-catalog.json'

// 暂未开放的运营功能保留实现和历史授权，不展示或提供页面入口。
const deferredModules = new Set(['live', 'banner'])
export const permissionCatalog = fullCatalog.filter(group => !deferredModules.has(group.module))
export { fullCatalog }
