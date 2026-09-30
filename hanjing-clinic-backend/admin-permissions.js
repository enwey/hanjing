export function requiredAdminPermissions(method, route) {
  const path = String(route || '').replace(/^\/api\/admin\//, '');
  if (['me', 'profile', 'change-password'].includes(path)) return [];
  const read = method === 'GET' || method === 'HEAD';
  let module;
  if (/^(patients\/[^/]+\/(medical-records|treatment|follow-ups|sleep-diagnostics)|assessments)/.test(path) || /consultation/.test(path)) module = 'medical_record';
  else if (/^(appointments|queue)/.test(path)) module = 'appointment';
  else if (/^(patients|im)/.test(path)) module = 'patient';
  else if (/^(schedules|day-slots)/.test(path)) module = 'schedule';
  else if (/^doctors/.test(path)) module = 'doctor';
  else if (/^(stores|reports\/store)/.test(path)) module = 'store';
  else if (/^(orders|pay)/.test(path)) module = 'order';
  else if (/^(distribution|products|product-categories)/.test(path)) module = 'distribution';
  else if (/^content/.test(path)) module = 'content';
  else if (/^(logs|mini-program-logs)/.test(path)) module = 'audit_log';
  else if (/^(settings|users|roles|database|admin-users)/.test(path)) module = 'system';
  else if (/^global-search/.test(path)) return ['patient:view', 'appointment:view', 'order:view'];
  else if (/^notifications/.test(path)) return [];
  else if (/^dashboard/.test(path)) return ['system:view'];
  else if (/^uploads\/images/.test(path)) return ['content:edit', 'distribution:edit', 'store:edit', 'doctor:edit'];
  else if (/^uploads\/files/.test(path)) return ['medical_record:edit'];
  else return null;
  let action = read ? 'view' : method === 'DELETE' ? 'delete' : method === 'POST' && !path.includes(':') ? 'add' : 'edit';
  if (/^products|^product-categories/.test(path)) action = read ? 'view' : 'edit';
  if (/^orders|^pay/.test(path) && !read) action = 'edit';
  if (/^im\//.test(path) && !read) action = 'edit';
  if (/distribution\/withdraws/.test(path) && !read) action = 'audit';
  return [`${module}:${action}`];
}

export function hasAdminPermission(user, required) {
  if (user.role === 'super_admin') return true;
  if (required === null) return false;
  return required.length === 0 || required.some(p => user.permissions?.includes(p));
}
