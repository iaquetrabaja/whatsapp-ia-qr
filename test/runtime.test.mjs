import{test}from'node:test';import assert from'node:assert/strict';import{Runtime,Slots}from'../src/runtime.mjs';import{newFlow}from'../src/flows.mjs';
const vault=()=>({folder:'unused',read:async(n,d)=>d,save:async()=>{}});
const workspace=()=>{const f={...newFlow(),enabled:true,pilot:false,context:'Business facts',disclosureAccepted:true};return{flows:[f],activeFlowId:f.id,keys:{gemini:'private-key'}};};
const message=()=>({chat:'34600000000@s.whatsapp.net',phone:'34600000000',id:'test',text:'hello'});
test('quota error pauses flow and never sends a WhatsApp reply',async()=>{
 let calls=0,sends=0;const w=workspace(),r=await new Runtime({vault:vault(),workspace:w,save:async()=>{},slots:new Slots(),fetcher:async()=>{calls++;return new Response('{}',{status:429});}}).init();r.state.connection='open';r.client={send:async()=>{sends++;}};
 await r.enqueue(message());assert.equal(calls,1);assert.equal(sends,0);assert.equal(w.flows[0].enabled,false);
 await r.enqueue({...message(),id:'next'});assert.equal(calls,1);
});
test('pausing while AI generates prevents the resulting message from being sent',async()=>{
 let finish,started;const begun=new Promise(r=>started=r);let sends=0;const w=workspace();
 const r=await new Runtime({vault:vault(),workspace:w,save:async()=>{},slots:new Slots(),fetcher:()=>{started();return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'hello'}]}}]}),{status:200}));});}}).init();
 r.state.connection='open';r.client={send:async()=>{sends++;}};const pending=r.enqueue(message());await begun;w.flows[0].enabled=false;finish();await pending;assert.equal(sends,0);
});
test('daily model budget is shared across flows and simulations',async()=>{const w=workspace();w.flows[0].maxRequests=1;const r=await new Runtime({vault:vault(),workspace:w,save:async()=>{},slots:new Slots(),fetcher:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'hello'}]}}]}),{status:200})}).init();await r.test('hi');await assert.rejects(()=>r.test('again'),e=>e.status===429);assert.equal(r.budget.calls,1);});
