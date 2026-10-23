import jwt from 'jsonwebtoken';
import { createAsyncRouter } from '../async-router.js';
import { get,query,run,transaction } from '../db.js';
import { hashPassword,verifyPassword,JWT_SECRET,authenticatePromoterToken,decryptPII,encryptPII } from '../helpers.js';
import { createRateLimiter } from '../runtime-safety.js';
import { readCommissionLedger,settleCommissions,publicWithdrawAccount,withdrawStatus,getDistributionFeatureConfig } from '../distribution-ledger.js';
import { promoterQr } from '../backend-promoter-admin.js';
const app=createAsyncRouter(),dummy=hashPassword('unavailable-promoter-credential');
const identity=row=>({id:String(row.id),nickname:row.nickname,phone:decryptPII(row.contact_phone)||'',login_name:row.login_name,role_name:'推广员',role_code:'promoter',level:row.level,levelLabel:{silver:'银牌',gold:'金牌',diamond:'钻石'}[row.level]||'推广员',inviteCode:row.invite_code,avatar_url:row.avatar_url||'',hasPassword:true,createdAt:row.created_at});
const needsReconciliation=(row,ledger)=>Number(row.total_commission)!==ledger.total||Number(row.available_commission)!==ledger.available||Number(row.withdrawn_amount)!==ledger.withdrawn;
app.post('/api/promoter/login',createRateLimiter({limit:process.env.NODE_ENV==='production'?15:100,windowMs:15*60*1000}),async(req,res)=>{
  const login=String(req.body.account||req.body.phone||'').trim(),password=String(req.body.password||'');
  const row=await get(`SELECT d.*,a.login_name,a.password_hash,a.token_version FROM promoter_accounts a JOIN distributors d ON d.id=a.distributor_id WHERE a.login_name=? AND d.source_type='backend'`,[login]);
  const valid=verifyPassword(password,row?.password_hash||dummy);
  if(!row||row.status!=='active'||!valid)return res.status(401).json({code:401,message:'推广员账号或密码错误'});
  const token=jwt.sign({scope:'promoter',promoter_id:row.id,token_version:row.token_version},JWT_SECRET,{expiresIn:'7d'});
  res.json({code:200,data:{token,user:identity(row)}});
});
app.post('/api/promoter/send-code',(_req,res)=>res.status(400).json({code:400,message:'请使用运营后台创建的推广员账号密码登录'}));
app.use('/api/promoter',authenticatePromoterToken);
const context=async req=>get(`SELECT d.*,a.login_name FROM distributors d JOIN promoter_accounts a ON a.distributor_id=d.id WHERE d.id=?`,[req.user.promoter_id]);
app.get('/api/promoter/me',async(req,res)=>res.json({code:200,data:identity(await context(req))}));
app.put('/api/promoter/profile',async(req,res)=>{const n=String(req.body.nickname||'').trim();if(!n||n.length>100)return res.status(400).json({code:400,message:'昵称无效'});await run('UPDATE distributors SET nickname=? WHERE id=?',[n,req.user.promoter_id]);res.json({code:200,message:'保存成功'})});
app.put('/api/promoter/password',async(req,res)=>{
  const {oldPassword,newPassword,confirmPassword}=req.body;
  if(typeof newPassword!=='string'||newPassword!==confirmPassword||newPassword.length<8||newPassword.length>64||!/[A-Za-z]/.test(newPassword)||!/[0-9]/.test(newPassword))return res.status(400).json({code:400,message:'新密码需8-64位且包含字母和数字，两次输入需一致'});
  await transaction(async conn=>{
    const [[row]]=await conn.execute('SELECT password_hash FROM promoter_accounts WHERE distributor_id=? FOR UPDATE',[req.user.promoter_id]);
    if(!row||!verifyPassword(String(oldPassword||''),row.password_hash))throw Object.assign(new Error('原始密码不正确'),{statusCode:400});
    await conn.execute('UPDATE promoter_accounts SET password_hash=?,token_version=token_version+1 WHERE distributor_id=?',[hashPassword(newPassword),req.user.promoter_id]);
  });
  res.json({code:200,message:'修改成功，请重新登录'});
});
const commissions=id=>query(`SELECT c.*,o.order_no,d.nickname AS promoter_name,c.buyer_name AS patient_name,
  (SELECT GROUP_CONCAT(product_name SEPARATOR '、') FROM order_items WHERE order_id=o.id) AS product_names
  FROM distribution_orders c JOIN orders o ON o.id=c.order_id JOIN distributors d ON d.id=c.distributor_id WHERE c.distributor_id=? ORDER BY c.id DESC`,[id]);
