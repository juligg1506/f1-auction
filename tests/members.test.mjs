import {worker,env,ctx} from './worker.test.mjs';
import assert from 'node:assert/strict';
const guild='1542175377961648128',id='1500000000000000099';
let absent=false,unavailable=false,checks=0;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);
 if(u.pathname==='/api/v10/oauth2/token')return Response.json({access_token:'test-access'});
 if(u.pathname==='/api/v10/users/@me')return Response.json({id,username:'Member without role'});
 if(u.pathname.includes('/members/')||u.pathname.endsWith('/member')){checks++;return absent?Response.json({message:'Unknown Member'},{status:404}):unavailable?Response.json({message:'Failure'},{status:503}):Response.json({roles:[],user:{id}});}
 throw Error('Unexpected Discord endpoint');
};
const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
async function login(){const state='1'.repeat(64);await env.SESSIONS.put('oauth:'+await hash(state),JSON.stringify({verifier:'test'}));return worker.fetch(new Request('https://test/auth/callback?state='+state+'&code=test',{headers:{Cookie:'f1_oauth='+state}}),env,ctx);}
for(const path of ['/api/me','/api/teams','/api/league','/api/standings','/api/calendar','/api/races','/api/features','/api/auctions','/api/transfers','/api/drivers','/api/driver-stats','/api/racing-number-rules'])assert.equal((await worker.fetch(new Request('https://test'+path),env,ctx)).status,['/api/teams','/api/league','/api/standings','/api/calendar','/api/races','/api/features'].includes(path)?200:401,path);
absent=true;let r=await login();assert.equal(r.status,302);assert.ok(r.headers.get('location').endsWith('#login_error=not_server_member'));
absent=false;r=await login();assert.equal(r.status,302);let token=r.headers.get('location').split('#session=')[1];assert.match(token,/^[a-f0-9]{64}$/);
const key='session:'+await hash(token);let saved=await env.SESSIONS.get(key,'json');assert.equal(saved.guildId,guild);assert.equal(saved.discordTeam,null);assert.equal(saved.membershipPolicy,1);
const request=path=>worker.fetch(new Request('https://test'+path,{headers:{Authorization:'Bearer '+token}}),env,ctx);
r=await request('/api/me');assert.equal(r.status,200);assert.equal((await r.json()).team,null);
assert.equal((await request('/api/teams')).status,200);assert.equal((await request('/api/admin/league')).status,403);
// Force fresh verification rather than the short, server-controlled positive cache.
saved.guildVerifiedAt=Date.now()-20000;await env.SESSIONS.put(key,JSON.stringify(saved));await env.SESSIONS.delete('membership:'+guild+':'+id);
unavailable=true;assert.equal((await request('/api/teams')).status,503);assert.ok(await env.SESSIONS.get(key,'json'));unavailable=false;
checks=0;assert.equal((await request('/api/teams')).status,200);assert.equal(checks,1);assert.equal((await request('/api/league')).status,200);assert.equal(checks,1);
await env.SESSIONS.put('membership:'+guild+':'+id,JSON.stringify({member:true,checkedAt:Date.now()-20000}));absent=true;assert.equal((await request('/api/teams')).status,401);assert.equal(await env.SESSIONS.get(key,'json'),null);assert.equal((await request('/api/league')).status,401);
absent=false;r=await login();token=r.headers.get('location').split('#session=')[1];const newKey='session:'+await hash(token);saved=await env.SESSIONS.get(newKey,'json');delete saved.membershipPolicy;await env.SESSIONS.put(newKey,JSON.stringify(saved));assert.equal((await request('/api/teams')).status,401);
assert.equal((await worker.fetch(new Request('https://test/api/logout',{method:'POST'}),env,ctx)).status,200);
console.log('PASS all business APIs require membership; OAuth rejects nonmember but accepts members without team/driver roles; admin remains restricted; stale/legacy sessions, leave revocation, 15s cache, outage fails closed');
