import { dashboardScope } from './dashboard-scope.js';
import { orderReadScope, userReadScope } from './data-read-scope.js';
import { query } from './db.js';

export function commissionReadScope(user, alias='dc') {
  const order=orderReadScope(user,'scope_order');
  return {sql:`EXISTS(SELECT 1 FROM orders scope_order WHERE scope_order.id=${alias}.order_id AND ${order.sql})`,params:order.params};
}
export function relationReadScope(user, alias='dr') {
  return userReadScope(user,`${alias}.child_user_id`);
}
export function promoterReadScope(user, alias='d') {
  if(dashboardScope(user).kind==='all')return {sql:'1=1',params:[]};
  const commission=commissionReadScope(user,'scope_commission'), relation=relationReadScope(user,'scope_relation');
  const own=dashboardScope(user).kind==='self';
  return {sql:`(${own?`${alias}.created_by=? OR `:''}EXISTS(SELECT 1 FROM distribution_orders scope_commission WHERE scope_commission.distributor_id=${alias}.id AND ${commission.sql}) OR EXISTS(SELECT 1 FROM distribution_relationships scope_relation WHERE (scope_relation.parent_distributor_id=${alias}.id OR scope_relation.parent_user_id=${alias}.user_id) AND ${relation.sql}))`,params:[...(own?[Number(user.id)||0]:[]),...commission.params,...relation.params]};
}
// A withdrawal is a whole-wallet record, with no per-order allocation. Only
// expose it when every contributing order is visible; never split or guess it.
export function wholeWalletScope(user, alias='d') {
  if(dashboardScope(user).kind==='all')return {sql:'1=1',params:[]};
  const visible=promoterReadScope(user,alias),commission=commissionReadScope(user,'wallet_commission');
  return {sql:`(${visible.sql} AND NOT EXISTS(SELECT 1 FROM distribution_orders wallet_commission WHERE wallet_commission.distributor_id=${alias}.id AND NOT (${commission.sql})))`,params:[...visible.params,...commission.params]};
}
export function withdrawalReadScope(user, alias='w') {
  const wallet=wholeWalletScope(user,'wallet_owner');
  return {sql:`EXISTS(SELECT 1 FROM distributors wallet_owner WHERE (wallet_owner.id=${alias}.distributor_id OR (${alias}.distributor_id IS NULL AND wallet_owner.user_id=${alias}.user_id)) AND ${wallet.sql})`,params:wallet.params};
}
export async function readScopedPromoters(user, id=null) {
  const scope=promoterReadScope(user,'d'),commission=commissionReadScope(user,'dc'),relation=relationReadScope(user,'dr'),wallet=wholeWalletScope(user,'d');
  const rows=await query(`SELECT d.*, a.login_name, COALESCE(d.contact_phone,u.phone) AS user_phone,
    (${wallet.sql}) AS complete_wallet,
    (SELECT COUNT(*) FROM distribution_relationships dr WHERE (dr.parent_distributor_id=d.id OR dr.parent_user_id=d.user_id) AND dr.level=1 AND ${relation.sql}) AS invitees_l1_count,
    (SELECT COUNT(*) FROM distribution_relationships dr WHERE (dr.parent_distributor_id=d.id OR dr.parent_user_id=d.user_id) AND dr.level=2 AND ${relation.sql}) AS invitees_l2_count,
    (SELECT COUNT(DISTINCT dc.order_id) FROM distribution_orders dc WHERE dc.distributor_id=d.id AND dc.status<>'refunded' AND ${commission.sql}) AS total_orders,
    (SELECT COALESCE(SUM(dc.order_amount),0) FROM distribution_orders dc WHERE dc.distributor_id=d.id AND dc.status<>'refunded' AND ${commission.sql}) AS total_amount,
    (SELECT COALESCE(SUM(dc.commission_amount),0) FROM distribution_orders dc WHERE dc.distributor_id=d.id AND dc.status<>'refunded' AND ${commission.sql}) AS scoped_commission
    FROM distributors d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN promoter_accounts a ON a.distributor_id=d.id
    WHERE ${scope.sql}${id===null?'':' AND d.id=?'} ORDER BY d.id DESC`,
    [...wallet.params,...relation.params,...relation.params,...commission.params,...commission.params,...commission.params,...scope.params,...(id===null?[]:[id])]);
  return rows.map(row=>({...row,total_commission:Number(row.scoped_commission),
    available_commission:row.complete_wallet?row.available_commission:null,
    withdrawn_amount:row.complete_wallet?row.withdrawn_amount:null}));
}
