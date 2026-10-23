import { getDistributionFeatureConfig, businessError } from './distribution-ledger.js';

export async function attachAppointmentReferral(conn, appointmentId, code) {
  if (!code) return;
  if (typeof code !== 'string' || !/^BP[a-f0-9]{24}$/.test(code)) throw Object.assign(businessError('推广码无效，请重新提交预约或重新扫码'),{referralInvalid:true});
  const [[row]] = await conn.execute(`SELECT c.distributor_id FROM promoter_codes c JOIN distributors d ON d.id=c.distributor_id
    WHERE c.code=? AND c.active=1 AND d.source_type='backend' AND d.status='active'`, [code]);
  if (!row) throw Object.assign(businessError('推广码已失效，请重新提交预约或重新扫码'),{referralInvalid:true});
  await conn.execute('UPDATE appointments SET referral_promoter_id=?,referral_code=? WHERE id=?', [row.distributor_id,code,appointmentId]);
}

export async function snapshotReferralOrder(conn, orderId, appointmentId = null) {
  // Snapshot at order creation, never read live product rates on payment retries.
  await conn.execute(`UPDATE order_items oi JOIN products p ON p.id=oi.product_id
    SET oi.backend_referral_enabled_snapshot=p.backend_referral_enabled,
        oi.backend_rate_x_snapshot=p.backend_rate_x, oi.backend_rate_y_snapshot=p.backend_rate_y
    WHERE oi.order_id=?`,[orderId]);
  if (appointmentId) await conn.execute(`UPDATE orders o JOIN appointments a ON a.id=o.appointment_id
    SET o.referral_promoter_id=a.referral_promoter_id WHERE o.id=? AND a.id=?`,[orderId,appointmentId]);
}

