import crypto from 'node:crypto';
import { get, query, transaction } from './db.js';
import { authenticateToken, verifyPatientAccess } from './helpers.js';
import { readFulfillmentClinical } from './fulfillment-clinical.js';

const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const editable = ['assigned', 'mold_taken'];
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
async function accessCase(id, user) {
  const c = await get('SELECT * FROM fulfillment_cases WHERE id=?', [id]);
  if (!c || !await verifyPatientAccess(c.patient_id, user)) fail('交付单不存在或无权访问', 404);
  return c;
}
async function accessBatch(id, user) {
  const b = await get(`SELECT b.*,a.name AS sender_name FROM fulfillment_factory_batches b
    LEFT JOIN admin_users a ON a.id=b.sender_id WHERE b.id=?`, [id]);
  if (!b) fail('送厂批次不存在或无权访问', 404);
  const items = await query('SELECT * FROM fulfillment_factory_items WHERE batch_id=? ORDER BY fulfillment_case_id', [id]);
  for (const item of items) await accessCase(item.fulfillment_case_id, user);
  return { ...b, items };
}
async function event(conn, caseId, actor, type, detail) {
  await conn.execute('INSERT INTO fulfillment_events(fulfillment_case_id,actor_id,event_type,detail) VALUES(?,?,?,?)',
    [caseId, actor, type, JSON.stringify(detail)]);
}
async function lockCase(conn, id) {
  const [[c]] = await conn.execute('SELECT * FROM fulfillment_cases WHERE id=? FOR UPDATE', [id]);
  if (!c) fail('交付单不存在', 404);
  return c;
}
function moldDetails(input, complete) {
  if (!input || typeof input !== 'object') fail('取模资料不能为空');
  const d = Object.fromEntries(['mold_no','storage_location','taken_date','method','wear_period','adaptation','requirements','note']
    .map(key => [key, text(input[key], ['mold_no','storage_location','method','wear_period'].includes(key) ? 150 : 2000)]));
  if (d.mold_no.length > 80) fail('口模编号不能超过 80 个字符');
  d.wear_hours = input.wear_hours === '' || input.wear_hours == null ? null : Number(input.wear_hours);
  if (d.wear_hours !== null && (!Number.isFinite(d.wear_hours) || d.wear_hours <= 0 || d.wear_hours > 24)) fail('每日计划佩戴时长必须大于 0 且不超过 24 小时');
  if (d.taken_date && (!/^\d{4}-\d{2}-\d{2}$/.test(d.taken_date) || !Number.isFinite(Date.parse(d.taken_date)) || new Date(d.taken_date).toISOString().slice(0,10) !== d.taken_date)) fail('取模日期不正确');
  if (!Array.isArray(input.parameters) || input.parameters.length > 30) fail('请填写取模参数（最多 30 项）');
  d.parameters = input.parameters.map(p => ({ name: text(p.name, 80), value: text(p.value, 200), unit: text(p.unit, 30) }))
    .filter(p => p.name || p.value || p.unit);
  if (d.parameters.some(p => !p.name || !p.value)) fail('参数名称与测量值需成对填写');
  if (input.file_ids && !Array.isArray(input.file_ids)) fail('附件列表不正确');
  d.file_ids = [...new Set(input.file_ids || [])].map(Number);
  if (d.file_ids.length > 20 || !d.file_ids.every(positiveId)) fail('附件列表不正确');
  if (complete && (!d.mold_no || !d.storage_location || !d.taken_date || !d.method || !d.parameters.length || d.wear_hours === null || !d.wear_period || !d.requirements)) {
    fail('请填写口模编号、存放位置、取模日期、方式、参数、计划佩戴时长及时段、制作要求');
  }
  return d;
}
async function manufacturingSnapshot(c, profile, conn = null) {
  // Reuse the shipment transaction connection: borrowing another pool
  // connection while holding locks can exhaust the pool under concurrency.
  const db = conn ? {
    query: async (sql, params=[]) => (await conn.execute(sql, params))[0],
    get: async (sql, params=[]) => (await conn.execute(sql, params))[0][0] || null
  } : {get,query};
  const clinical = await readFulfillmentClinical(c, db);
  const p = await db.get('SELECT patient_no FROM patients WHERE id=?', [c.patient_id]);
  const technician = await db.get('SELECT name FROM admin_users WHERE id=?',[c.technician_id]);
  const products = await db.query(`SELECT oi.product_name,oi.quantity FROM order_items oi JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id=? AND p.category='device' ORDER BY oi.id`, [c.order_id]);
  const files = [];
  for (const id of decode(profile.details).file_ids || []) {
    const file = await db.get('SELECT id,name FROM fulfillment_mold_files WHERE id=? AND fulfillment_case_id=?', [id,c.id]);
    if (file) files.push(file);
  }
  return { version: 1, captured_at: new Date().toISOString(), case_id: c.id, patient_ref: p.patient_no || `P${c.patient_id}`,
    mold: decode(profile.details), technician_name: technician?.name || '', files, products,
    medical_record_id: clinical.medical_record?.id || null,
    prescription: clinical.medical_record?.prescription || '', doctor_advice: clinical.medical_record?.doctor_advice || '',
    devices: clinical.treatments.map(t => ({ name: t.device_product_name || t.device_model,
      initial_advancement: t.initial_advancement, current_advancement: t.current_advancement,
      adjustments: t.adjustments.filter(a => a.medical_record_id === clinical.medical_record?.id)
        .map(a => ({ adjusted_advancement: a.adjusted_advancement, instructions: a.instructions })) })) };
}

