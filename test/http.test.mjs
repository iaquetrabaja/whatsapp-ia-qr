import{test}from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';import{mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';
test('authenticated workspace protects keys, CSRF, ownership and activation',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'iqt-wa-api-test-'));
 const password='test-only-password-at-least-16';
 const child=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:'18787',IQT_DATA_DIR:folder,IQT_AUTH_MODE:'standalone',IQT_PASSWORD:password},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('start timeout')),10000);child.stdout.on('data',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(Error('server exited'));});});
  const base='http://127.0.0.1:18787';const post=(route,data,headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await fetch(base+'/api/state')).status,401);
  const login=await post('login',{password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
  const s=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();assert.ok(s.csrf);assert.equal(s.flows[0].enabled,false);
  assert.equal((await post('pause',{}, {Cookie:cookie})).status,403);
  const headers={Cookie:cookie,'X-CSRF-Token':s.csrf};
  assert.equal((await post('pause',{}, {...headers,Origin:'https://attacker.test'})).status,403);
  assert.equal((await post('flow',{flow:{...s.flows[0],context:'Shop',disclosureAccepted:true},apiKey:'private-test-key'},headers)).status,200);
  const stateRaw=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).text();assert.ok(!stateRaw.includes('private-test-key'));assert.ok(JSON.parse(stateRaw).flows[0].apiKeyConfigured);
  assert.equal((await post('flow',{flow:{...s.flows[0],id:'00000000-0000-0000-0000-000000000000'}},headers)).status,400);
  const exported=await(await fetch(base+'/api/export',{headers:{Cookie:cookie}})).text();assert.ok(!exported.includes('private-test-key'));
  assert.equal((await post('key/delete',{provider:'gemini'},headers)).status,200);
  assert.equal((await post('test',{text:'hi'},headers)).status,400);
 }finally{
  child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));
  assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));assert.ok(path.basename(folder).startsWith('iqt-wa-api-test-'));await rm(folder,{recursive:true,force:true});
 }
});
