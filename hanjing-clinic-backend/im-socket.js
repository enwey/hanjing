import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { transaction } from './db.js';
import { JWT_SECRET } from './helpers.js';
import { canUseLocalDevLogin } from './local-dev-login.js';
import { resolveImPatient, validateImText } from './im-access.js';

const activeClients = new Map();
async function validateSocket(ws, conn=null) {
 const decoded=jwt.verify(ws.accessToken,JWT_SECRET);
 if(!decoded?.openid || !decoded.id || decoded.scope==='asset' || Number(decoded.id)!==Number(ws.userId))throw Error('登录已过期');
 return resolveImPatient(ws.userId,ws.requestedPatientId,conn);
}
function removeSocket(ws) {
 const sockets=activeClients.get(Number(ws.patientId));
 if(sockets){sockets.delete(ws);if(!sockets.size)activeClients.delete(Number(ws.patientId));}
}
async function authorizedSockets(patientId) {
 const sockets=[...(activeClients.get(Number(patientId)) || [])],valid=[];
 for(const ws of sockets) {
  if(ws.readyState!==1){removeSocket(ws);continue;}
  try {const patient=await validateSocket(ws);if(Number(patient.id)!==Number(patientId))throw Error('会话已变更');valid.push(ws);}
  catch {removeSocket(ws);ws.close(1008,'会话权限已失效');}
 }
 return valid;
}
export async function isPatientConversationOpen(patientId) {return (await authorizedSockets(patientId)).length>0;}
export async function publishPatientMessage(patientId,message) {
 const sockets=await authorizedSockets(patientId);
 const sent=await Promise.all(sockets.map(ws=>new Promise(resolve=>{
  if(ws.readyState!==1)return resolve(false);
  try{ws.send(JSON.stringify({type:'message',...message}),error=>resolve(!error));}catch{resolve(false);}
 })));
 return sent.filter(Boolean).length;
}
export function initWebSocket(server) {
 const wss=new WebSocketServer({noServer:true,maxPayload:64*1024});
 const upgrade=async(request,socket,head)=>{
  const reject=code=>{socket.write(`HTTP/1.1 ${code} ${code===404?'Not Found':'Forbidden'}\r\n\r\n`);socket.destroy();};
  try {
   const url=new URL(request.url,'http://localhost');
   if(url.pathname!=='/api/v1/im/ws')return reject(404);
   const token=url.searchParams.get('token');
   let user;try{user=jwt.verify(token,JWT_SECRET);}catch{return reject(403);}
   if(!user?.openid || !user.id || user.scope==='asset' || (user.authSource==='local-dev'&&!canUseLocalDevLogin(request)))return reject(403);
   let patient;try{patient=await resolveImPatient(user.id,url.searchParams.get('patientId'));}catch{return reject(404);}
   wss.handleUpgrade(request,socket,head,ws=>{
    ws.patientId=Number(patient.id);ws.patientName=patient.name;ws.userId=user.id;ws.accessToken=token;
    ws.requestedPatientId=url.searchParams.get('patientId');
    wss.emit('connection',ws,request);
   });
  }catch{reject(400);}
 };
 server.on('upgrade',upgrade);
 wss.on('connection',ws=>{
  if(!activeClients.has(ws.patientId))activeClients.set(ws.patientId,new Set());activeClients.get(ws.patientId).add(ws);
  ws.on('message',async message=>{
   try {
    const data=JSON.parse(message);
    if(data.type==='ping'){await validateSocket(ws);ws.send(JSON.stringify({type:'pong'}));return;}
    const text=validateImText(data.text);
    const result=await transaction(async conn=>{
     const patient=await validateSocket(ws,conn);
     if(Number(patient.id)!==ws.patientId)throw Object.assign(new Error('会话权限已失效'),{statusCode:404});
     const [inserted]=await conn.execute("INSERT INTO im_messages(patient_id,sender,sender_name,text,is_read) VALUES(?,'patient',?,?,0)",[patient.id,patient.name,text]);
     return inserted;
    });
    if(ws.readyState===1)ws.send(JSON.stringify({type:'ack',id:String(result.insertId),text,time:new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})}));
   }catch(error){
    if(error.statusCode===400 || error instanceof SyntaxError){if(ws.readyState===1)ws.send(JSON.stringify({type:'error',message:'消息格式错误，请检查后重试'}));}
    else {removeSocket(ws);ws.close(1008,'会话权限已失效');}
   }
  });
  ws.on('close',()=>removeSocket(ws));
  ws.on('error',()=>removeSocket(ws));
 });
 wss.on('close',()=>{server.off('upgrade',upgrade);for(const ws of wss.clients)removeSocket(ws);});
 return wss;
}
