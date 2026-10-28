import{test}from'node:test';import assert from'node:assert/strict';
import{isPublicIp,validateUrl,safeGet,crawlWebsite,relevantKnowledge,pageText,robotsRules}from'../src/web-knowledge.mjs';
import{validateConnector,connectorContext}from'../src/connectors.mjs';
test('crawler rejects loopback, metadata, private networks and URL credentials',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.18.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(isPublicIp(ip),false,ip);
 assert.equal(isPublicIp('8.8.8.8'),true);assert.throws(()=>validateUrl('file:///etc/passwd'));assert.throws(()=>validateUrl('https://user:pass@example.com'));assert.throws(()=>validateUrl('http://example.com:8000'));
 await assert.rejects(()=>safeGet('http://2130706433/'));await assert.rejects(()=>safeGet('http://169.254.169.254/'));
});
test('website import follows public same-origin pages and respects robots',async()=>{
 const visited=[];const fixtures={
  'https://example.com/robots.txt':{text:'User-agent: *\nDisallow: /private',type:'text/plain'},
  'https://example.com/':{text:'<html><title>Taller</title><p>Servicio de bicicletas</p><a href="/prices">Precios</a><a href="/private">Privado</a><a href="http://127.0.0.1/secret">No</a><script>secret code</script></html>',type:'text/html'},
  'https://example.com/sitemap.xml':{text:'<urlset><url><loc>https://example.com/prices</loc></url></urlset>',type:'application/xml'},
  'https://example.com/prices':{text:'<title>Tarifas</title><p>Revisión de bicicleta: 30 euros.</p>',type:'text/html'}
 };
 const result=await crawlWebsite('https://example.com/',{maxPages:5,getter:async u=>{visited.push(u);if(!fixtures[u])throw Error('HTTP 404');return{url:u,...fixtures[u]};}});
 assert.equal(result.pages.length,2);assert.ok(!visited.includes('https://example.com/private'));assert.ok(!visited.includes('http://127.0.0.1/secret'));assert.ok(relevantKnowledge(result,'tarifas revisión').includes('30 euros'));assert.ok(!result.pages[0].text.includes('secret code'));
});
test('blocked robots prevents fetching the page itself',async()=>{const visited=[];await assert.rejects(()=>crawlWebsite('https://example.com/',{getter:async u=>{visited.push(u);return{url:u,text:'User-agent: *\nDisallow: /',type:'text/plain'};}}));assert.deepEqual(visited,['https://example.com/robots.txt']);});
test('API connector exposes only selected fields, not authorization or other records',async()=>{
 let request;const context=await connectorContext({enabled:true,url:'https://example.com/api',fields:'stock.available'},'Bearer private-token',{getter:async(u,options)=>{request=options;return{text:JSON.stringify({stock:{available:3},customers:['private-customer']})};}});
 assert.ok(context.includes('3'));assert.ok(!context.includes('private-customer'));assert.ok(!context.includes('private-token'));assert.equal(request.headers.Authorization,'Bearer private-token');assert.equal(request.redirects,0);
 assert.throws(()=>validateConnector({url:'https://example.com',fields:'stock'},'tools'));assert.throws(()=>validateConnector({url:'https://example.com?key=secret',fields:'stock'},'standalone'));
});
test('API arrays can expose product names without leaking unrelated fields',async()=>{const text=await connectorContext({enabled:true,url:'https://example.com/products',fields:'items.name',header:'X-API-Key'},'secret',{getter:async(u,o)=>{assert.equal(o.headers['X-API-Key'],'secret');return{text:JSON.stringify([{name:'Bike',internal:'private-data'}])};}});assert.ok(text.includes('Bike'));assert.ok(!text.includes('private-data'));});
test('retrieval matches Spanish accented terms instead of unrelated pages',()=>{const pages=Array.from({length:4},(_,i)=>({url:'https://example.com/'+i,title:'Información',text:'Página general sin tarifas'}));pages.push({url:'https://example.com/prices',title:'Tarifas',text:'Revisión: 30 euros'});assert.ok(relevantKnowledge({pages,fetchedAt:Date.now()},'revision').includes('30 euros'));});