// Called under the order payment transaction. Lock the buyer even without an edge.
export async function createReferralCommissions(conn, order, userId) {
  if (!userId) return;
  await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
  const [[saved]] = await conn.execute('SELECT * FROM orders WHERE id=? FOR UPDATE',[order.id]);
  if (!saved || !saved.pay_at || Number(saved.pay_amount)<=0 || saved.distribution_processed) return;
  const [items]=await conn.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY id',[order.id]);
  const [[direct]]=await conn.execute('SELECT * FROM distribution_relationships WHERE child_user_id=? AND level=1 FOR UPDATE',[userId]);
  const eligible=items.some(i=>Number(i.backend_referral_enabled_snapshot)===1);
  if ((!direct && !(saved.referral_promoter_id && eligible)) ||
      !items.some(i=>Number(i.is_distribution_snapshot)===1 || Number(i.backend_referral_enabled_snapshot)===1)) {
    await conn.execute('UPDATE orders SET distribution_processed=1 WHERE id=?',[order.id]);
    return;
  }
  const config=await getDistributionFeatureConfig(conn);
  if (!config.enableDistribution) {
    await conn.execute('UPDATE orders SET distribution_processed=1 WHERE id=?',[order.id]);
    return;
  }
  const gross=items.reduce((s,i)=>s+Number(i.price)*Number(i.quantity),0);
  const paid=Math.min(Number(saved.pay_amount),gross);
  // Integer cents, deterministic largest-remainder allocation across all lines.
  const bases=items.map(i=>gross ? Math.floor(paid*Number(i.price)*Number(i.quantity)/gross) : 0);
  let remainder=paid-bases.reduce((s,n)=>s+n,0);
  const rank=items.map((i,k)=>({k,r:gross ? (paid*Number(i.price)*Number(i.quantity))%gross : 0})).sort((a,b)=>b.r-a.r||a.k-b.k);
  for(const {k} of rank) { if(remainder<=0)break; bases[k]++;remainder--; }
  const [[buyer]]=await conn.execute('SELECT nickname FROM users WHERE id=?',[userId]);
  const [[referrer]]=await conn.execute("SELECT * FROM distributors WHERE id=? AND source_type='backend' AND status='active'",[saved.referral_promoter_id || 0]);
  let mode=null,first=direct;
  const [[converted]]=await conn.execute('SELECT order_id FROM promoter_conversions WHERE appointment_id=?',[saved.appointment_id||0]);
  if(referrer && eligible && !converted) {
    mode=direct?'existing':'new';
    if(saved.appointment_id) await conn.execute('INSERT INTO promoter_conversions(appointment_id,order_id,distributor_id,mode) VALUES(?,?,?,?)',[saved.appointment_id,saved.id,referrer.id,mode]);
    if(!direct) {
      await conn.execute('INSERT INTO distribution_relationships(parent_user_id,parent_distributor_id,child_user_id,level) VALUES(NULL,?,?,1)',[referrer.id,userId]);
      first={parent_user_id:null,parent_distributor_id:referrer.id};
      // Existing direct children now have this backend promoter at level two.
      await conn.execute(`INSERT INTO distribution_relationships(parent_user_id,parent_distributor_id,child_user_id,level)
        SELECT NULL,?,child_user_id,2 FROM distribution_relationships WHERE parent_user_id=? AND level=1
        ON DUPLICATE KEY UPDATE parent_user_id=NULL,parent_distributor_id=VALUES(parent_distributor_id)`,[referrer.id,userId]);
    }
  }
  const resolve=async edge=>{
    if(!edge)return null;
    const [[p]]=await conn.execute(`SELECT * FROM distributors WHERE ${edge.parent_distributor_id?'id':'user_id'}=? AND status='active'`,[edge.parent_distributor_id || edge.parent_user_id]);
    return p;
  };
  const l1=await resolve(first);
  let l2=null;
  if(first?.parent_user_id) {
    const [[upper]]=await conn.execute('SELECT * FROM distribution_relationships WHERE child_user_id=? AND level=1',[first.parent_user_id]);
    l2=await resolve(upper);
  }
  const grants=new Map();
  function grant(p,level,kind,index,rate) {
    if(!p||rate<=0||bases[index]<=0)return;
    const amount=Math.floor(bases[index]*Math.round(rate*100)/10000);
    if(!amount)return;
    const key=p.id+':'+level;
    if(!grants.has(key))grants.set(key,{p,level,kind,amount:0,lines:[]});
    const g=grants.get(key);g.amount+=amount;g.lines.push({itemId:items[index].id,paidAmount:bases[index],rate,amount});
  }
  items.forEach((item,k)=>{
    const isReferral=!!mode && Number(item.backend_referral_enabled_snapshot)===1;
    if(isReferral) grant(referrer,mode==='new'?3:4,mode==='new'?'referral_new':'referral_existing',k,Number(mode==='new'?item.backend_rate_x_snapshot:item.backend_rate_y_snapshot));
    if(Number(item.is_distribution_snapshot)===1) {
      if(!(isReferral&&mode==='new'&&l1?.id===referrer.id))grant(l1,1,'tier',k,Number(item.commission_rate_level1_snapshot ?? item.commission_rate_snapshot));
      grant(l2,2,'tier',k,Number(item.commission_rate_level2_snapshot));
    }
  });
  if([...grants.values()].reduce((sum,g)=>sum+g.amount,0)>paid)throw businessError('订单佣金配置超过实付金额',409);
  for(const g of grants.values()) {
    const [[existing]]=await conn.execute('SELECT id FROM distribution_orders WHERE order_id=? AND distributor_id=? AND commission_level=?',[order.id,g.p.id,g.level]);
    if(existing)continue;
    await conn.execute(`INSERT INTO distribution_orders(order_id,distributor_id,buyer_name,order_amount,commission_amount,commission_level,status,commission_kind,calculation_snapshot)
      VALUES(?,?,?,?,?,?,'pending',?,?)`,[order.id,g.p.id,buyer?.nickname||'微信用户',paid,g.amount,g.level,g.kind,JSON.stringify(g.lines)]);
    await conn.execute('UPDATE distributors SET total_commission=total_commission+? WHERE id=?',[g.amount,g.p.id]);
  }
  for (const id of new Set([...grants.values()].map(g=>g.p.id))) {
    const [[stats]]=await conn.execute("SELECT COUNT(DISTINCT order_id) AS n FROM distribution_orders WHERE distributor_id=? AND commission_level IN(1,3) AND status!='refunded'",[id]);
    await conn.execute('UPDATE distributors SET level=? WHERE id=?',[stats.n>=50?'diamond':stats.n>=10?'gold':'silver',id]);
  }
  await conn.execute('UPDATE orders SET referral_mode=?,distribution_processed=1 WHERE id=?',[mode,order.id]);
}
