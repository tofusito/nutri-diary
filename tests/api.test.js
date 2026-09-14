import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import {createApp,ensureIndexes} from '../server/app.js';

let mongo,client,server,base;
before(async()=>{
  mongo=await MongoMemoryServer.create(); client=new MongoClient(mongo.getUri()); await client.connect(); await ensureIndexes(client);
  server=createApp(client,{env:{DEV_AUTH_BYPASS:'1'}}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve)); base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server) await new Promise(resolve=>server.close(resolve));await client?.close();await mongo?.stop();});
const request=async(path,method='GET',body)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
};
const food=()=>({name:'Test oats',basis:'g',nutrients:{kcal:380,carbs:60,protein:12,fat:8}});

test('the default profile derives energy and preserves date-specific goals',async()=>{
  assert.equal((await request('/api/profile')).body.carbs,0);
  assert.equal((await request('/api/profile','PUT',{carbs:250,protein:150,fat:70,effectiveDate:'2026-01-01'})).body.kcal,2230);
  await request('/api/profile','PUT',{carbs:200,protein:150,fat:60,effectiveDate:'2026-02-01'});
  const rows=(await request('/api/progress?from=2026-01-31&to=2026-02-01')).body;
  assert.equal(rows[0].goal.kcal,2230);assert.equal(rows[1].goal.kcal,1940);
  assert.equal(rows[0].count,0);assert.equal(rows[0].kcal,null);
});
test('historical entries survive catalog corrections; edits recalculate and retries deduplicate',async()=>{
  const f=(await request('/api/foods','POST',food())).body;
  const entry={id:randomUUID(),date:'2025-12-14',meal:'Desayuno',food:f,quantity:75};
  const replies=await Promise.all([request('/api/entries','POST',entry),request('/api/entries','POST',entry)]);
  assert.ok(replies.every(r=>[200,201].includes(r.status)));
  assert.equal((await request('/api/entries?date=2025-12-14')).body.length,1);
  await request(`/api/foods/${f.id}`,'PATCH',{nutrients:{kcal:500,carbs:60,protein:12,fat:8}});
  assert.equal((await request('/api/progress?from=2025-12-14&to=2025-12-14')).body[0].kcal,285);
  await request(`/api/entries/${entry.id}`,'PATCH',{quantity:50,date:'2025-12-13'});
  assert.equal((await request('/api/entries?date=2025-12-14')).body.length,0);
  assert.equal((await request('/api/progress?from=2025-12-13&to=2025-12-13')).body[0].kcal,190);
  await request(`/api/entries/${entry.id}`,'DELETE');await request(`/api/entries/${entry.id}`,'DELETE');
  assert.equal((await request('/api/entries?date=2025-12-13')).body.length,0);
});
test('a shared barcode lists every personal food before external results',async()=>{
  const f=(await request('/api/foods','POST',{...food(),barcode:'8410000000001',favorite:true})).body;
  const sibling=(await request('/api/foods','POST',{...food(),name:'Reused barcode',barcode:'8410000000001'})).body;
  assert.equal(sibling.status,undefined);
  const lookup=(await request('/api/lookup/8410000000001')).body;
  assert.deepEqual(lookup.mine.map(item=>item.id).sort(),[f.id,sibling.id].sort());
  assert.ok(Array.isArray(lookup.external));
  assert.equal((await request('/api/foods?q=8410000000001')).body[0].id,f.id);
  await request(`/api/foods/${f.id}`,'PATCH',{favorite:false});
  assert.notEqual((await request('/api/foods?q=8410000000001')).body[0].favorite,true);
  await request(`/api/foods/${sibling.id}`,'DELETE');
  assert.equal((await request('/api/lookup/8410000000001')).body.mine.length,1);
});

