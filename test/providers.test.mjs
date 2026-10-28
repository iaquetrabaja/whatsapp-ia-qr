import{test}from'node:test';import assert from'node:assert/strict';
import{generate,requestFor,validateProvider}from'../src/providers.mjs';
const base={model:'test-model',apiKey:'secret-test-key',system:'Only business facts',messages:[{role:'user',content:'Hello'}],maxTokens:128};
test('Gemini uses header authentication, system context and bounded tokens',()=>{const r=requestFor({...base,provider:'gemini'}),b=JSON.parse(r.options.body);assert.ok(!r.url.includes(base.apiKey));assert.equal(r.options.headers['x-goog-api-key'],base.apiKey);assert.equal(b.systemInstruction.parts[0].text,base.system);assert.equal(b.generationConfig.maxOutputTokens,128);});
test('OpenAI disables response storage and uses Responses API',()=>{const r=requestFor({...base,provider:'openai'}),b=JSON.parse(r.options.body);assert.equal(r.url,'https://api.openai.com/v1/responses');assert.equal(b.store,false);assert.equal(b.max_output_tokens,128);});
test('OpenRouter rejects paid model selection and forbids paid routing',()=>{assert.throws(()=>validateProvider('openrouter','paid/model'));const r=requestFor({...base,provider:'openrouter',model:'example/model:free'}),b=JSON.parse(r.options.body);assert.deepEqual(b.provider.max_price,{prompt:0,completion:0});assert.equal(b.provider.allow_fallbacks,false);});
test('all four provider response contracts produce text',async()=>{
 for(const[provider,data]of Object.entries({gemini:{candidates:[{content:{parts:[{text:'Hello'}]}}]},openai:{output:[{type:'message',content:[{type:'output_text',text:'Hello'}]}]},groq:{choices:[{message:{content:'Hello'}}]},openrouter:{choices:[{message:{content:'Hello'}}]}})){
  const r=await generate({...base,provider,model:provider==='openrouter'?'openrouter/free':base.model},async()=>new Response(JSON.stringify(data),{status:200}));assert.equal(r.text,'Hello');
 }
});
test('quota failure makes one call and never falls back',async()=>{let calls=0;await assert.rejects(()=>generate({...base,provider:'groq'},async()=>{calls++;return new Response('{}',{status:429});}),e=>e.status===429);assert.equal(calls,1);});
