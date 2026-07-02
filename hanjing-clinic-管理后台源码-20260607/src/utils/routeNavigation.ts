import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'

const MENU_ROOTS = [
  '/dashboard',
  '/appointment',
  '/queue',
  '/workbench',
  '/patient',
  '/doctor',
  '/store',
  '/order',
  '/distribution',
  '/promoter',
  '/withdraw',
  '/products',
  '/content',
  '/live',
  '/banner',
  '/settings',
  '/permission',
  '/log'
]

function resolvePathPattern(pathPattern: string, params: Record<string, any>) {
  let resolved = pathPattern
  for (const [key, value] of Object.entries(params || {})) {
    resolved = resolved.replace(`:${key}`, String(value))
  }
  return resolved
}

function findRouteByPath(router: Router, targetPath: string) {
  const routes = router.getRoutes()
  let matched = routes.find(route => route.path === targetPath)
  if (matched) return matched

  try {
    const resolved = router.resolve(targetPath)
    if (resolved.matched.length > 0) {
      return resolved.matched[resolved.matched.length - 1]
    }
  } catch (error) {
    // ignore
  }

  for (const route of routes) {
    const regexPattern = '^' + route.path.replace(/\/:[^/]+/g, '/[^/]+') + '$'
    if (new RegExp(regexPattern).test(targetPath)) {
      return route
    }
  }

  return null
}

function resolveBaseMenuPath(path: string) {
  let bestMatch = ''
  for (const root of MENU_ROOTS) {
    if (path === root || path.startsWith(`${root}/`)) {
      if (root.length > bestMatch.length) {
        bestMatch = root
      }
    }
  }
  return bestMatch || '/dashboard'
}

export function buildRouteNavigationQuery(route: RouteLocationNormalizedLoaded, overrides: Record<string, any> = {}) {
  const currentMenu = typeof route.query.menu === 'string'
    ? route.query.menu
    : resolveMenuPathFromRoute(route)

  return {
    ...overrides,
    from: route.fullPath,
    menu: currentMenu
  }
}

export function resolveMenuPathFromRoute(route: RouteLocationNormalizedLoaded) {
  if (typeof route.query.menu === 'string' && route.query.menu) {
    return route.query.menu
  }

  return resolveBaseMenuPath(route.path)
}

export function resolveParentPath(router: Router, route: RouteLocationNormalizedLoaded) {
  const currentRecord = router.getRoutes().find(item => item.name === route.name) || findRouteByPath(router, route.path)
  const parentPathPattern = currentRecord?.meta?.parentPath as string | undefined
  if (parentPathPattern) {
    return resolvePathPattern(parentPathPattern, route.params)
  }

  if (typeof route.query.from === 'string' && route.query.from) {
    return route.query.from
  }

  return null
}

export function navigateToParent(router: Router, route: RouteLocationNormalizedLoaded, fallback = '/dashboard') {
  const target = resolveParentPath(router, route) || fallback
  router.push(target)
}

function buildBreadcrumbChain(router: Router, path: string, currentRoute: RouteLocationNormalizedLoaded) {
  const items: Array<{ label: string; path: string }> = []
  const visited = new Set<string>()
  let currentPath = path
  let currentRecord = findRouteByPath(router, currentPath)
  let depth = 0

  while (currentPath && currentPath !== '/' && depth < 12 && !visited.has(currentPath)) {
    visited.add(currentPath)
    depth += 1

    const title = currentRecord?.meta?.title as string | undefined
    if (title && title !== '登录') {
      items.unshift({ label: title, path: currentPath })
    }

    const parentPathPattern = currentRecord?.meta?.parentPath as string | undefined
    if (!parentPathPattern) break

    currentPath = resolvePathPattern(parentPathPattern, currentRoute.params)
    currentRecord = findRouteByPath(router, currentPath)
  }

  return items
}

function buildBreadcrumbsFromRouteSnapshot(
  router: Router,
  routeSnapshot: RouteLocationNormalizedLoaded,
  visited: Set<string>
) {
  const uniqueKey = routeSnapshot.fullPath || routeSnapshot.path
  if (!uniqueKey || visited.has(uniqueKey)) {
    return []
  }

  visited.add(uniqueKey)

  const currentRecord = router.getRoutes().find(item => item.name === routeSnapshot.name) || findRouteByPath(router, routeSnapshot.path)
  const hasLogicalParent = currentRecord?.meta?.parentPath

  const parentFullPath = (!hasLogicalParent && typeof routeSnapshot.query.from === 'string') ? routeSnapshot.query.from : ''
  const parentItems = parentFullPath
    ? buildBreadcrumbsFromRouteSnapshot(router, router.resolve(parentFullPath), visited)
    : buildBreadcrumbChain(router, routeSnapshot.path, routeSnapshot)

  const currentTitle = routeSnapshot.meta?.title as string | undefined
  if (!currentTitle || currentTitle === '登录') {
    return parentItems
  }

  const currentPath = routeSnapshot.path
  if (parentItems.some(item => item.path === currentPath)) {
    return parentItems
  }

  return [...parentItems, { label: currentTitle, path: currentPath }]
}

export function resolveBreadcrumbs(router: Router, route: RouteLocationNormalizedLoaded) {
  if (route.name === 'login') return []

  const items: Array<{ label: string; path: string }> = [{ label: '首页', path: '/dashboard' }]
  items.push(...buildBreadcrumbsFromRouteSnapshot(router, route, new Set()))

  const uniqueItems: Array<{ label: string; path: string }> = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!seen.has(item.path)) {
      seen.add(item.path)
      uniqueItems.push(item)
    }
  }

  return uniqueItems
}