app.get('/api/promoter/commissions',async(req,res)=>{await settleCommissions(null,req.user.promoter_id);res.json({code:200,data:await commissions(req.user.promoter_id)})});
app.get('/api/promoter/qr',async(req,res)=>res.json({code:200,data:await promoterQr(req.user.promoter_id)}));
app.get('/api/promoter/dashboard',async(req,res)=>{
  const id=req.user.promoter_id;await settleCommissions(null,id);
  const row=await context(req),ledger=await transaction(conn=>readCommissionLedger(conn,id,null));
  const teams=await query('SELECT level,COUNT(*) AS n FROM distribution_relationships WHERE parent_distributor_id=? GROUP BY level',[id]);
  const orders=await get(`SELECT COUNT(*) AS n,COALESCE(SUM(pay_amount),0) AS total FROM orders WHERE id IN(SELECT order_id FROM distribution_orders WHERE distributor_id=? AND status!='refunded')`,[id]);
  const l1=Number(teams.find(x=>x.level===1)?.n||0),l2=Number(teams.find(x=>x.level===2)?.n||0);
  res.json({code:200,data:{promoter:identity(row),summary:{teamCount:l1,teamLevel2Count:l2,totalInvites:l1+l2,totalOrders:orders.n,totalSales:orders.total,availableCommission:Math.max(0,ledger.available),totalCommission:ledger.total,withdrawnAmount:ledger.withdrawn,frozenCommission:ledger.frozen,pendingWithdrawAmount:ledger.reserved,reconciliationRequired:needsReconciliation(row,ledger)},recentCommissions:(await commissions(id)).slice(0,10)}});
});
app.get('/api/promoter/team',async(req,res)=>{
  const list=await query(`SELECT r.child_user_id AS id,u.nickname,u.phone,r.level AS relationLevel,r.created_at AS joinedAt,
    COALESCE(upperUser.nickname,upperPromoter.nickname) AS upperName,
    IF(member.id IS NULL,'小程序用户','小程序推广员') AS levelLabel,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id AND o.pay_at IS NOT NULL AND o.status!='refunded'
      AND EXISTS(SELECT 1 FROM distribution_orders c WHERE c.order_id=o.id AND c.distributor_id=r.parent_distributor_id AND c.status!='refunded')) AS orderCount,
    (SELECT COALESCE(SUM(o.pay_amount),0) FROM orders o WHERE o.user_id=u.id AND o.pay_at IS NOT NULL AND o.status!='refunded'
      AND EXISTS(SELECT 1 FROM distribution_orders c WHERE c.order_id=o.id AND c.distributor_id=r.parent_distributor_id AND c.status!='refunded')) AS totalSales
    FROM distribution_relationships r JOIN users u ON u.id=r.child_user_id
    LEFT JOIN distributors member ON member.user_id=u.id
    LEFT JOIN distribution_relationships direct ON direct.child_user_id=u.id AND direct.level=1
    LEFT JOIN users upperUser ON upperUser.id=direct.parent_user_id
    LEFT JOIN distributors upperPromoter ON upperPromoter.id=direct.parent_distributor_id
    WHERE r.parent_distributor_id=? ORDER BY r.level,r.id DESC`,[req.user.promoter_id]);
  res.json({code:200,data:{list:list.map(r=>({...r,phone:mask(r.phone),statusText:r.orderCount?'已成单':'已绑定'})),total:list.length}});
});
const mask=value=>{const s=decryptPII(value)||'';return s.length>=7?s.slice(0,3)+'****'+s.slice(-4):''};
// Referral accounts see appointment conversion and patient detail.
app.get('/api/promoter/patients',async(req,res)=>{
  const list=await query(`SELECT a.id,a.appointment_no,a.appointment_date,a.appointment_time,a.status,p.name AS patient_name,
    a.user_id,a.patient_id,(SELECT COUNT(*) FROM orders o WHERE o.appointment_id=a.id AND o.pay_at IS NOT NULL AND o.status!='refunded') AS order_count
    FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.referral_promoter_id=? ORDER BY a.id DESC`,[req.user.promoter_id]);
  res.json({code:200,data:{list:list.map(r=>({...r,id:String(r.id),patient_id:String(r.patient_id),name:r.patient_name,patientName:r.patient_name,progressCode:r.order_count?'purchased':'appointed',progressLabel:r.order_count?'已成单':'已预约',orderCount:r.order_count,appointmentCount:1})),total:list.length}});
});
app.get('/api/promoter/patients/:id',async(req,res)=>{
  const promoterId=req.user.promoter_id;
  const {id}=req.params;
  if(!/^[1-9]\d*$/.test(id))return res.status(400).json({code:400,message:'患者编号无效'});
  try{
    const patient=await get(
      `SELECT p.id, p.user_id, p.name, p.relation, p.gender, p.age, p.phone, p.has_snore,
              p.created_at, p.patient_no, p.source,
              u.nickname as user_nickname, u.phone as user_phone, COALESCE(ml.code, 'normal') AS member_level, ml.name AS member_level_name,
              (
                SELECT COALESCE(d.nickname, pu.nickname, pu.phone)
                FROM distribution_relationships dr
                LEFT JOIN users pu ON dr.parent_user_id = pu.id
                LEFT JOIN distributors d ON d.user_id = pu.id OR d.id=dr.parent_distributor_id
                WHERE dr.child_user_id = p.user_id AND dr.level=1
                ORDER BY dr.created_at ASC
                LIMIT 1
              ) as referrer_name
       FROM patients p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN user_memberships um ON um.user_id = u.id
       LEFT JOIN member_levels ml ON ml.id = um.level_id
       WHERE p.id = ?`,
      [id]
    );

    if(!patient){
      return res.status(404).json({code:404,message:'患者不存在'});
    }

    const hasAppointment=await get(
      `SELECT 1 FROM appointments WHERE referral_promoter_id = ? AND patient_id = ? LIMIT 1`,
      [promoterId, id]
    );
    const hasRelation=await get(
      `SELECT 1 FROM distribution_relationships WHERE parent_distributor_id = ? AND child_user_id = ? LIMIT 1`,
      [promoterId, patient.user_id]
    );
    if(!hasAppointment&&!hasRelation){
      return res.status(403).json({code:403,message:'您无权查看该患者的信息'});
    }

    const appointments=await query(
      `SELECT a.*, d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, s.name as store_name
       FROM appointments a
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN stores s ON a.store_id = s.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC`,
      [id]
    );

    const totalSpentRow=await get(
      `SELECT COALESCE(SUM(pay_amount), 0) as total_spent
       FROM orders
       WHERE user_id = ? AND status IN ('paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed')`,
      [patient.user_id]
    );

    const medicalRecords=await query(
      `SELECT r.id, r.patient_id, r.doctor_id, r.store_id, r.visit_date, r.diagnosis,
              r.prescription, r.doctor_advice, r.note,
              d.name as doctor_name, d.title as doctor_title, d.specialty as doctor_specialty, s.name as store_name
       FROM medical_records r
       LEFT JOIN doctors d ON r.doctor_id = d.id
       LEFT JOIN stores s ON r.store_id = s.id
       WHERE r.patient_id = ?
       ORDER BY r.visit_date DESC, r.id DESC`,
      [id]
    );

    const tr=await get(
      `SELECT pd.*,
              COALESCE(pd.bound_at, pd.created_at) AS start_date,
              d.name as doctor_name
       FROM patient_devices pd
       LEFT JOIN doctors d ON pd.bind_doctor_id = d.id
       WHERE pd.patient_id = ? AND pd.status = 'active'`,
      [id]
    );
    let wearingLogs=[];
    if(tr){
      wearingLogs=await query(
        `SELECT * FROM wearing_logs WHERE patient_device_id = ? AND source = 'mini_program_checkin' ORDER BY date DESC LIMIT 30`,
        [tr.patient_device_id||tr.id]
      );
    }

    const orders=await query(
      `SELECT o.*, u.nickname as buyer_nickname, u.phone as buyer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [patient.user_id]
    );
    const orderIds=orders.map(o=>o.id);
    let allOrderItems=[];
    if(orderIds.length>0){
      const placeholders=orderIds.map(()=>'?').join(',');
      allOrderItems=await query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`,orderIds);
    }
    const orderItemsMap={};
    allOrderItems.forEach(item=>{
      if(!orderItemsMap[item.order_id])orderItemsMap[item.order_id]=[];
      orderItemsMap[item.order_id].push(item);
    });
    for(const order of orders){
      order.items=orderItemsMap[order.id]||[];
      order.buyer_phone=mask(order.buyer_phone);
      try{
        order.shipping_address=typeof order.shipping_address==='string'?JSON.parse(order.shipping_address):order.shipping_address;
      }catch(_e){}
    }

    const ess=await get(
      `SELECT * FROM ess_assessments
       WHERE patient_id = ? OR (patient_id IS NULL AND user_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [id, patient.user_id]
    );
    const snore=await get(
      `SELECT * FROM snore_assessments
       WHERE patient_id = ? OR (patient_id IS NULL AND user_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [id, patient.user_id]
    );
    const wearingStats=await get(
      `SELECT COUNT(wl.id) as total_days,
              COALESCE(AVG(wl.wear_duration), 0) as avg_duration,
              COALESCE(AVG(wl.comfort), 0) as avg_comfort,
              COALESCE(AVG(COALESCE(wl.pain_score,
                CASE
                  WHEN wl.comfort >= 5 THEN 0
                  WHEN wl.comfort = 4 THEN 2
                  WHEN wl.comfort = 3 THEN 4
                  WHEN wl.comfort = 2 THEN 6
                  WHEN wl.comfort = 1 THEN 8
                  ELSE 0
                END
              )), 0) as avg_pain_score,
              COALESCE(AVG(wl.ahi_index), 0) as avg_ahi
       FROM patient_devices pd
       LEFT JOIN wearing_logs wl ON wl.patient_device_id = pd.id AND wl.source = 'mini_program_checkin'
       WHERE pd.patient_id = ?`,
      [id]
    );

    const familyMembers=await query(
      `SELECT id, name, relation, gender, age, phone FROM patients WHERE user_id = ?`,
      [patient.user_id]
    );
    const familyMembersWithDiagnostics=[];
    for(const member of familyMembers){
      const mEss=await get(
        `SELECT total_score, risk_level, created_at FROM ess_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
        [member.id]
      );
      const mSnore=await get(
        `SELECT apnea_events, risk_level, created_at FROM snore_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
        [member.id]
      );
      familyMembersWithDiagnostics.push({
        id: member.id.toString(),
        name: member.name,
        relation: member.relation,
        gender: member.gender,
        age: member.age,
        phone: mask(member.phone),
        ess: mEss||null,
        snore: mSnore||null
      });
    }

    patient.phone=mask(patient.phone);
    patient.user_phone=mask(patient.user_phone);

    res.json({
      code:200,
      data:{
        id:patient.id,name:patient.name,patient_no:patient.patient_no,relation:patient.relation,
        gender:patient.gender,age:patient.age,phone:patient.phone,source:patient.source,
        created_at:patient.created_at,member_level:patient.member_level,member_level_name:patient.member_level_name,
        total_spent:Number(totalSpentRow?.total_spent||0),
        latest_medical_record:medicalRecords[0]||null,
        active_treatment:tr?{...tr,logs:wearingLogs}:null,
        appointments:appointments.map(a=>({id:a.id,appointment_date:a.appointment_date,status:a.status})),
        medical_records:medicalRecords,
        orders:orders.map(o=>({id:o.id,order_no:o.order_no,created_at:o.created_at,pay_amount:o.pay_amount,status:o.status,
          delivery_type:o.type==='online'?'express':o.type?'pickup':'',
          items:o.items.map(i=>({id:i.id,product_name:i.product_name,quantity:i.quantity}))})),
        sleep_diagnostics:{
          ess:ess||null,
          snore:snore||null,
          wearing:wearingStats||null
        },
        family_members:familyMembersWithDiagnostics
      }
    });
  }catch(error){
    console.error('Failed to get promoter patient detail:',error);
    res.status(500).json({code:500,message:'获取患者详情失败'});
  }
});
app.get('/api/promoter/products',async(_req,res)=>res.json({code:200,data:await query("SELECT id,name,description,image_url,price,stock,commission_rate_level1,commission_rate_level2,backend_referral_enabled,backend_rate_x,backend_rate_y FROM products WHERE status='on' AND deleted_at IS NULL AND (is_distribution=1 OR backend_referral_enabled=1)")}));
app.get('/api/promoter/withdraws',async(req,res)=>{const rows=await query('SELECT * FROM withdraw_records WHERE distributor_id=? ORDER BY id DESC',[req.user.promoter_id]);res.json({code:200,data:rows.map(r=>({id:String(r.id),amount:r.amount,fee:r.fee,actualAmount:r.actual_amount,status:withdrawStatus(r.status),accountInfo:publicWithdrawAccount(r.account_info),createdAt:r.created_at,completedAt:r.completed_at}))})});
app.post('/api/promoter/withdraws',async(req,res)=>{
  const config=await getDistributionFeatureConfig(),amount=Number(req.body.amount),account=String(req.body.account||'').trim();
  const bankName=String(req.body.bankName||'').trim(),accountName=String(req.body.accountName||'').trim();
  if(!config.enableDistribution||!Number.isSafeInteger(amount)||amount<config.minWithdrawAmount||!/^\d{10,30}$/.test(account)||!bankName||bankName.length>100||!accountName||accountName.length>100)return res.status(400).json({code:400,message:'请检查提现金额、银行、户名和银行账号'});
  await settleCommissions(null,req.user.promoter_id);
  await transaction(async conn=>{
    const [[row]]=await conn.execute('SELECT * FROM distributors WHERE id=? FOR UPDATE',[req.user.promoter_id]);
    const ledger=await readCommissionLedger(conn,req.user.promoter_id,null);
    if(needsReconciliation(row,ledger))throw Object.assign(new Error('佣金账务待核对，请联系运营'),{statusCode:409});
    if(amount>ledger.available)throw Object.assign(new Error('可提现余额不足'),{statusCode:400});
    const fee=Math.round(amount*config.withdrawFeeRates.bank);
    await conn.execute(`INSERT INTO withdraw_records(user_id,distributor_id,amount,fee,actual_amount,status,account_info) VALUES(NULL,?,?,?,?,'pending',?)`,[req.user.promoter_id,amount,fee,amount-fee,JSON.stringify({method:'bank',bankName,accountName,label:'尾号'+account.slice(-4),accountNoEncrypted:encryptPII(account)})]);
    await conn.execute('UPDATE distributors SET available_commission=available_commission-? WHERE id=?',[amount,req.user.promoter_id]);
  });res.json({code:200,message:'提现申请已提交'});
});
export default app;
