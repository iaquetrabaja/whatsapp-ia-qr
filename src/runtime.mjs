import { Engine,normalize } from './engine.mjs';
import { WhatsApp } from './whatsapp.mjs';
import { generate,systemPrompt,ProviderError } from './providers.mjs';
import{relevantKnowledge}from'./web-knowledge.mjs';import{connectorContext}from'./connectors.mjs';
export class Runtime {
  constructor({vault,workspace,save,slots,fetcher=fetch,mode='standalone'}) {
    Object.assign(this,{vault,workspace,save,slots,fetcher,mode});this.state={connection:'disconnected',qr:null,error:null};this.events=[];this.queue=Promise.resolve();this.histories=new Map();this.closed=false;this.pendingMessages=0;
    this.client=new WhatsApp({folder:vault.folder,vault,onStatus:s=>{this.state={...this.state,...s};if(s.error)for(const f of this.workspace.flows)f.enabled=false;if(['closed','logged_out','error','disconnected'].includes(s.connection))this.slots.release(this);},onMessage:m=>this.enqueue(m)});
  }
  async init(){this.engine=new Engine({enabled:false,pilot:true,allowedPhones:[],rules:[]},await this.vault.read('ledger',{}));this.budget=await this.vault.read('budget',{date:'',calls:0});return this;}
  event(type,result){this.events.unshift({time:new Date().toISOString(),type,result});this.events.splice(30);}
  flow(){return this.workspace.flows.find(f=>f.id===this.workspace.activeFlowId)||this.workspace.flows[0];}
  async reserve(flow) {
    const day=new Date().toISOString().slice(0,10);if(this.budget.date!==day)this.budget={date:day,calls:0};
    if(this.budget.calls>=flow.maxRequests)throw new ProviderError('Límite diario de peticiones de tu espacio alcanzado. No se hace otra llamada.',429);
    this.budget.calls++;await this.vault.save('budget',this.budget);
  }
  async answer(flow,text,conversation) {
    const knowledge=await this.vault.read('knowledge-'+flow.id,null);
    if(!flow.disclosureAccepted||(!flow.context.trim()&&!knowledge?.pages?.length))throw new ProviderError('Añade contexto o analiza una web y acepta el envío al proveedor de IA antes de probar.');
    const key=this.workspace.keys[flow.provider];if(!key)throw new ProviderError('Guarda tu clave del proveedor.');
    await this.slots.acquireAI();
    try {
      await this.reserve(flow);
      const old=this.histories.get(conversation);const history=old&&Date.now()-old.at<2*3600000?old.turns:[];
      const privateHosts=this.mode==='standalone'&&process.env.IQT_ALLOW_PRIVATE_CONNECTORS==='true'?(process.env.IQT_CONNECTOR_HOSTS||'').split(',').map(s=>s.trim()).filter(Boolean):[];
      const apiData=await connectorContext(flow.connector,this.workspace.connectorSecrets?.[flow.id],{mode:this.mode,privateHosts});
      const result=await generate({provider:flow.provider,model:flow.model,apiKey:key,system:systemPrompt(flow)+relevantKnowledge(knowledge,text)+apiData,messages:[...history,{role:'user',content:text}],maxTokens:flow.maxTokens},this.fetcher);
      this.histories.delete(conversation);this.histories.set(conversation,{at:Date.now(),turns:[...history,{role:'user',content:text.slice(0,2000)},{role:'assistant',content:result.text}].slice(-20)});
      while(this.histories.size>200)this.histories.delete(this.histories.keys().next().value);
      return result;
    } finally {this.slots.releaseAI();}
  }
  enqueue(message) {
    if(this.pendingMessages>=200){this.event('sobrecarga','Cola llena: mensaje no procesado. Revisión manual necesaria.');return Promise.resolve();}
    this.pendingMessages++;
    const job=this.queue.then(async()=>{
      if(this.closed||this.state.connection!=='open')return;
      const flow=this.flow();
      this.engine.config={enabled:flow.enabled,pilot:flow.pilot,allowedPhones:flow.allowedPhones,hourlyLimit:flow.hourlyLimit??120,dailyLimit:flow.maxRequests,cooldownSeconds:flow.cooldownSeconds??2,rules:[{keyword:flow.trigger==='all'?'':flow.keyword,reply:'AI'}]};
      const decision=this.engine.decide(message);
      if(decision.action!=='reply'){await this.vault.save('ledger',this.engine.ledger);this.event(decision.action,decision.reason||decision.explanation);return;}
      this.engine.recordSent(message.chat);await this.vault.save('ledger',this.engine.ledger);
      try {
        const result=await this.answer(flow,message.text,message.chat);
        // A user may pause/disconnect while the model is working.
        if(this.closed||!flow.enabled||this.state.connection!=='open'||this.flow().id!==flow.id){this.event('omitido','La automatización se pausó durante la generación.');return;}
        await this.client.send(message.chat,'Asistente IA · '+result.text);
        this.event('respuesta','Texto generado y aceptado por la conexión. No acredita lectura.');
      } catch(e) {flow.enabled=false;await this.save();this.event('pausa',e instanceof ProviderError?e.message:'Envío no confirmado; no se reintenta. Revisa manualmente.');}
    });
    this.queue=job.catch(()=>{this.flow().enabled=false;this.state.error='No se pudo guardar el estado; respuestas pausadas.';}).finally(()=>{this.pendingMessages--;});return this.queue;
  }
  async test(text){const job=this.queue.then(()=>this.answer(this.flow(),text,'simulator'));this.queue=job.catch(()=>{});return job;}
  async connect(){if(!this.slots.claim(this))throw new ProviderError('La instancia alojada ha alcanzado su límite de conexiones. Puedes desplegarla en tu propio servidor.',429);await this.client.connect();}
  async disconnect(){for(const f of this.workspace.flows)f.enabled=false;await this.save();await this.queue;await this.client.disconnect();this.histories.clear();this.slots.release(this);}
  stop(){this.closed=true;for(const f of this.workspace.flows)f.enabled=false;this.client.stop();this.slots.release(this);this.histories.clear();}
}
export class Slots {
  constructor(max=2){this.max=max;this.members=new Set();this.ai=0;this.waiters=[];}
  acquireAI(){if(this.ai<2){this.ai++;return Promise.resolve();}return new Promise(resolve=>this.waiters.push(resolve));}
  releaseAI(){const next=this.waiters.shift();if(next)next();else this.ai--;}
  claim(runtime){if(this.members.has(runtime))return true;if(this.members.size>=this.max)return false;this.members.add(runtime);return true;}
  release(runtime){this.members.delete(runtime);}
}
