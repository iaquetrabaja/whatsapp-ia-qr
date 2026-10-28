const $=id=>document.getElementById(id);let state,csrf='',loaded=false,dirty=false;
const route=name=>new URL('api/'+name,location.href).toString();
async function api(name,data){const r=await fetch(route(name),{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok){if(r.status===401){$('workspace').hidden=true;$('login').hidden=false;if(result.login){$('tools-login').href=result.login;$('tools-login').hidden=false;$('local-login').hidden=true;}}throw Error(result.error);}return result;}
async function run(fn){try{$('alert').textContent='';await fn();}catch(e){$('alert').textContent=e.message;}}
function provider(){const p=state.providers[$('provider').value];$('pricing').textContent=p.pricing;$('get-key').href=p.keyUrl;}
function display(s){
 state=s;csrf=s.csrf;$('login').hidden=true;$('workspace').hidden=false;
 const labels={open:'WhatsApp conectado',qr:'Escanea el QR',connecting:'Conectando…',closed:'Conexión cerrada',disconnected:'Sin conectar',error:'Revisar conexión',logged_out:'Sesión cerrada'};
 $('connection').textContent=labels[s.connection]||s.connection;$('qr').hidden=!s.qr;if(s.qr)$('qr').src=s.qr;
 $('connect').disabled=['open','qr','connecting'].includes(s.connection);
 $('budget').textContent='En cola: '+(s.pendingMessages||0)+'. Llamadas contabilizadas hoy: '+(s.budget.date===new Date().toISOString().slice(0,10)?s.budget.calls:0)+'. Las cuotas del proveedor son independientes.';
 $('hosting').textContent=s.mode==='tools'?'Instancia alojada: hasta '+s.connectionLimit+' conexiones simultáneas en total. Puedes cerrar el navegador y el ordenador; el proceso está en el servidor. Cerrar sesión en Tools o su caducidad detiene la conexión en el siguiente control.':'El programa debe seguir activo en tu servidor. Puedes cerrar el navegador; no detengas el servicio.';
 $('activity').replaceChildren(...s.events.map(e=>{const li=document.createElement('li');li.textContent=new Date(e.time).toLocaleTimeString()+' · '+e.type+': '+e.result;return li;}));
 if(s.error)$('alert').textContent=s.error;
 const job=s.websiteJob&&s.websiteJob.flowId===s.activeFlowId?s.websiteJob:null;
 $('website-status').textContent=job?.status==='running'?'Analizando la web: '+job.pages+' páginas leídas…':job?.status==='error'?'No se completó: '+job.error+(s.knowledge?' Se conserva el conocimiento anterior.':''):s.knowledge?s.knowledge.pages+' páginas indexadas. Revisión: '+new Date(s.knowledge.fetchedAt).toLocaleString()+(s.knowledge.truncated?' · Análisis parcial: quedan páginas fuera del límite.':''):'Todavía no hay una web analizada para este flujo.';
 $('website-start').disabled=job?.status==='running';$('connector-card').hidden=s.mode!=='standalone';
 if(!loaded){
  const f=s.flows.find(f=>f.id===s.activeFlowId)||s.flows[0];
  $('flows').replaceChildren(...s.flows.map(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;return o;}));$('flows').value=f.id;
  $('provider').replaceChildren(...Object.entries(s.providers).map(([id,p])=>{const o=document.createElement('option');o.value=id;o.textContent=p.name;return o;}));
  for(const name of ['name','trigger','keyword','context','instructions','provider'])$(name).value=f[name];
  modelOptions([{id:f.model,name:f.model}],f.model);
  $('hourly-limit').value=f.hourlyLimit??120;$('cooldown').value=f.cooldownSeconds??2;
  $('website-url').value=f.websiteUrl||'';$('auto-refresh').checked=f.autoRefresh!==false;
  $('connector-url').value=f.connector?.url||'';$('connector-fields').value=f.connector?.fields||'';$('connector-header').value=f.connector?.header||'Authorization';$('connector-enabled').checked=f.connector?.enabled||false;$('connector-auth').value='';$('connector-key-state').textContent=f.connectorSecretConfigured?'Autorización guardada. Deja el campo vacío para conservarla.':'Sin autorización guardada.';
  $('max-requests').value=f.maxRequests;$('max-tokens').value=f.maxTokens;$('pilot').checked=f.pilot;$('phones').value=f.allowedPhones.join(', ');$('enabled').checked=f.enabled;$('disclosure').checked=f.disclosureAccepted;$('api-key').value='';
  $('key-state').textContent=f.apiKeyConfigured?'Ya tienes una clave guardada para este proveedor. Deja el campo vacío para conservarla.':'Este proveedor aún no tiene una clave guardada.';provider();loaded=true;dirty=false;
 }
 if(!dirty){const f=s.flows.find(f=>f.id===s.activeFlowId);if(f)$('enabled').checked=f.enabled;}
}
async function refresh(){display(await api('state'));}
function draft(){const old=state.flows.find(f=>f.id===$('flows').value);return {...old,name:$('name').value,trigger:$('trigger').value,keyword:$('keyword').value,context:$('context').value,websiteUrl:$('website-url').value.trim(),autoRefresh:$('auto-refresh').checked,instructions:$('instructions').value,provider:$('provider').value,model:$('model').value,hourlyLimit:Number($('hourly-limit').value),cooldownSeconds:Number($('cooldown').value),maxRequests:Number($('max-requests').value),maxTokens:Number($('max-tokens').value),pilot:$('pilot').checked,allowedPhones:$('phones').value.split(',').map(x=>x.trim()).filter(Boolean),enabled:$('enabled').checked,disclosureAccepted:$('disclosure').checked};}
document.querySelectorAll('#workspace input:not(#import-file),#workspace textarea:not(#test),#workspace select:not(#flows)').forEach(e=>{if(!e.closest('#connector-card'))e.addEventListener('input',()=>{dirty=true;});});
$('provider').onchange=()=>{const p=state.providers[$('provider').value];modelOptions(p.model?[{id:p.model,name:p.model}]:[] ,p.model);$('api-key').value='';$('key-state').textContent='Introduce una clave para este proveedor o deja el campo vacío si ya guardaste una.';provider();$('model-status').textContent='Carga el catálogo disponible para este proveedor.';dirty=true;if($('provider').value==='openrouter'||state.flows.some(f=>f.provider===$('provider').value&&f.apiKeyConfigured))$('load-models').click();};
$('sign-in').onclick=()=>run(async()=>{await api('login',{password:$('password').value});$('password').value='';loaded=false;await refresh();});
$('save').onclick=()=>run(async()=>{await api('flow',{flow:draft(),apiKey:$('api-key').value});loaded=false;await refresh();$('answer').textContent='Configuración guardada. Ya puedes probar la IA.';});
$('test-ai').onclick=()=>run(async()=>{if(dirty)throw Error('Guarda los cambios antes de probar.');$('test-ai').disabled=true;try{const r=await api('test',{text:$('test').value});$('answer').textContent=r.text;await refresh();}finally{$('test-ai').disabled=false;}});
$('connect').onclick=()=>run(async()=>{await api('connect',{});await refresh();});
$('disconnect').onclick=()=>run(async()=>{await api('disconnect',{});loaded=false;await refresh();});
$('pause').onclick=()=>run(async()=>{await api('pause',{});$('enabled').checked=false;await refresh();});
$('flows').onchange=()=>run(async()=>{if(dirty){$('flows').value=state.activeFlowId;throw Error('Guarda tus cambios antes de cambiar de flujo.');}await api('select',{id:$('flows').value});loaded=false;await refresh();});
document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>run(async()=>{if(dirty)throw Error('Guarda primero el flujo actual.');await api('new',{template:b.dataset.template});loaded=false;await refresh();}));
$('delete-key').onclick=()=>run(async()=>{await api('key/delete',{provider:$('provider').value});loaded=false;await refresh();});
$('export').onclick=()=>run(async()=>{const w=await api('export');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(w,null,2)],{type:'application/json'}));a.download='automatizacion-whatsapp.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
$('import-file').onchange=()=>run(async()=>{const f=$('import-file').files[0];if(!f)return;if(f.size>50000)throw Error('El archivo supera 50 KB.');await api('import',{workspace:JSON.parse(await f.text())});loaded=false;await refresh();});
$('website-start').onclick=()=>run(async()=>{await api('flow',{flow:draft(),apiKey:$('api-key').value});await api('website/start',{url:$('website-url').value.trim()});loaded=false;await refresh();});
function connector(){return{enabled:$('connector-enabled').checked,url:$('connector-url').value.trim(),fields:$('connector-fields').value,header:$('connector-header').value};}
$('connector-save').onclick=()=>run(async()=>{if(dirty)throw Error('Guarda primero los cambios del flujo.');await api('connector',{connector:connector(),authorization:$('connector-auth').value});loaded=false;await refresh();});
$('connector-delete-secret').onclick=()=>run(async()=>{if(dirty)throw Error('Guarda primero el flujo.');await api('connector',{connector:connector(),removeSecret:true});loaded=false;await refresh();});
$('connector-test').onclick=()=>run(async()=>{const r=await api('connector/test',{});$('connector-preview').textContent=r.text;});
run(refresh);setInterval(()=>{if(loaded)refresh().catch(e=>{$('alert').textContent=e.message;});},4000);

function modelOptions(models,selected){$('model').replaceChildren(...models.map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.name===m.id?m.id:m.name+' · '+m.id;return o;}));if(models.some(m=>m.id===selected))$('model').value=selected;}
$('load-models').onclick=()=>run(async()=>{const selectedProvider=$('provider').value,selected=$('model').value;$('load-models').disabled=true;try{const r=await api('models',{provider:selectedProvider,apiKey:$('api-key').value});if(selectedProvider!==$('provider').value)return;modelOptions(r.models,selected);dirty=true;$('model-status').textContent=r.models.length+' modelos de texto en el catálogo. Guarda y prueba el elegido: la lista no garantiza saldo ni cuota.';}finally{$('load-models').disabled=false;}});