test('profiles keep separate diaries, goals and deletion',async()=>{
  const mine=(await request('/api/profiles')).body;
  assert.equal(mine.length,1);
  const other=(await request('/api/profiles','POST',{name:'Pareja',carbs:200,protein:120,fat:60,sex:'female',activity:1.375,effectiveDate:'2026-01-01'})).body;
  assert.equal(other.kcal,1820);
  assert.equal((await request('/api/profiles')).body.length,2);
  const f=(await request('/api/foods','POST',food())).body;
  await request(`/api/entries?profile=${other.id}`,'POST',{id:randomUUID(),date:'2026-04-01',meal:'Merienda',food:f,quantity:100});
  assert.equal((await request(`/api/entries?date=2026-04-01&profile=${other.id}`)).body.length,1);
  assert.equal((await request('/api/entries?date=2026-04-01')).body.length,0);
  assert.equal((await request(`/api/progress?from=2026-04-01&to=2026-04-01&profile=${other.id}`)).body[0].goal.kcal,1820);
  assert.equal((await request('/api/progress?from=2026-04-01&to=2026-04-01')).body[0].kcal,null);
  assert.equal((await request(`/api/entries?date=2026-04-01&profile=${randomUUID()}`)).status,404);
  await request(`/api/profiles/${other.id}`,'DELETE');
  assert.equal((await request('/api/profiles')).body.length,1);
  assert.equal((await request(`/api/entries?date=2026-04-01&profile=${other.id}`)).status,404);
});
test('unknown nutrient remains null in progress, invalid inputs rejected',async()=>{
  const f=(await request('/api/foods','POST',{...food(),nutrients:{kcal:20,carbs:null,protein:1,fat:0}})).body;
  await request('/api/entries','POST',{id:randomUUID(),date:'2026-03-01',meal:'Cena',food:f,quantity:100});
  const row=(await request('/api/progress?from=2026-03-01&to=2026-03-01')).body[0];assert.equal(row.carbs,null);assert.equal(row.kcal,20);
  assert.equal((await request('/api/entries?date=2026-02-30')).status,400);
  assert.equal((await request('/api/entries','POST',{id:randomUUID(),date:'2026-02-20',meal:'Cena',food:f,quantity:-1})).status,400);
  assert.equal((await request('/api/progress?from=2000-01-01&to=2026-01-01')).status,400);
  assert.equal((await request('/api/search?provider=usda&q=rice')).status,503);
  assert.equal((await request('/api/search?provider=none&q=oats')).body.mine[0].name,'Test oats');
});
test('Cloudflare gateway mode needs no second password and still rejects cross-origin writes',async()=>{
  const gateway=createApp(client,{env:{NODE_ENV:'production',AUTH_MODE:'cloudflare',APP_ORIGIN:'https://nutri.example.test'}}).listen(0,'127.0.0.1');
  await new Promise(resolve=>gateway.once('listening',resolve));
  const origin=`http://127.0.0.1:${gateway.address().port}`;
  try {
    const session=await (await fetch(origin+'/api/session')).json();
    assert.deepEqual(session,{authenticated:true,provider:'cloudflare'});
    assert.equal((await fetch(origin+'/api/foods')).status,200);
    assert.equal((await fetch(origin+'/api/foods',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify(food())})).status,403);
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:'https://nutri.example.test'}});
    assert.equal(login.status,200);assert.equal(login.headers.get('set-cookie'),null);
  } finally {await new Promise(resolve=>gateway.close(resolve));}
});

test('production authentication rejects bypass and enforces cookie and write origin',async()=>{
  const app=createApp(client,{env:{NODE_ENV:'production',DEV_AUTH_BYPASS:'1',APP_PASSWORD:'test-password-only',APP_ORIGIN:'https://nutri.example.test'}});
  const authServer=app.listen(0,'127.0.0.1');await new Promise(resolve=>authServer.once('listening',resolve));
  const origin=`http://127.0.0.1:${authServer.address().port}`;
  try {
    assert.equal((await fetch(origin+'/api/profile')).status,401);
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://nutri.example.test'},body:JSON.stringify({password:'test-password-only'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
    assert.equal((await fetch(origin+'/api/profile',{headers:{Cookie:cookie.split(';')[0]}})).status,200);
    assert.equal((await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:cookie.split(';')[0],Origin:'https://other.example'}})).status,403);
    assert.equal((await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:cookie.split(';')[0],Origin:'https://nutri.example.test'}})).status,200);
    assert.equal((await fetch(origin+'/api/profile',{headers:{Cookie:cookie.split(';')[0]}})).status,401);
  } finally {await new Promise(resolve=>authServer.close(resolve));}
});