export function registerDeliveryWorkflow(app) {
  const route = (method, path, fn) => app[method]('/api/admin/fulfillment' + path, authenticateToken, async (req,res) => {
    try { await fn(req,res); } catch (e) {
      const code = e.code === 'ER_DUP_ENTRY' ? 409 : e.statusCode || 500;
      if (code === 500) console.error('Delivery workflow:', e);
      res.status(code).json({code, message:e.code === 'ER_DUP_ENTRY' ? '口模编号或批次关联已存在，请刷新后重试' : code === 500 ? '交付操作失败，请稍后重试' : e.message});
    }
  });
  const ok = (res, data = null, message = '操作成功') => res.json({code:200,data,message});

  route('get','/cases/:id/mold',async (req,res) => {
    const c = await accessCase(req.params.id,req.user);
    const profile = await get('SELECT * FROM fulfillment_mold_profiles WHERE fulfillment_case_id=?',[c.id]);
    const mold = await get('SELECT * FROM fulfillment_molds WHERE fulfillment_case_id=? ORDER BY id DESC LIMIT 1',[c.id]);
    const files = await query('SELECT id,name FROM fulfillment_mold_files WHERE fulfillment_case_id=? ORDER BY id',[c.id]);
    const clinical = await readFulfillmentClinical(c);
    ok(res,{profile:profile ? {...profile,details:decode(profile.details)} : null,mold,files,clinical,editable:editable.includes(c.status)});
  });
  route('post','/cases/:id/mold',async (req,res) => {
    const c = await accessCase(req.params.id,req.user);
    const complete = req.body.complete === true;
    const details = moldDetails(req.body.details,complete);
    await transaction(async conn => {
      const locked = await lockCase(conn,c.id);
      if (!editable.includes(locked.status)) fail('当前环节不可修改取模资料，请先取消未寄出的批次或登记重新取模',409);
      if (!locked.technician_id) fail('请先分配技师');
      const [[profile]] = await conn.execute('SELECT * FROM fulfillment_mold_profiles WHERE fulfillment_case_id=? FOR UPDATE',[c.id]);
      if (Number(req.body.revision) !== (profile?.revision || 0)) fail('资料已被其他人更新，请重新打开',409);
      for (const id of details.file_ids) {
        const [[file]] = await conn.execute('SELECT id FROM fulfillment_mold_files WHERE id=? AND fulfillment_case_id=?',[id,c.id]);
        if (!file) fail('附件不属于当前交付单');
      }
      let moldId = profile?.mold_id || null;
      if (!profile && locked.status === 'mold_taken') {
        const [[existing]] = await conn.execute('SELECT id FROM fulfillment_molds WHERE fulfillment_case_id=? ORDER BY id DESC LIMIT 1',[c.id]);
        moldId = existing?.id || null;
      }
      if (complete) {
        if (moldId) await conn.execute(`UPDATE fulfillment_molds SET mold_no=?,storage_location=?,note=?,technician_id=? WHERE id=?`,
          [details.mold_no,details.storage_location,details.note,locked.technician_id,moldId]);
        else {
          const [insert] = await conn.execute(`INSERT INTO fulfillment_molds(fulfillment_case_id,technician_id,mold_no,storage_location,note) VALUES(?,?,?,?,?)`,
            [c.id,locked.technician_id,details.mold_no,details.storage_location,details.note]);
          moldId=insert.insertId;
        }
      }
      await conn.execute(`INSERT INTO fulfillment_mold_profiles(fulfillment_case_id,mold_id,details,status,updated_by) VALUES(?,?,?,?,?)
        ON DUPLICATE KEY UPDATE mold_id=VALUES(mold_id),details=VALUES(details),status=VALUES(status),updated_by=VALUES(updated_by),revision=revision+1`,
        [c.id,moldId,JSON.stringify(details),complete?'completed':'draft',req.user.id]);
      await conn.execute('UPDATE fulfillment_cases SET status=? WHERE id=?',[complete?'mold_taken':'assigned',c.id]);
      await event(conn,c.id,req.user.id,complete?'mold_completed':'mold_draft_saved',{revision:(profile?.revision||0)+1,details});
    });
    ok(res,null,complete?'取模已完成，已进入待送厂队列':'取模草稿已保存');
  });
  route('post','/cases/:id/mold-files',async (req,res) => {
    const c=await accessCase(req.params.id,req.user);
    const name=text(req.body.name,180),encoded=req.body.base64;
    if (!/\.(png|jpg|jpeg|pdf|stl|ply)$/i.test(name) || typeof encoded!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length>7*1024*1024) fail('支持 JPG、PNG、PDF、STL、PLY，单文件不超过 5MB');
    const content=Buffer.from(encoded,'base64');
    if(!content.length || content.length>5*1024*1024) fail('文件不能为空且不能超过 5MB');
    const id=await transaction(async conn=>{
      const locked=await lockCase(conn,c.id);
      if(!editable.includes(locked.status)) fail('寄出或待寄批次中的资料不可修改',409);
      const [[count]]=await conn.execute('SELECT COUNT(*) AS n FROM fulfillment_mold_files WHERE fulfillment_case_id=?',[c.id]);
      if(count.n>=50) fail('单张交付单最多上传 50 个文件');
      const [r]=await conn.execute('INSERT INTO fulfillment_mold_files(fulfillment_case_id,name,content,created_by) VALUES(?,?,?,?)',[c.id,name,content,req.user.id]);return r.insertId;
    });ok(res,{id,name});
  });
  route('get','/cases/:id/mold-files/:fileId',async(req,res)=>{
    const c=await accessCase(req.params.id,req.user);
    const file=await get('SELECT name,content FROM fulfillment_mold_files WHERE id=? AND fulfillment_case_id=?',[req.params.fileId,c.id]);
    if(!file)fail('文件不存在',404);
    res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(file.content);
  });
  route('get','/ready-molds',async(req,res)=>{
    const rows=await query(`SELECT c.id,c.patient_id,p.name AS patient_name,p.patient_no,m.mold_no,d.details,d.revision
      FROM fulfillment_cases c JOIN patients p ON p.id=c.patient_id
      JOIN fulfillment_mold_profiles d ON d.fulfillment_case_id=c.id AND d.status='completed'
      JOIN fulfillment_molds m ON m.id=d.mold_id WHERE c.status='mold_taken' ORDER BY JSON_UNQUOTE(JSON_EXTRACT(d.details,'$.taken_date')),c.id`);
    const result=[];
    for(const r of rows) if(await verifyPatientAccess(r.patient_id,req.user)) {
      const details=decode(r.details);
      if(!req.query.date || details.taken_date===req.query.date)result.push({...r,details});
    }
    ok(res,result);
  });
  route('get','/batches',async(req,res)=>{
    const result=[];
    for(const b of await query('SELECT * FROM fulfillment_factory_batches ORDER BY id DESC')) {
      try { const batch=await accessBatch(b.id,req.user);result.push({...b,item_count:batch.items.length,returned_count:batch.items.filter(x=>x.status==='returned').length,retake_count:batch.items.filter(x=>x.status==='retake').length}); }
      catch(e){if(e.statusCode!==404)throw e;}
    }ok(res,result);
  });
  route('post','/batches',async(req,res)=>{
    if (!Array.isArray(req.body.case_ids)) fail('请选择待送厂口模');
    const factory=text(req.body.factory_name,150),ids=[...new Set(req.body.case_ids||[])].map(Number).sort((a,b)=>a-b);
    if(!factory || !ids.length || ids.length>100 || !ids.every(positiveId))fail('请选择工厂并勾选 1～100 张待送厂交付单');
    for(const id of ids)await accessCase(id,req.user);
    const id=await transaction(async conn=>{
      const molds=[];
      for(const id of ids){
        const c=await lockCase(conn,id);
        const [[p]]=await conn.execute('SELECT * FROM fulfillment_mold_profiles WHERE fulfillment_case_id=? FOR UPDATE',[id]);
        if(c.status!=='mold_taken'||p?.status!=='completed'||!p.mold_id)fail('部分口模已被加入批次或未完成资料，请刷新后重试',409);
        molds.push(p);
      }
      const batchNo='FM'+Date.now()+crypto.randomBytes(3).toString('hex');
      const [b]=await conn.execute('INSERT INTO fulfillment_factory_batches(batch_no,factory_name,created_by) VALUES(?,?,?)',[batchNo,factory,req.user.id]);
      for(const p of molds){
        await conn.execute('INSERT INTO fulfillment_factory_items(batch_id,fulfillment_case_id,mold_id,active_mold_id) VALUES(?,?,?,?)',[b.insertId,p.fulfillment_case_id,p.mold_id,p.mold_id]);
        await conn.execute("UPDATE fulfillment_cases SET status='mold_batched' WHERE id=?",[p.fulfillment_case_id]);
        await event(conn,p.fulfillment_case_id,req.user.id,'factory_batch_created',{batch_id:b.insertId,batch_no:batchNo,factory_name:factory});
      }return b.insertId;
    });ok(res,{id},'送厂批次已生成，尚未寄出');
  });
  route('get','/batches/:id',async(req,res)=>{
    const b=await accessBatch(req.params.id,req.user);
    for(const item of b.items){
      const c=await get('SELECT * FROM fulfillment_cases WHERE id=?',[item.fulfillment_case_id]);
      const profile=await get('SELECT * FROM fulfillment_mold_profiles WHERE fulfillment_case_id=?',[c.id]);
      item.snapshot=item.snapshot?decode(item.snapshot):b.status==='draft'?await manufacturingSnapshot(c,profile):null;
      if(item.status==='returned') item.receipt=await get(`SELECT r.device_serial_no,r.storage_location,r.inspection_result,r.note,r.received_at,a.name AS receiver_name
        FROM fulfillment_device_receipts r LEFT JOIN admin_users a ON a.id=r.receiver_id
        WHERE r.fulfillment_case_id=? ORDER BY r.id DESC LIMIT 1`,[c.id]);
    }ok(res,b);
  });
  route('post','/batches/:id/cancel',async(req,res)=>{
    const batch=await accessBatch(req.params.id,req.user);
    await transaction(async conn=>{
      const [[b]]=await conn.execute('SELECT * FROM fulfillment_factory_batches WHERE id=? FOR UPDATE',[batch.id]);
      if(b.status!=='draft')fail('只有未寄出的批次可以取消',409);
      for(const item of batch.items){
        const c=await lockCase(conn,item.fulfillment_case_id);
        if(c.status!=='mold_batched')fail('交付单状态已变化',409);
        await conn.execute("UPDATE fulfillment_cases SET status='mold_taken' WHERE id=?",[c.id]);
        await conn.execute("UPDATE fulfillment_factory_items SET status='cancelled',active_mold_id=NULL WHERE id=?",[item.id]);
        await event(conn,c.id,req.user.id,'factory_batch_cancelled',{batch_id:batch.id});
      }
      await conn.execute("UPDATE fulfillment_factory_batches SET status='cancelled' WHERE id=?",[batch.id]);
    });ok(res,null,'批次已取消，口模已退回待送厂');
  });
  route('post','/batches/:id/ship',async(req,res)=>{
    const batch=await accessBatch(req.params.id,req.user);
    const carrier=text(req.body.carrier,100),tracking=text(req.body.tracking_no,100);
    if(!carrier||!tracking||req.body.confirmed!==true)fail('请填写快递信息并确认实物已核对寄出');
    await transaction(async conn=>{
      const [[b]]=await conn.execute('SELECT * FROM fulfillment_factory_batches WHERE id=? FOR UPDATE',[batch.id]);
      if(b.status!=='draft')fail('此批次已经寄出或取消，请勿重复提交',409);
      for(const item of batch.items){
        const c=await lockCase(conn,item.fulfillment_case_id);
        if(c.status!=='mold_batched')fail('交付单状态已变化',409);
        const [[profile]]=await conn.execute('SELECT * FROM fulfillment_mold_profiles WHERE fulfillment_case_id=?',[c.id]);
        const snapshot=await manufacturingSnapshot(c,profile,conn);
        await conn.execute("UPDATE fulfillment_factory_items SET snapshot=?,status='shipped' WHERE id=?",[JSON.stringify(snapshot),item.id]);
        await conn.execute('INSERT INTO fulfillment_mold_shipments(fulfillment_case_id,sender_id,carrier,tracking_no,note) VALUES(?,?,?,?,?)',[c.id,req.user.id,carrier,tracking,`批次 ${b.batch_no} · ${b.factory_name}`]);
        await conn.execute("UPDATE fulfillment_cases SET status='mold_shipped' WHERE id=?",[c.id]);
        await event(conn,c.id,req.user.id,'factory_batch_shipped',{batch_id:b.id,carrier,tracking_no:tracking,snapshot});
      }
      await conn.execute("UPDATE fulfillment_factory_batches SET status='shipped',carrier=?,tracking_no=?,sent_at=NOW(),sender_id=? WHERE id=?",[carrier,tracking,req.user.id,b.id]);
    });ok(res,null,'已确认寄出，制作资料快照已锁定');
  });
  route('post','/batches/:id/items/:itemId/progress',async(req,res)=>{
    const batch=await accessBatch(req.params.id,req.user),item=batch.items.find(i=>String(i.id)===req.params.itemId);
    if(!item)fail('批次明细不存在',404);
    const action=req.body.action,feedback=text(req.body.feedback);
    const allowed={received:['shipped'],producing:['received','exception'],exception:['shipped','received','producing'],retake:['shipped','received','producing','exception']};
    if(!allowed[action])fail('不支持的工厂操作');
    if(['exception','retake'].includes(action)&&!feedback)fail('请填写异常或重新取模原因');
    await transaction(async conn=>{
      const [[b]]=await conn.execute('SELECT * FROM fulfillment_factory_batches WHERE id=? FOR UPDATE',[batch.id]);
      const c=await lockCase(conn,item.fulfillment_case_id);
      const [[i]]=await conn.execute('SELECT * FROM fulfillment_factory_items WHERE id=? FOR UPDATE',[item.id]);
      if(b.status!=='shipped'||!allowed[action].includes(i.status))fail('当前状态不能执行此操作，请刷新',409);
      await conn.execute("UPDATE fulfillment_factory_items SET status=?,feedback=?,received_at=CASE WHEN ?='received' THEN NOW() ELSE received_at END WHERE id=?",[action,feedback,action,i.id]);
      const next={received:'factory_received',producing:'producing',exception:'factory_exception',retake:'assigned'}[action];
      await conn.execute('UPDATE fulfillment_cases SET status=? WHERE id=?',[next,c.id]);
      if(action==='retake'){
        const [[p]]=await conn.execute('SELECT details FROM fulfillment_mold_profiles WHERE fulfillment_case_id=?',[c.id]);
        const d=decode(p.details);d.mold_no='';d.taken_date='';d.file_ids=[];
        await conn.execute("UPDATE fulfillment_mold_profiles SET mold_id=NULL,status='draft',details=?,revision=revision+1,updated_by=? WHERE fulfillment_case_id=?",[JSON.stringify(d),req.user.id,c.id]);
      }
      await event(conn,c.id,req.user.id,'factory_'+action,{batch_id:batch.id,item_id:i.id,feedback});
    });ok(res);
  });
  route('post','/cases/:id/mold-shipment',async()=>fail('请在送厂批次中汇总并确认寄出，不能单独跳过批次',409));
  route('post','/cases/:id/device-receipt',async(req,res)=>{
    const c=await accessCase(req.params.id,req.user);
    const serial=text(req.body.device_serial_no,100),location=text(req.body.storage_location,150),note=text(req.body.note);
    if(!serial||!location)fail('请填写设备编号和入库位置');
    if(req.body.inspection_result && req.body.inspection_result!=='passed')fail('验收未通过请登记工厂异常，不可直接入库');
    await transaction(async conn=>{
      const locked=await lockCase(conn,c.id);
      if(!['factory_received','producing'].includes(locked.status))fail('请先登记工厂签收；异常需先处理后再验收入库',409);
      const [[item]]=await conn.execute("SELECT * FROM fulfillment_factory_items WHERE fulfillment_case_id=? AND status IN ('received','producing') ORDER BY id DESC LIMIT 1 FOR UPDATE",[c.id]);
      if(!item)fail('未找到待回货的送厂明细',409);
      await conn.execute("INSERT INTO fulfillment_device_receipts(fulfillment_case_id,receiver_id,device_serial_no,storage_location,inspection_result,note) VALUES(?,?,?,?,'passed',?)",[c.id,req.user.id,serial,location,note]);
      await conn.execute("UPDATE fulfillment_factory_items SET status='returned',returned_at=NOW() WHERE id=?",[item.id]);
      await conn.execute("UPDATE fulfillment_cases SET status='device_received' WHERE id=?",[c.id]);
      await event(conn,c.id,req.user.id,'device_received',{batch_id:item.batch_id,item_id:item.id,device_serial_no:serial,storage_location:location,note});
    });ok(res,null,'此件设备已验收入库，其他明细保持原状态');
  });
}
