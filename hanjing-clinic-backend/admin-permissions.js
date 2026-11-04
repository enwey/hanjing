// Arrays mean any-of; objects combine all-of and any-of. Never infer actions from role names.
export function requiredAdminPermissions(method, route, context = {}) {
  const path = String(route || '').replace(/^\/api\/admin\//, '').split('?')[0];
  const read = ['GET', 'HEAD'].includes(method.toUpperCase());
  const body = context.body || {}, query = context.query || {};
  const has = key => Object.hasOwn(body, key);
  const all = (...codes) => ({ all: [...new Set(codes)] });
  const crud = module => [module + ':' + (read ? 'view' : method === 'DELETE' ? 'delete' : method === 'POST' ? 'add' : 'edit')];
  if (['me', 'profile', 'change-password', 'logout'].includes(path)) return [];
  if (path === 'global-search') return ['patient:view', 'appointment:view', 'order:view'];
  if (path === 'notifications/stats') return [];
  if (/^dashboard\//.test(path)) return ['dashboard:view'];
  if (read && /^appointments\/options\/(stores|doctors|booking-settings|schedules|day-slots)$/.test(path)) return ['appointment:view','appointment:add','appointment:reschedule','queue:view','workbench:view'];
  if (read && /^schedules\/options\/(stores|doctors)$/.test(path)) return ['schedule:view','schedule:edit','schedule:copy'];
  if (read && /^doctors\/options\//.test(path)) return ['doctor:view','doctor:add','doctor:edit'];
  if (path === 'products/options/categories') return ['product:view','product:add','product:edit'];
  if (path === 'content/options/categories') return ['content:view','content:add','content:edit'];
  if (path === 'members/options/doctors') return ['member:view','member:add','member:edit'];
  if (path === 'after-sales/options/cases') return ['after_sales:add'];
  if (path === 'after-sales/options/technicians') return ['after_sales:view','after_sales:add','after_sales:edit'];
  if (path === 'patients/registration-stores') return ['patient:add'];
  if (path === 'patients/options/followers') return ['patient:view','medical_record:view','medical_record:followup'];
  if (path === 'appointments/options/products') return ['medical_record:view'];
  if (['orders/options/products','orders/options/patients','orders/cashier-stores'].includes(path)) return ['order:add','order:charge','order:view'];
  if (path === 'content/options/products') return ['content:add','content:edit','live:add','live:edit'];
  if (/^appointments(?:\/|$)/.test(path)) {
    if (/\/charges/.test(path)) {
      if (/\/(refund|refund-sync)$/.test(path)) return ['appointment:refund'];
      return read ? ['appointment:view','queue:view','workbench:view'] : ['appointment:charge'];
    }
    if (/\/pre-exam$/.test(path)) return read ? ['appointment:view','queue:view','workbench:view'] : ['appointment:preexam'];
    if (/\/save-consultation$/.test(path)) return ['medical_record:edit'];
    if (/\/complete-consultation$/.test(path)) return ['medical_record:complete'];
    if (/\/postpone$/.test(path)) return ['appointment:postpone'];
    if (read) return query.is_export ? all('appointment:view','appointment:export') : ['appointment:view','queue:view','workbench:view'];
    if (method === 'POST') return ['appointment:add'];
    const codes = [];
    if (['date','time','period','doctor_id','store_id'].some(has)) codes.push('appointment:reschedule');
    if (has('cancel_reason') || body.status === 'cancelled') codes.push('appointment:cancel');
    if (has('status') && body.status !== 'cancelled') {
      if (['confirmed','waiting'].includes(body.status)) return { all: [...codes, ...(has('symptom_desc') ? ['appointment:edit'] : [])], any: ['appointment:checkin','queue:checkin','workbench:receive','appointment:receive'] };
      if (['checked_in','consulting','in_progress','in_consultation'].includes(body.status)) return { all: [...codes, ...(has('symptom_desc') ? ['appointment:edit'] : [])], any: ['appointment:receive','workbench:receive'] };
      if (['called','calling'].includes(body.status)) codes.push('queue:call');
      else if (body.status === 'completed') codes.push('medical_record:complete');
      else codes.push('appointment:edit');
    }
    if (has('symptom_desc') || !codes.length) codes.push('appointment:edit');
    return all(...codes);
  }
  if (/^patients\/[^/]+\/phone$/.test(path)) return ['patient:phone:view'];
  if (/^patients\/[^/]+\/bind-promoter$/.test(path)) return ['patient:bind_promoter'];
  if (/^patients\/[^/]+\/crm-records$/.test(path)) return [read ? 'patient:view' : 'patient:crm'];
  if (/^patients\/[^/]+\/(medical-records|treatment|follow-ups|sleep-diagnostics)/.test(path) || /^assessments/.test(path)) {
    if (read) return ['medical_record:view'];
    return [/attachments/.test(path) ? 'medical_record:attachment' : /follow-ups/.test(path) ? 'medical_record:followup' : /adjustments/.test(path) ? 'medical_record:adjustment' : /treatment/.test(path) ? 'medical_record:treatment' : 'medical_record:edit'];
  }
  if (/^im\//.test(path)) return [read ? 'patient:view' : 'patient:message'];
  if (/^patients(?:\/|$)/.test(path)) return read && query.is_export ? all('patient:view','patient:export') : crud('patient');
  if (/^(schedules|day-slots)/.test(path)) return [read ? 'schedule:view' : /copy-last-month/.test(path) ? 'schedule:copy' : 'schedule:edit'];
  if (/^doctors/.test(path)) return crud('doctor');
  if (path === 'reports/store') return ['store:report'];
  if (/^stores/.test(path)) return crud('store');
  if (/^fulfillment\//.test(path)) {
    if (read) return path === 'fulfillment/technicians' ? ['fulfillment:view','order:add'] : ['fulfillment:view'];
    const action = /\/assign$/.test(path) ? 'assign' : /mold-files/.test(path) ? 'attachment' : /\/mold$/.test(path) ? 'mold' : /\/(ship|mold-shipment)$/.test(path) ? 'ship' : /\/cancel$/.test(path) ? 'cancel' : /\/progress$/.test(path) ? 'progress' : /device-receipt$/.test(path) ? 'receipt' : /notify-fitting$/.test(path) ? 'notify' : /\/fitting$/.test(path) ? 'fitting' : /batches$/.test(path) ? 'batch' : 'add';
    return ['fulfillment:' + action];
  }
  if (/^after-sales-tickets/.test(path)) return crud('after_sales');
  if (/^orders\/[^/]+\/invoice$/.test(path)) return null; // The real invoicing service is not enabled.
  if (/^(orders|pay)(?:\/|$)/.test(path)) {
    if (path === 'orders' && method === 'POST' && (['cash','bank'].includes(body.pay_method) || body.payment_confirmed === true)) return all('order:add','order:charge');
    if (read) return ['order:view'];
    return ['order:' + (/refund/.test(path) ? 'refund' : /\/ship$/.test(path) ? 'ship' : /\/complete$/.test(path) ? 'complete' : /\/notify$/.test(path) ? 'notify' : /\/invoice$/.test(path) ? 'invoice' : /\/cancel$/.test(path) ? 'cancel_payment' : path === 'orders' ? 'add' : 'charge')];
  }
  if (/^distribution\/promoters/.test(path)) return /\/qr$/.test(path) ? ['promoter:qr'] : /\/password$/.test(path) ? ['promoter:password'] : /\/status$/.test(path) ? ['promoter:status'] : crud('promoter');
  if (/^distribution\/withdraws/.test(path)) return [/\/account$/.test(path) ? 'withdraw:account' : read ? 'withdraw:view' : /\/paid$/.test(path) ? 'withdraw:paid' : 'withdraw:audit'];
  if (/^distribution\//.test(path)) return ['distribution:view'];
  if (/^product-categories/.test(path)) return crud('product_category');
  if (/^products/.test(path)) {
    if (method !== 'PUT') return crud('product');
    const codes = [];
    if (has('status')) codes.push('product:status');
    if (has('is_distribution') || has('backend_referral_enabled')) codes.push('product:promotion');
    if (Object.keys(body).some(k => !['status','is_distribution','backend_referral_enabled'].includes(k)) || !codes.length) codes.push('product:edit');
    return all(...codes);
  }
  if (/^content\/categories/.test(path)) return crud('content_category');
  if (/^content\/banners/.test(path)) return crud('banner');
  if (/^content\/live-rooms/.test(path)) return /sync-wechat$/.test(path) ? ['live:sync'] : crud('live');
  if (path === 'content/article-authors') return ['content:add','content:edit'];
  if (/^content\/(articles|qa)/.test(path)) {
    if (has('status') && ['approved','rejected'].includes(body.status)) return all('content:audit', ...(method === 'POST' ? ['content:add'] : Object.keys(body).some(k => !['status','reject_reason'].includes(k)) ? ['content:edit'] : []));
    return crud('content');
  }
  if (path === 'data-scope-stores') return ['role:view','role:add','role:edit','role:scope','member:view','member:add','member:edit'];
  if (/^(users|admin-users)(?:\/|$)/.test(path)) {
    if (read) return ['member:view','role:view'];
    if (method === 'POST') return ['member:add'];
    if (!Object.keys(body).length) return ['member:edit'];
    return all(...(has('password') && body.password ? ['member:password'] : []), ...(has('role_id') ? ['member:assign'] : []), ...(has('status') ? ['member:status'] : []), ...(Object.keys(body).some(k => !['password','role_id','status'].includes(k)) ? ['member:edit'] : []));
  }
  if (/^roles(?:\/|$)/.test(path)) {
    if (read) return ['role:view','member:view'];
    if (method === 'POST') return all('role:add', ...(has('permissions') ? ['role:assign'] : []), ...(body.memberIds?.length ? ['role:members'] : []), ...(has('data_scope') || body.member_data_scopes?.length ? ['role:scope'] : []));
    if (!Object.keys(body).length) return ['role:edit'];
    return all(...(has('permissions') ? ['role:assign'] : []), ...(has('memberIds') ? ['role:members'] : []), ...(has('data_scope') || has('member_data_scopes') ? ['role:scope'] : []), ...(Object.keys(body).some(k => ['name','description','status'].includes(k)) ? ['role:edit'] : []));
  }
  if (/^logs/.test(path)) return ['audit_log:view'];
  if (/^mini-program-logs/.test(path)) return ['mini_log:view'];
  if (/^settings\/wechat-notifications/.test(path)) return [read ? 'wechat_notification:view' : 'wechat_notification:edit'];
  if (path === 'settings/wechat-pay-check') return ['settings:pay_check'];
  if (path === 'settings') return [read ? 'settings:view' : 'settings:edit'];
  if (/^database\//.test(path)) return ['database:' + (read ? 'view' : /query$/.test(path) ? 'query' : 'sync')];
  if (path === 'uploads/images') return ['content:add','content:edit','product:add','product:edit','store:add','store:edit','doctor:add','doctor:edit','live:add','live:edit','banner:add','banner:edit','promoter:add'];
  if (path === 'uploads/files') return ['medical_record:attachment'];
  return null;
}

export function hasAdminPermission(user, required) {
  if (user?.role === 'super_admin' || user?.role_code === 'super_admin') return true;
  if (required === null) return false;
  const permissions = user?.permissions || [];
  if (Array.isArray(required)) return required.length === 0 || required.some(p => permissions.includes(p));
  return (required.all || []).every(p => permissions.includes(p)) && (!required.any?.length || required.any.some(p => permissions.includes(p)));
}
