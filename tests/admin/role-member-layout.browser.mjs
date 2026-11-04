import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const base='http://localhost:3000',port=9359;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyRoleMemberLayout({conn,api}) {
let browser,profile,ws;
const [saved]=await conn.query('SELECT permission_resource FROM permissions WHERE role_id=2');
const [savedScope]=await conn.query('SELECT data_scope FROM role_member_data_scopes WHERE role_id=2 AND admin_user_id=2');
try {
 profile=await mkdtemp(join(tmpdir(),'hanjing-permission-ui-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0,pending=new Map(),responses=[],exceptions=[];
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Fetch.requestPaused'){ const request=m.params.request; const url=new URL(request.url); (async()=>{const result=await api(url.pathname.replace('/api/admin/','')+url.search,1,request.postData?JSON.parse(request.postData):undefined,request.method);await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:result.status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(result.body)).toString('base64')});})().catch(e=>{exceptions.push(e.message);send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'});});}else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/admin/'))responses.push({url:new URL(m.params.response.url).pathname,status:m.params.response.status});else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Network.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/admin/*',requestStage:'Request'}]});
 const me=await api('me',1);assert.equal(me.status,200);
 const auth={token:'test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test'};
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(base)}){localStorage.setItem('auth_token',${JSON.stringify(auth.token)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me.body.data))});}`});
 const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await sleep(150);}throw Error('Timeout '+expression);};
 const click=async expression=>{assert.ok(await evaluate(`(()=>{const el=${expression};if(!el)return false;el.click();return true})()`));};
 const button=text=>`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && b.getBoundingClientRect().width>0)`;
 await conn.query("INSERT INTO permissions(role_id,permission_resource) VALUES(2,'patient:phone:view')");
 await send('Page.navigate',{url:base+'/permission/role-edit/2'});
 await wait("document.querySelector('.member-table tbody tr')?.innerText.includes('scope-doctor')");
 const layout=await evaluate(`(()=>{const cards=document.querySelectorAll('.card-grid-2>.panel');const table=document.querySelector('.member-panel');return {scopeTitle:cards[1].innerText,top:cards[1].getBoundingClientRect().top,memberTop:table.getBoundingClientRect().top,fields:table.querySelectorAll('input,select,textarea').length,headers:table.querySelector('thead').innerText}})()`);
 assert.ok(layout.scopeTitle.includes('查看数据范围'));assert.ok(layout.memberTop>layout.top);assert.equal(layout.fields,0);
 for(const label of ['账号','手机号','业务操作门店','关联医生','账号状态','最近登录','当前角色中的数据范围'])assert.ok(layout.headers.includes(label),label);
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-role-member-layout.png'),Buffer.from(screenshot.data,'base64'));

 const matrix = await evaluate("({rows:document.querySelectorAll('.permission-table tbody tr').length,labels:document.querySelector('.permission-table').innerText})");
 assert.equal(matrix.rows,28);for(const label of ['排队分诊','接诊工作台','查看手机号','退款','复制排班','确认打款','重置密码','数据库工具'])assert.ok(matrix.labels.includes(label),label);
 await evaluate("document.querySelector('.permission-table').scrollIntoView()");
 const matrixShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-granular-permission-matrix.png'),Buffer.from(matrixShot.data,'base64'));
 await evaluate("window.scrollTo(0,0)");
 await click(button('调整范围'));await wait("document.body.innerText.includes('当前角色数据范围')");
 await click("Array.from(document.querySelectorAll('.t-dialog .scope-options button')).find(b=>b.textContent==='系统数据' && b.getBoundingClientRect().width>0)");
 await click(button('确定'));await click(button('保存权限'));await wait("location.pathname==='/permission'");
 const member=(await api('users',1)).body.data.find(u=>u.id===2);assert.equal(member.role_member_data_scope.type,'system');
 assert.ok((await api('roles',1)).body.data.find(r=>r.id===2).permissions.includes('patient:phone:view'));
 console.log('PASS role layout swapped, comprehensive read-only members, current-role scope UI save, existing permissions preserved');
 await send('Page.navigate',{url:base+'/admin'});await wait("document.querySelector('.data-table')?.innerText.includes('scope-doctor')");
 await click(button('编辑'));await wait("document.querySelector('.modal-overlay') || document.querySelector('.t-dialog') || document.querySelector('input[type=password]')");
 assert.equal(await evaluate("document.querySelectorAll('.scope-editor').length"),0);
 assert.deepEqual(responses.filter(r=>r.status>=400),[]);assert.deepEqual(exceptions,[]);
 console.log('PASS member management has no account-level scope editor; no HTTP or runtime errors');
} finally {
 await conn.query('DELETE FROM role_member_data_scopes WHERE role_id=2 AND admin_user_id=2');
 if(savedScope.length)await conn.query('INSERT INTO role_member_data_scopes(role_id,admin_user_id,data_scope) VALUES(2,2,?)',[typeof savedScope[0].data_scope==='string'?savedScope[0].data_scope:JSON.stringify(savedScope[0].data_scope)]);
 await conn.query('DELETE FROM permissions WHERE role_id=2');
 for(const row of saved)await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[row.permission_resource]);
 if(ws)ws.close();if(browser){browser.kill();await sleep(700);}
 if(profile && resolve(profile).startsWith(resolve(tmpdir())+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}

}
