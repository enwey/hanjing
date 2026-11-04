import { readFileSync } from 'node:fs';
export const permissionCatalog = JSON.parse(readFileSync(new URL('./admin-permission-catalog.json', import.meta.url), 'utf8'));
export const permissionCodes = new Set(permissionCatalog.flatMap(g => g.actions.map(a => a.code)));
export function migratePermissionCodes(old, roleCode) {
  const has = p => old.includes(p);
  const result = new Set(old.filter(p => permissionCodes.has(p)));
  result.add('dashboard:view');
  if (has('schedule:view')) result.add('doctor:view');
  const legacy = { queue:'appointment', workbench:'appointment', fulfillment:'order', after_sales:'order', promoter:'distribution', withdraw:'distribution', product:'distribution', product_category:'distribution', content_category:'content', live:'content', banner:'content', mini_log:'audit_log' };
  const protectedModules = ['settings','wechat_notification','member','role','database'];
  for (const group of permissionCatalog) {
    if (protectedModules.includes(group.module)) continue; // These operations were super-admin only.
    const source = legacy[group.module] || group.module;
    for (const action of group.actions) {
      const verb = action.code.slice(group.module.length + 1);
      let allowed = has(source + ':' + (verb === 'view' ? 'view' : ['add','edit','delete','audit'].includes(verb) ? verb : 'edit'));
      if (['product','product_category'].includes(group.module)) allowed = has('distribution:' + (verb === 'view' ? 'view' : 'edit'));
      if (['order','fulfillment','after_sales'].includes(group.module) && verb !== 'view') allowed = verb !== 'refund' && has('order:edit');
      if (group.module === 'withdraw') allowed = has('distribution:' + (verb === 'view' || verb === 'account' ? 'view' : 'audit'));
      if (group.module === 'workbench') allowed = has('appointment:edit');
      if (group.module === 'schedule' && ['edit','copy'].includes(verb)) allowed = has('schedule:add') || has('schedule:edit');
      if (action.code === 'appointment:export') allowed = has('appointment:view');
      if (action.code === 'patient:export') allowed = has('patient:view');
      if (action.code === 'patient:phone:view') allowed = ['doctor','store_mgr'].includes(roleCode) && has('patient:view');
      if (action.code === 'appointment:refund') allowed = false;
      if (allowed) result.add(action.code);
    }
  }
  return [...result];
}
export async function migrateAdminPermissions(query, transaction) {
  await query('CREATE TABLE IF NOT EXISTS app_migrations (name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  await transaction(async conn => {
    const [done] = await conn.execute('SELECT name FROM app_migrations WHERE name=? FOR UPDATE',['admin-granular-permissions-v1']);
    if (done.length) return;
    const [roles] = await conn.execute('SELECT id,code FROM roles FOR UPDATE');
    for (const role of roles) {
      const [rows] = await conn.execute('SELECT permission_resource FROM permissions WHERE role_id=?',[role.id]);
      const codes = migratePermissionCodes(rows.map(r=>r.permission_resource),role.code);
      await conn.execute('DELETE FROM permissions WHERE role_id=?',[role.id]);
      for(const code of codes) await conn.execute('INSERT INTO permissions(role_id,permission_resource) VALUES (?,?)',[role.id,code]);
    }
    await conn.execute('INSERT INTO app_migrations(name) VALUES (?)',['admin-granular-permissions-v1']);
  });
}
