import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Auth,same} from './auth.mjs';
import {Vault,masterKey} from './vault.mjs';
import {Runtime,Slots} from './runtime.mjs';
import {newFlow,validateFlow,publicWorkspace,portableWorkspace} from './flows.mjs';
import {PROVIDERS,ProviderError} from './providers.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.resolve(process.env.IQT_DATA_DIR||path.join(ROOT,'data-v2'));
await mkdir(DATA,{recursive:true,mode:0o700});
const key=await masterKey(DATA),port=Number(process.env.PORT||8787);
const origin=process.env.IQT_PUBLIC_ORIGIN||`http://127.0.0.1:${port}`,basePath=process.env.IQT_BASE_PATH||'/';
if(!basePath.startsWith('/')||!basePath.endsWith('/')||basePath.includes('//'))throw Error('Ruta base no válida');
const publicUrl=new URL(origin);
if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.origin!==origin)throw Error('Origen no válido');
if(publicUrl.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(publicUrl.hostname))throw Error('El acceso público necesita HTTPS');
const mode=process.env.IQT_AUTH_MODE||'standalone';
const auth=new Auth({mode,password:process.env.IQT_PASSWORD,origin,basePath});
const entries=new Map(),slots=new Slots(Math.max(1,Math.min(10,Number(process.env.IQT_MAX_CONNECTIONS||2))));
const loading=new Map();
async function tenant(id){
 if(entries.has(id)){const e=entries.get(id);e.at=Date.now();return e;}
 if(loading.has(id))return loading.get(id);
 if(entries.size+loading.size>=20)throw new ProviderError('Capacidad temporal alcanzada.',429);
 const pending=(async()=>{
  const vault=new Vault(DATA,key,id);let workspace=await vault.read('workspace',null);
  if(!workspace){const f=newFlow();workspace={flows:[f],activeFlowId:f.id,keys:{}};}
  for(const f of workspace.flows)f.enabled=false;
  const entry={vault,workspace,at:Date.now(),cookie:null,rate:[]};
  entry.save=()=>vault.save('workspace',{...entry.workspace,flows:entry.workspace.flows.map(f=>({...f,enabled:false}))});
  entry.runtime=await new Runtime({vault,workspace,save:entry.save,slots}).init();entries.set(id,entry);return entry;
 })();loading.set(id,pending);try{return await pending;}finally{loading.delete(id);}
}
const html=await readFile(path.join(ROOT,'public/index.html')),js=await readFile(path.join(ROOT,'public/app.js'));
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req){
 if(!(req.headers['content-type']||'').startsWith('application/json'))throw Error('Se necesita JSON');
 let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>50000)throw Error('Petición demasiado grande');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
 if(req.headers.host!==publicUrl.host||(req.headers.origin&&req.headers.origin!==origin))return json(res,403,{error:'Origen no permitido'});
 const url=new URL(req.url,origin);
 try{
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,version:'0.2.0'});
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(js);}
  if(req.method==='POST'&&url.pathname==='/api/login'){
   if(mode!=='standalone')return json(res,400,{error:'Accede con tu cuenta de Tools.'});
   const data=await body(req);res.setHeader('Set-Cookie',auth.login(req,data.password));return json(res,200,{ok:true});
  }
  const user=await auth.identify(req);
  if(!user)return json(res,401,{error:'Inicia sesión para abrir tu espacio.',login:mode==='tools'?'/cuenta/entrar?next='+encodeURIComponent(basePath):null});
  const entry=await tenant(user);entry.cookie=req.headers.cookie||null;
  const {runtime,vault}=entry;
  if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,{...runtime.state,...publicWorkspace(entry.workspace),events:runtime.events,budget:runtime.budget,csrf:vault.csrf(),providers:PROVIDERS,mode,connectionLimit:slots.max});
  if(req.method==='GET'&&url.pathname==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="automatizacion-whatsapp.json"');return json(res,200,portableWorkspace(entry.workspace));}
  if(req.method!=='POST')return json(res,404,{error:'No encontrado'});
  if(!same(req.headers['x-csrf-token'],vault.csrf()))return json(res,403,{error:'Actualiza el panel antes de continuar.'});
  entry.rate=entry.rate.filter(t=>Date.now()-t<60000);if(entry.rate.length>=30)return json(res,429,{error:'Espera un minuto antes de hacer más operaciones.'});entry.rate.push(Date.now());
  const data=await body(req);
  if(url.pathname==='/api/flow'){
   await runtime.queue;const f=validateFlow(data.flow),index=entry.workspace.flows.findIndex(x=>x.id===f.id);
   if(index<0)throw Error('El flujo no pertenece a este espacio');
   if(f.enabled&&runtime.state.connection!=='open')throw Error('Conecta WhatsApp antes de activar');
   if(typeof data.apiKey==='string'&&data.apiKey.trim()){if(data.apiKey.length>1000)throw Error('Clave no válida');entry.workspace.keys[f.provider]=data.apiKey.trim();}
   if(f.enabled&&!entry.workspace.keys[f.provider])throw Error('Guarda tu clave de API');
   entry.workspace.flows[index]=f;runtime.histories.clear();await entry.save();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/new'){
   await runtime.queue;if(entry.workspace.flows.length>=3)throw Error('Máximo tres automatizaciones');
   for(const f of entry.workspace.flows)f.enabled=false;const f=newFlow(data.template);entry.workspace.flows.push(f);entry.workspace.activeFlowId=f.id;runtime.histories.clear();await entry.save();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/select'){
   await runtime.queue;if(!entry.workspace.flows.some(f=>f.id===data.id))throw Error('Flujo no encontrado');
   for(const f of entry.workspace.flows)f.enabled=false;entry.workspace.activeFlowId=data.id;runtime.histories.clear();await entry.save();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/import'){
   await runtime.queue;const w=data.workspace;
   if(w?.version!==2||!Array.isArray(w.flows)||!w.flows.length||w.flows.length>3)throw Error('Archivo de automatización no válido');
   const flows=w.flows.map(f=>validateFlow({...f,enabled:false,disclosureAccepted:false,pilot:true,allowedPhones:[]}));
   if(new Set(flows.map(f=>f.id)).size!==flows.length)throw Error('Identificadores repetidos');
   entry.workspace.flows=flows;entry.workspace.activeFlowId=flows.some(f=>f.id===w.activeFlowId)?w.activeFlowId:flows[0].id;runtime.histories.clear();await entry.save();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/key/delete'){
   if(!Object.hasOwn(PROVIDERS,data.provider))throw Error('Proveedor no válido');for(const f of entry.workspace.flows)if(f.provider===data.provider)f.enabled=false;
   await runtime.queue;delete entry.workspace.keys[data.provider];await entry.save();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/test'){
   if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2000)throw Error('Mensaje de hasta 2.000 caracteres');
   const result=await runtime.test(data.text);return json(res,200,{text:result.text});
  }
  if(url.pathname==='/api/connect'){await runtime.connect();return json(res,200,{ok:true});}
  if(url.pathname==='/api/disconnect'){await runtime.disconnect();return json(res,200,{ok:true});}
  if(url.pathname==='/api/pause'){for(const f of entry.workspace.flows)f.enabled=false;await entry.save();runtime.event('pausa','Pausado por el propietario');return json(res,200,{ok:true});}
  if(url.pathname==='/api/logout'){await runtime.disconnect();res.setHeader('Set-Cookie',auth.logout(req));return json(res,200,{ok:true});}
  return json(res,404,{error:'No encontrado'});
 }catch(e){return json(res,e instanceof ProviderError?e.status:400,{error:e instanceof ProviderError||e.message?.length<200?e.message:'No se pudo completar la operación'});}
});
server.requestTimeout=15000;server.headersTimeout=10000;
const timer=setInterval(async()=>{
 try{for(const[id,e]of entries){
  if(mode==='tools'&&slots.members.has(e.runtime)&&e.cookie&&!(await auth.identify({headers:{cookie:e.cookie}}))){await e.runtime.disconnect();e.runtime.state.error='La sesión de Tools ha caducado o se ha revocado';}
  if(!slots.members.has(e.runtime)&&Date.now()-e.at>30*60000){e.runtime.stop();entries.delete(id);}
 }}catch{/* Remain fail-closed on the next authenticated request. */}
},5*60000);timer.unref();
server.listen(port,process.env.IQT_HOST||'127.0.0.1',()=>console.log(`WhatsApp IA 0.2 · ${origin}${basePath} · ${mode}`));
async function stop(){clearInterval(timer);for(const e of entries.values())e.runtime.stop();await Promise.allSettled([...entries.values()].map(e=>e.runtime.queue));server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
