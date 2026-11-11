import {env,worker,ctx} from './worker.test.mjs';
import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const {syncDiscordDrivers}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {syncDiscordDrivers};').toString('base64'));
const role='1569398144998051890',bot='1300000000000000001',a='1500000000000000001',b='1500000000000000002';
const e={...env,DISCORD_CLIENT_ID:bot};const run=(s,...p)=>env.DB.prepare(s).bind(...p).run();const one=(s,...p)=>env.DB.prepare(s).bind(...p).first();
await run('UPDATE drivers SET discord_id=?,racing_number=7 WHERE id=1',a);await run('UPDATE drivers SET discord_id=?,racing_number=8 WHERE id=2',b);
let members=[{user:{id:bot,bot:true,username:'Bot'},roles:[]},{user:{id:a,username:'Driver A'},roles:[role]},{user:{id:b,username:'Driver B'},roles:[role]}],mode='normal',calls=0;
globalThis.fetch=async url=>{if(String(url).includes('/members/'))return Response.json({roles:[]});calls++;
 if(mode==='empty')return Response.json([]);if(mode==='bad')return Response.json({broken:true});
 if(mode==='partial'||mode==='paginated'){
  if(calls===1){const page=[members[0],...Array.from({length:998},(_,i)=>({user:{id:String(1400000000000000000n+BigInt(i)),username:'Other '+i},roles:[]})),members[1]];return Response.json(page);}
  return mode==='partial'?Response.json({error:'unavailable'},{status:503}):Response.json([members[2]]);
 }
 return Response.json(members);
};
const old=await one('SELECT id,team_id,racing_number FROM drivers WHERE id=1');
assert.equal(await syncDiscordDrivers(e),2);assert.equal((await one('SELECT discord_active AS active FROM drivers WHERE id=1')).active,1);
await run('UPDATE teams SET budget=7000000 WHERE id=1');
const auction=(await env.DB.prepare("INSERT INTO auctions(driver_id,starting_price,ends_at,status) VALUES(1,2500000,?,'active') RETURNING id").bind(new Date(Date.now()+180000).toISOString()).all()).results[0].id;
const bid=(await env.DB.prepare('INSERT INTO bids(auction_id,team_id,amount,created_at) VALUES(?,1,3000000,?) RETURNING id').bind(auction,new Date().toISOString()).all()).results[0].id;await run('UPDATE auctions SET leading_bid_id=? WHERE id=?',bid,auction);
await run("INSERT INTO auction_queue(driver_id,starting_price,scheduled_at,status,created_by,created_at) VALUES(1,2500000,?,'pending','admin',?)",new Date(Date.now()+60000).toISOString(),new Date().toISOString());
members[1].roles=[];assert.equal(await syncDiscordDrivers(e),1);let gone=await one('SELECT id,team_id,racing_number,discord_active FROM drivers WHERE id=1');assert.equal(gone.discord_active,0);assert.equal(gone.id,old.id);assert.equal(gone.team_id,old.team_id);assert.equal(gone.racing_number,7);
assert.equal((await one('SELECT budget FROM teams WHERE id=1')).budget,10000000);assert.equal((await one('SELECT status FROM auctions WHERE id=?',auction)).status,'cancelled');assert.equal((await one('SELECT status FROM auction_queue WHERE driver_id=1')).status,'cancelled');
await syncDiscordDrivers(e);assert.equal((await one('SELECT budget FROM teams WHERE id=1')).budget,10000000);
const hash=async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');
const key='session:'+await hash('a'.repeat(64));const session=await env.SESSIONS.get(key,'json');session.discordId=a;session.guildVerifiedAt=Date.now();await env.SESSIONS.put(key,JSON.stringify(session));
const get=async path=>{const r=await worker.fetch(new Request('https://test'+path,{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),e,ctx);return {status:r.status,data:await r.json()};};
assert.ok(!(await get('/api/drivers')).data.drivers.some(d=>d.id===1));assert.ok(!(await get('/api/driver-stats?season=2026')).data.drivers.some(d=>d.id===1));assert.ok(!(await get('/api/teams')).data.teams.flatMap(t=>t.drivers).some(d=>d.id===1));assert.equal((await get('/api/drivers/1')).status,404);assert.equal((await get('/api/me')).data.driver,null);
assert.equal((await get('/api/standings?season=2026')).data.drivers.find(d=>d.id===1).points,33);
console.log('PASS role removal hides current driver, team roster, own profile and statistics; published standings preserved; live/queued auctions cancelled and leading bid refunded once');
members[1].roles=[role];members[1].nick='Driver A returns';await syncDiscordDrivers(e);const back=await one('SELECT id,name,team_id,racing_number,discord_active FROM drivers WHERE id=1');assert.equal(back.discord_active,1);assert.equal(back.name,'Driver A returns');assert.equal(back.id,old.id);assert.equal(back.team_id,old.team_id);assert.equal(back.racing_number,7);
for(const failure of ['empty','bad','partial']){mode=failure;calls=0;await assert.rejects(()=>syncDiscordDrivers(e));assert.equal((await one('SELECT discord_active AS active FROM drivers WHERE id=1')).active,1);assert.equal((await one('SELECT discord_active AS active FROM drivers WHERE id=2')).active,1);}
mode='paginated';calls=0;assert.equal(await syncDiscordDrivers(e),2);assert.equal(calls,2);
mode='normal';members=members.filter(m=>m.user.id===bot);assert.equal(await syncDiscordDrivers(e),0);assert.equal((await one('SELECT COUNT(*) AS n FROM drivers WHERE discord_active=1 AND discord_id IS NOT NULL')).n,0);
console.log('PASS rejoining preserves identity/team/number; malformed/empty/partial Discord scans never deactivate; complete multi-page and legitimate zero-driver snapshots work');
