import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, defaults, validateConfig } from '../src/engine.mjs';
const now = 1800000000000;
const message = () => ({ id:'one', chat:'34600000000@s.whatsapp.net', phone:'34600000000',text:'¿Cuál es vuestro HORARIO?' });
const engine = () => new Engine({ ...defaults(), enabled:true,allowedPhones:['34600000000'] });
test('defaults never send and invalid empty pilot is rejected',()=>{
 assert.equal(new Engine(defaults()).decide(message(),now).action,'omit');
 assert.throws(()=>validateConfig({...defaults(),enabled:true}));
});
test('inbound rule works and duplicate delivery cannot send twice',()=>{
 const e=engine();assert.equal(e.decide(message(),now).action,'reply');
 const restarted=new Engine(e.config,JSON.parse(JSON.stringify(e.ledger)));
 assert.equal(restarted.decide(message(),now+1).reason,'duplicado');
});
test('never respond to history, groups, broadcasts, own messages or unapproved pilot contacts',()=>{
 for(const flags of [{history:true},{group:true},{broadcast:true},{fromMe:true},{phone:'34999999999'}]) assert.equal(engine().decide({...message(),...flags},now).action,'omit');
});
test('cooldown, hourly and daily ceilings bound attempts',()=>{
 let e=engine();e.recordSent(message().chat,now);assert.equal(e.decide(message(),now+1).action,'omit');
 e=engine();e.ledger.sent=Array(20).fill(now-1000);assert.equal(e.decide(message(),now).action,'omit');
 e=engine();e.ledger.sent=Array(200).fill(now-7200000);assert.equal(e.decide(message(),now).action,'omit');
});
test('BAJA is durable and PERSONA pauses only its own chat',()=>{
 let e=engine();e.decide({...message(),text:'BAJA'},now);
 const restored=new Engine(e.config,JSON.parse(JSON.stringify(e.ledger)));
 assert.equal(restored.decide({...message(),id:'two'},now+100).action,'omit');
 e=engine();e.decide({...message(),text:'PERSONA'},now);
 assert.equal(e.decide({...message(),id:'two'},now+100).action,'omit');
 assert.equal(e.decide({...message(),id:'three'},now+86400001).action,'reply');
});
test('ledger never stores raw phones or received text',()=>{
 const e=engine();e.decide(message(),now);e.recordSent(message().chat,now);
 const saved=JSON.stringify(e.ledger);assert.ok(!saved.includes(message().phone));assert.ok(!saved.includes('HORARIO'));
});
test('simulator is isolated and does not touch send ledger',()=>{
 const e=engine();assert.equal(e.preview('horario').action,'reply');assert.deepEqual(e.ledger.sent,[]);assert.deepEqual(e.ledger.seen,{});
});
