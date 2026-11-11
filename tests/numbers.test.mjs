import {env,worker,ctx} from './worker.test.mjs';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const {syncDiscordNumbers,parseNumberCommand}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {syncDiscordNumbers,parseNumberCommand};').toString('base64'));
const channel='1570008456981905460',guild='1542175377961648128',role='1569398144998051890',bot='1569331167453257770',a='1500000000000000001',b='1500000000000000002',unknown='1500000000000000003';
const numberEnv={...env,DISCORD_NUMBER_CHANNEL_ID:channel};
const run=(sql,...args)=>env.DB.prepare(sql).bind(...args).run();
const first=(sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const number=async id=>(await first('SELECT racing_number AS n FROM drivers WHERE id=?',id)).n;
await run('UPDATE drivers SET discord_id=? WHERE id=1',a);await run('UPDATE drivers SET discord_id=? WHERE id=2',b);
await run("UPDATE discord_number_sync SET last_message_id='0',lease_token=NULL,lease_until=NULL,next_poll_at=NULL");
let sequence=1570008456981906000n,chat=[],replies=[],flags=1<<19,channelForbidden=false,denyHistory=false,replyFail=false,missingRole=new Set();
const add=(author,content,extra={})=>{const item={id:String(++sequence),type:0,content,author:{id:author},...extra};chat.push(item);return item;};
const unblock=()=>run('UPDATE discord_number_sync SET next_poll_at=NULL,lease_token=NULL,lease_until=NULL');
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);assert.equal(options.headers.Authorization,'Bot test');
 if(u.pathname.endsWith('/oauth2/applications/@me'))return Response.json({id:bot,flags});
 if(u.pathname.endsWith('/channels/'+channel))return channelForbidden?Response.json({message:'Missing Access'},{status:403}):Response.json({id:channel,guild_id:guild,type:0,permission_overwrites:[]});
 if(u.pathname.endsWith('/guilds/'+guild+'/roles'))return Response.json([{id:guild,permissions:'0'},{id:'botrole',permissions:denyHistory?'3072':'68608'}]);
 if(u.pathname.includes('/members/')){const id=u.pathname.split('/').at(-1);return Response.json({roles:id===bot?['botrole']:missingRole.has(id)?[]:[role]});}
 if(u.pathname.endsWith('/channels/'+channel+'/messages')){
  if(options.method==='POST'){
   const data=JSON.parse(options.body);assert.deepEqual(data.allowed_mentions,{parse:[],replied_user:false});assert.equal(data.enforce_nonce,true);assert.ok(data.nonce.length<=25);
   if(replyFail)return Response.json({retry_after:120},{status:429});replies.push(data);return Response.json({id:String(++sequence)});
  }
  let rows=chat.filter(m=>!u.searchParams.has('before')||BigInt(m.id)<BigInt(u.searchParams.get('before'))).sort((x,y)=>BigInt(x.id)>BigInt(y.id)?-1:1);return Response.json(rows.slice(0,Number(u.searchParams.get('limit'))||100));
 }
 throw Error('Unexpected Discord request '+u.pathname);
};
assert.deepEqual(parseNumberCommand('!nummer 44',bot),{number:44});assert.equal(parseNumberCommand('Hallo',bot),null);assert.deepEqual(parseNumberCommand('<@'+bot+'> !nummer 7',bot),{number:7});
add(a,'!nummer 44');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),44);assert.ok(replies[0].content.includes('#44'));
add(b,'!nummer 44');await syncDiscordNumbers(numberEnv);assert.equal(await number(2),null);assert.ok(replies.at(-1).content.includes('bereits vergeben'));
add(a,'!nummer 16');add(b,'!nummer 44');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),16);assert.equal(await number(2),44);
add(a,'!nummer 44');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),16);
for(const text of ['!nummer 0','!nummer 100','!nummer -1','!nummer 44.5','!nummer 44 <@'+b+'>','!nummer 004','!nummer'])add(a,text);
await syncDiscordNumbers(numberEnv);assert.equal(await number(1),16);
add(a,'!nummer 77',{author:{id:a,bot:true}});add(a,'!nummer 77',{webhook_id:'111'});add(unknown,'!nummer 77');missingRole.add(b);add(b,'!nummer 77');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),16);assert.equal(await number(2),44);missingRole.clear();
assert.equal((await first("SELECT COUNT(*) AS n FROM discord_number_commands WHERE outcome='invalid'")).n,7);
assert.equal((await first("SELECT COUNT(*) AS n FROM discord_number_commands WHERE outcome='unknown_driver'")).n,2);
console.log('PASS number allocation/change/release, taken preserves old number, parsing/range, bot/webhook filtering and current Discord role ownership');
const before=(await first('SELECT COUNT(*) AS n FROM discord_number_commands')).n;
add(a,'!nummer 23');await Promise.all([syncDiscordNumbers(numberEnv),syncDiscordNumbers(numberEnv)]);assert.equal(await number(1),23);assert.equal((await first('SELECT COUNT(*) AS n FROM discord_number_commands')).n,before+1);
const oldBatch=env.DB.batch;let steal=true;
env.DB.batch=async items=>{if(steal&&items.some(x=>x.sql.includes('INSERT INTO discord_number_commands'))){steal=false;await run("UPDATE discord_number_sync SET lease_token='new-owner'");}return oldBatch(items);};
const contested=add(a,'!nummer 24');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),23);assert.equal(await first('SELECT * FROM discord_number_commands WHERE message_id=?',contested.id),null);env.DB.batch=oldBatch;await unblock();await syncDiscordNumbers(numberEnv);assert.equal(await number(1),24);
console.log('PASS overlapping cron lease and stale worker cannot mutate numbers or consume a command');
while((await first('SELECT COUNT(*) AS n FROM discord_number_commands WHERE delivered_at IS NULL')).n)await syncDiscordNumbers(numberEnv);
replyFail=true;const retry=add(a,'!nummer 25');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),25);let status=await first('SELECT * FROM discord_number_commands WHERE message_id=?',retry.id);assert.equal(status.delivered_at,null);assert.equal(status.attempts,1);assert.ok(Date.parse(status.next_attempt_at)>Date.now()+100000);
replyFail=false;await unblock();await run("UPDATE discord_number_commands SET next_attempt_at='2000-01-01T00:00:00Z' WHERE message_id=?",retry.id);await syncDiscordNumbers(numberEnv);assert.ok((await first('SELECT delivered_at FROM discord_number_commands WHERE message_id=?',retry.id)).delivered_at);assert.equal(await number(1),25);
const rejected=add(a,'!nummer 26');channelForbidden=true;await syncDiscordNumbers(numberEnv);assert.equal(await number(1),25);assert.ok((await first('SELECT last_error FROM discord_number_sync')).last_error.includes('403'));
channelForbidden=false;await unblock();denyHistory=true;await syncDiscordNumbers(numberEnv);assert.equal(await number(1),25);assert.ok((await first('SELECT last_error FROM discord_number_sync')).last_error.includes('Nachrichtenverlauf'));
denyHistory=false;await unblock();flags=0;await syncDiscordNumbers(numberEnv);assert.equal(await number(1),25);assert.ok((await first('SELECT last_error FROM discord_number_sync')).last_error.includes('Message Content Intent'));
flags=1<<19;await unblock();await syncDiscordNumbers(numberEnv);assert.equal(await number(1),26);assert.equal((await first('SELECT last_error FROM discord_number_sync')).last_error,null);
console.log('PASS Discord rate-limit retry without reassigning; missing access/history/intent preserve cursor and later recover');
const chronological=add(a,'!nummer 55');for(let i=0;i<105;i++)add(unknown,'ordinary message '+i);const later=add(b,'!nummer 55');await syncDiscordNumbers(numberEnv);assert.equal(await number(1),55);assert.equal(await number(2),44);assert.equal((await first('SELECT outcome FROM discord_number_commands WHERE message_id=?',chronological.id)).outcome,'accepted');assert.equal((await first('SELECT outcome FROM discord_number_commands WHERE message_id=?',later.id)).outcome,'taken');
await assert.rejects(()=>run('UPDATE drivers SET racing_number=44 WHERE id=1'));await assert.rejects(()=>run('UPDATE drivers SET racing_number=1.5 WHERE id=1'));
const publicTeams=await worker.fetch(new Request('https://test/api/teams'),env,ctx);const body=await publicTeams.json();assert.ok(body.teams.flatMap(t=>t.drivers).some(d=>d.id===2&&d.racingNumber===44));
const read=async path=>{const r=await worker.fetch(new Request('https://test'+path,{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),env,ctx);return r.json();};
assert.equal((await read('/api/drivers/1')).driver.racingNumber,55);assert.equal((await read('/api/driver-stats')).drivers.find(d=>d.id===1).racingNumber,55);
assert.equal((await worker.fetch(new Request('https://test/api/admin/number-sync'),numberEnv,ctx)).status,401);
console.log('PASS paginated newest-first history is applied chronologically; DB uniqueness/type checks; API exposes numbers without weakening authentication');
