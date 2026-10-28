import { randomUUID } from 'node:crypto';
import { validateProvider } from './providers.mjs';
export function newFlow(template='soporte') {
  const presets={soporte:'Atiende dudas usando únicamente el contexto del negocio. Si no puedes responder, pide que escriban PERSONA.',ventas:'Ayuda a elegir entre los productos descritos en el contexto. No inventes descuentos ni confirmes pedidos.',citas:'Recoge qué servicio, día y horario prefiere el cliente. Explica que una persona debe confirmar la cita.'};
  return {id:randomUUID(),name:template==='citas'?'Solicitudes de cita':template==='ventas'?'Asesor de productos':'Atención al cliente',provider:'gemini',model:'gemini-2.5-flash-lite',context:'',instructions:presets[template]||presets.soporte,trigger:'all',keyword:'',maxRequests:20,maxTokens:256,pilot:true,allowedPhones:[],disclosureAccepted:false,enabled:false};
}
export function validateFlow(input) {
  if(!input||typeof input!=='object')throw Error('Flujo no válido');
  validateProvider(input.provider,input.model);
  if(!/^[a-f0-9-]{36}$/.test(input.id||''))throw Error('Identificador de flujo no válido');
  for(const [field,max] of [['name',80],['context',8000],['instructions',3000],['keyword',60]])if(typeof input[field]!=='string'||input[field].length>max)throw Error('Revisa el campo '+field);
  if(!input.name.trim()||!input.instructions.trim())throw Error('Pon un nombre e instrucciones al asistente.');
  if(!['all','keyword'].includes(input.trigger)||(input.trigger==='keyword'&&input.keyword.trim().length<2))throw Error('Indica qué mensajes deben activar el flujo.');
  if(!Number.isInteger(input.maxRequests)||input.maxRequests<1||input.maxRequests>200||!Number.isInteger(input.maxTokens)||input.maxTokens<64||input.maxTokens>512)throw Error('Límites no válidos: 1–200 peticiones diarias y 64–512 tokens de salida.');
  if(typeof input.pilot!=='boolean'||typeof input.enabled!=='boolean'||typeof input.disclosureAccepted!=='boolean')throw Error('Revisa las opciones del flujo.');
  if(!Array.isArray(input.allowedPhones)||input.allowedPhones.length>20||input.allowedPhones.some(p=>!/^\d{8,15}$/.test(p)))throw Error('Números de prueba no válidos.');
  if(input.enabled&&(!input.disclosureAccepted||!input.context.trim()||(input.pilot&&!input.allowedPhones.length)))throw Error('Añade contexto, autoriza el tratamiento por tu proveedor y configura un número de prueba.');
  return Object.fromEntries(['id','name','provider','model','context','instructions','trigger','keyword','maxRequests','maxTokens','pilot','allowedPhones','disclosureAccepted','enabled'].map(k=>[k,input[k]]));
}
export function publicWorkspace(workspace) { return {activeFlowId:workspace.activeFlowId,flows:workspace.flows.map(f=>({...f,apiKeyConfigured:!!workspace.keys?.[f.provider]}))}; }
export function portableWorkspace(workspace) {return {version:2,activeFlowId:workspace.activeFlowId,flows:workspace.flows.map(f=>({...f,enabled:false,disclosureAccepted:false,allowedPhones:[]}))};}
