import { randomUUID } from 'node:crypto';
import { validateProvider } from './providers.mjs';
export function newFlow(template='soporte') {
  const presets={soporte:'Atiende dudas usando únicamente el contexto del negocio. Si no puedes responder, pide que escriban PERSONA.',ventas:'Ayuda a elegir entre los productos descritos en el contexto. No inventes descuentos ni confirmes pedidos.',citas:'Recoge qué servicio, día y horario prefiere el cliente. Explica que una persona debe confirmar la cita.'};
  return {id:randomUUID(),name:template==='citas'?'Solicitudes de cita':template==='ventas'?'Asesor de productos':'Atención al cliente',provider:'gemini',model:'gemini-2.5-flash-lite',context:'',websiteUrl:'',autoRefresh:true,connector:{enabled:false,url:'',fields:''},instructions:presets[template]||presets.soporte,trigger:'all',keyword:'',maxRequests:1000,maxTokens:256,hourlyLimit:120,cooldownSeconds:2,pilot:true,allowedPhones:[],disclosureAccepted:false,enabled:false};
}
export function validateFlow(input) {
  if(!input||typeof input!=='object')throw Error('Flujo no válido');
  validateProvider(input.provider,input.model);
  if(!/^[a-f0-9-]{36}$/.test(input.id||''))throw Error('Identificador de flujo no válido');
  for(const [field,max] of [['name',80],['context',8000],['instructions',3000],['keyword',60]])if(typeof input[field]!=='string'||input[field].length>max)throw Error('Revisa el campo '+field);
  if(!input.name.trim()||!input.instructions.trim())throw Error('Pon un nombre e instrucciones al asistente.');
  if(!['all','keyword'].includes(input.trigger)||(input.trigger==='keyword'&&input.keyword.trim().length<2))throw Error('Indica qué mensajes deben activar el flujo.');
  if(!Number.isInteger(input.maxRequests)||input.maxRequests<1||input.maxRequests>10000||!Number.isInteger(input.maxTokens)||input.maxTokens<64||input.maxTokens>512)throw Error('Límites no válidos: 1–200 peticiones diarias y 64–512 tokens de salida.');
  for(const [k,fallback,min,max] of [['hourlyLimit',120,1,1000],['cooldownSeconds',2,0,300]]){input[k]??=fallback;if(!Number.isInteger(input[k])||input[k]<min||input[k]>max)throw Error('Límite de negocio no válido: '+k);}
  if(typeof input.pilot!=='boolean'||typeof input.enabled!=='boolean'||typeof input.disclosureAccepted!=='boolean')throw Error('Revisa las opciones del flujo.');
  if(!Array.isArray(input.allowedPhones)||input.allowedPhones.length>20||input.allowedPhones.some(p=>!/^\d{8,15}$/.test(p)))throw Error('Números de prueba no válidos.');
  if(typeof input.websiteUrl!=='string'||input.websiteUrl.length>2000||typeof input.autoRefresh!=='boolean')throw Error('Revisa la URL de la web');
  if(input.enabled&&(!input.disclosureAccepted||(!input.context.trim()&&!input.websiteUrl)||(input.pilot&&!input.allowedPhones.length)))throw Error('Añade contexto o una web analizada, autoriza el tratamiento y configura un número de prueba.');
  const output=Object.fromEntries(['id','name','provider','model','context','websiteUrl','autoRefresh','instructions','trigger','keyword','maxRequests','maxTokens','hourlyLimit','cooldownSeconds','pilot','allowedPhones','disclosureAccepted','enabled'].map(k=>[k,input[k]]));
  output.connector={enabled:input.connector?.enabled===true,url:String(input.connector?.url||'').slice(0,2000),fields:String(input.connector?.fields||'').slice(0,1000),header:input.connector?.header||'Authorization'};return output;
}
export function publicWorkspace(workspace) { return {activeFlowId:workspace.activeFlowId,flows:workspace.flows.map(f=>({...f,apiKeyConfigured:!!workspace.keys?.[f.provider],connectorSecretConfigured:!!workspace.connectorSecrets?.[f.id]}))}; }
export function portableWorkspace(workspace) {return {version:2,activeFlowId:workspace.activeFlowId,flows:workspace.flows.map(f=>({...f,connector:{...f.connector,enabled:false},enabled:false,disclosureAccepted:false,allowedPhones:[]}))};}
