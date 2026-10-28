import { Engine,normalize } from './engine.mjs';
import { WhatsApp } from './whatsapp.mjs';
import { generate,systemPrompt,ProviderError } from './providers.mjs';
export class Runtime {
  constructor({vault,workspace,save,slots,fetcher=fetch}) {
    Object.assign(this,{vault,workspace,save,slots,fetcher});this.state={connection:'disconnected',qr:null,error:null};this.events=[];this.queue=Promise.resolve();this.histories=new Map();this.closed=false;
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
    if(!flow.disclosureAccepted||!flow.context.trim())throw new ProviderError('Añade contexto y acepta el envío al proveedor de IA antes de probar.');
    const key=this.workspace.keys[flow.provider];if(!key)throw new ProviderError('Guarda tu clave del proveedor.');
    if(this.slots.ai>=2)throw new ProviderError('Hay otras peticiones en curso. Prueba dentro de un momento.',429);
    this.slots.ai++;
    try {
      await this.reserve(flow);
      const old=this.histories.get(conversation);const history=old&&Date.now()-old.at<30*60000?old.turns:[];
      const result=await generate({provider:flow.provider,model:flow.model,apiKey:key,system:systemPrompt(flow),messages:[...history,{role:'user',content:text}],maxTokens:flow.maxTokens},this.fetcher);
      this.histories.delete(conversation);this.histories.set(conversation,{at:Date.now(),turns:[...history,{role:'user',content:text.slice(0,2000)},{role:'assistant',content:result.text}].slice(-6)});
      while(this.histories.size>30)this.histories.delete(this.histories.keys().next().value);
      return result;
    } finally {this.slots.ai--;}
  }
  enqueue(message) {
    const job=this.queue.then(async()=>{
      if(this.closed||this.state.connection!=='open')return;
      const flow=this.flow();
      this.engine.config={enabled:flow.enabled,pilot:flow.pilot,allowedPhones:flow.allowedPhones,rules:[{keyword:flow.trigger==='all'?'':flow.keyword,reply:'AI'}]};
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
    this.queue=job.catch(()=>{this.flow().enabled=false;this.state.error='No se pudo guardar el estado; respuestas pausadas.';});return this.queue;
  }
  async test(text){const job=this.queue.then(()=>this.answer(this.flow(),text,'simulator'));this.queue=job.catch(()=>{});return job;}
  async connect(){if(!this.slots.claim(this))throw new ProviderError('La beta alojada ha alcanzado su límite de conexiones. Puedes desplegarla en tu propio servidor.',429);await this.client.connect();}
  async disconnect(){for(const f of this.workspace.flows)f.enabled=false;await this.save();await this.queue;await this.client.disconnect();this.histories.clear();this.slots.release(this);}
  stop(){this.closed=true;for(const f of this.workspace.flows)f.enabled=false;this.client.stop();this.slots.release(this);this.histories.clear();}
}
export class Slots {
  constructor(max=2){this.max=max;this.members=new Set();this.ai=0;}
  claim(runtime){if(this.members.has(runtime))return true;if(this.members.size>=this.max)return false;this.members.add(runtime);return true;}
  release(runtime){this.members.delete(runtime);}
}
