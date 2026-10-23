import crypto from 'node:crypto';
import { get, query, run, transaction } from './db.js';
import { authenticateToken, hashPassword, encryptPII, decryptPII } from './helpers.js';
import { getWechatMiniAccessToken } from './wechatMiniToken.js';

export async function promoterQr(id) {
  const env=process.env.WX_MINI_QRCODE_ENV|| (process.env.NODE_ENV==='production'?'release':'trial');
  const appId=String(process.env.WX_MINI_APP_ID||'').trim();
  const imageData=bytes=>'data:'+(bytes[0]===255?'image/jpeg':'image/png')+';base64,'+bytes.toString('base64');
  const row=await get(`SELECT c.* FROM promoter_codes c JOIN distributors d ON d.id=c.distributor_id
    WHERE c.distributor_id=? AND c.active=1 AND d.status='active' ORDER BY c.created_at DESC LIMIT 1`,[id]);
  if(!row)throw Object.assign(new Error('推广码不存在或已停用'),{statusCode:404});
  if(row.image && row.qr_environment===env && row.qr_app_id===appId)return {code:row.code,image:imageData(row.image)};
  const token=await getWechatMiniAccessToken();
  const response=await fetch('https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token='+encodeURIComponent(token),{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000),
    body:JSON.stringify({page:'pages/index/index',scene:'ref='+row.code,check_path:false,env_version:env,width:430})});
  const bytes=Buffer.from(await response.arrayBuffer());
  const isImage=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
  if(!response.ok || !isImage)throw Object.assign(new Error('微信小程序码生成失败，请检查小程序配置后重试'),{statusCode:503});
  await run('UPDATE promoter_codes SET image=?,qr_environment=?,qr_app_id=? WHERE code=?',[bytes,env,appId,row.code]);
  return {code:row.code,image:imageData(bytes)};
}
export function registerBackendPromoterAdmin(app) {
  app.post('/api/admin/distribution/promoters',authenticateToken,async(req,res)=>{
    const {nickname,login_name,password,phone,avatar_url}=req.body;
    const phoneClean=String(phone||'').trim(),avatarClean=String(avatar_url||'').trim();
    let avatarPath='';
    try{avatarPath=avatarClean?(avatarClean.startsWith('/')?avatarClean:new URL(avatarClean).pathname):''}catch{}
    if(typeof nickname!=='string'||!nickname.trim()||nickname.length>100||typeof login_name!=='string'||! /^[a-zA-Z0-9_@.\-]{4,64}$/.test(login_name)||typeof password!=='string'||password.length<8||password.length>64||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)||phoneClean&&!/^1[3-9]\d{9}$/.test(phoneClean)||avatarClean&&(!/^\/uploads\/admin\/images\/promoter-avatar\/[a-zA-Z0-9_.-]+$/.test(avatarPath)||avatarClean.length>255))return res.status(400).json({code:400,message:'请填写推广员姓名、4-64位账号及8-64位字母数字密码；联系电话选填，填写时需为有效手机号'});
    try {
      const id=await transaction(async conn=>{
        const code='BP'+crypto.randomBytes(12).toString('hex');
        const [created]=await conn.execute(`INSERT INTO distributors(user_id,nickname,avatar_url,invite_code,source_type,contact_phone,created_by,status)
          VALUES(NULL,?,?,?,'backend',?,?,'active')`,[nickname.trim(),avatarPath||null,code,phoneClean?encryptPII(phoneClean):null,req.user.id]);
        await conn.execute('INSERT INTO promoter_accounts(distributor_id,login_name,password_hash) VALUES(?,?,?)',[created.insertId,login_name,hashPassword(password)]);
        await conn.execute('INSERT INTO promoter_codes(code,distributor_id) VALUES(?,?)',[code,created.insertId]);
        await conn.execute("INSERT INTO audit_logs(admin_id,action,target_type,target_id,details,status) VALUES(?,'create_backend_promoter','distributor',?,?,'success')",[req.user.id,String(created.insertId),JSON.stringify({nickname:nickname.trim(),login_name,has_avatar:Boolean(avatarClean),has_phone:Boolean(phoneClean)})]);
        return created.insertId;
      });
      let qr=null,qrError='';try{qr=await promoterQr(id)}catch(e){qrError=e.message}
      res.json({code:200,data:{id,qr,qrError},message:'推广员已创建'});
    }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({code:409,message:'登录账号已存在'});throw e}
  });
  app.get('/api/admin/distribution/promoters/:id/qr',authenticateToken,async(req,res)=>res.json({code:200,data:await promoterQr(req.params.id)}));
  app.put('/api/admin/distribution/promoters/:id/password',authenticateToken,async(req,res)=>{
    const password=req.body.password;
    if(typeof password!=='string'||password.length<8||password.length>64||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return res.status(400).json({code:400,message:'密码需8-64位且包含字母和数字'});
    await transaction(async conn=>{
      const [result]=await conn.execute('UPDATE promoter_accounts SET password_hash=?,token_version=token_version+1 WHERE distributor_id=?',[hashPassword(password),req.params.id]);
      if(!result.affectedRows)throw Object.assign(new Error('后台推广员账号不存在'),{statusCode:404});
      await conn.execute("INSERT INTO audit_logs(admin_id,action,target_type,target_id,details,status) VALUES(?,'reset_promoter_password','distributor',?,'{}','success')",[req.user.id,String(req.params.id)]);
    });
    res.json({code:200,message:'密码已重置，旧登录已失效'});
  });
  app.get('/api/admin/distribution/promoters',authenticateToken,async(req,res)=>{
    const list=await query(`SELECT d.*,a.login_name,COALESCE(d.contact_phone,u.phone) AS user_phone,
      (SELECT COUNT(*) FROM distribution_relationships r WHERE r.level=1 AND (r.parent_distributor_id=d.id OR r.parent_user_id=d.user_id)) AS invitees_l1_count,
      (SELECT COUNT(*) FROM distribution_relationships r WHERE r.level=2 AND (r.parent_distributor_id=d.id OR r.parent_user_id=d.user_id)) AS invitees_l2_count,
      (SELECT COUNT(DISTINCT order_id) FROM distribution_orders WHERE distributor_id=d.id AND status!='refunded') AS total_orders
      FROM distributors d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN promoter_accounts a ON a.distributor_id=d.id ORDER BY d.id DESC`);
    res.json({code:200,data:list.map(r=>({...r,user_phone:decryptPII(r.user_phone)||''}))});
  });
}
