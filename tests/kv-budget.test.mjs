import {env} from './worker.test.mjs';
import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const {readStoredValue,writeStoredValue,deleteStoredValue,cleanSessionStorage}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {readStoredValue,writeStoredValue,deleteStoredValue,cleanSessionStorage};').toString('base64'));
const realNow=Date.now;let now=realNow(),calls=0,fail=false;Date.now=()=>now;
const raw=new Map(),e={...env,SESSIONS:{
 get:async(k,type)=>{const item=raw.get(k);if(!item||item.expiry<=now)return null;return type==='json'?JSON.parse(item.value):item.value;},
 put:async(k,v,o)=>{calls++;if(fail)throw Error('quota');raw.set(k,{value:v,expiry:now+o.expirationTtl*1000});}
}};
const run=(s,...p)=>env.DB.prepare(s).bind(...p).run();const one=(s,...p)=>env.DB.prepare(s).bind(...p).first();
const day=()=>new Date(now).toISOString().slice(0,10);
// Migration seals today's uncertain existing usage, while D1 fallback stays usable.
await writeStoredValue(e,'session:today','{"works":true}',{expirationTtl:3600});assert.equal(calls,0);assert.equal((await readStoredValue(e,'session:today','json')).works,true);
await run('UPDATE kv_write_budget SET attempts=995 WHERE day=?',day());
await Promise.all(Array.from({length:20},(_,i)=>writeStoredValue(e,'session:concurrent'+i,JSON.stringify({i}),{expirationTtl:3600})));
assert.equal(calls,5);assert.equal((await one('SELECT attempts FROM kv_write_budget WHERE day=?',day())).attempts,1000);
for(let i=0;i<20;i++)assert.equal((await readStoredValue(e,'session:concurrent'+i,'json')).i,i);
for(const key of ['membership:member','driver_sync_status'])await writeStoredValue(e,key,'{"ok":true}',{expirationTtl:60});assert.equal(calls,5);
now+=86400000;fail=true;await writeStoredValue(e,'oauth:failure','{"verifier":"test"}',{expirationTtl:600});assert.equal(calls,6);assert.equal((await one('SELECT attempts FROM kv_write_budget WHERE day=?',day())).attempts,1);assert.equal((await readStoredValue(e,'oauth:failure','json')).verifier,'test');
fail=false;await writeStoredValue(e,'session:logout','{"active":true}',{expirationTtl:3600});assert.equal(calls,7);await deleteStoredValue(e,'session:logout');assert.equal(await readStoredValue(e,'session:logout','json'),null);assert.ok(raw.has('session:logout'));
raw.set('session:legacy',{value:'{"legacy":true}',expiry:now+3600000});assert.equal((await readStoredValue(e,'session:legacy','json')).legacy,true);await deleteStoredValue(e,'session:legacy');assert.equal(await readStoredValue(e,'session:legacy','json'),null);
await writeStoredValue(e,'profile:expires','{"username":"old"}',{expirationTtl:60});now+=61000;assert.equal(await readStoredValue(e,'profile:expires','json'),null);await cleanSessionStorage(e);assert.equal((await one('SELECT value FROM session_storage WHERE key=?','profile:expires')).value,null);
now+=32*86400000;await cleanSessionStorage(e);assert.equal(await one('SELECT key FROM session_storage WHERE key=?','session:logout'),null);assert.equal(await readStoredValue(e,'session:logout','json'),null);
Date.now=realNow;console.log('PASS KV budget: migration seal, concurrent 1000-attempt ceiling, D1 fallback, zero background writes, UTC daily reset, failed KV attempts, logout tombstones, legacy sessions, expiry/content cleanup');
