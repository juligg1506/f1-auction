import {env,worker,ctx} from './worker.test.mjs';
import assert from 'node:assert/strict';
for(const origin of ['https://racingleague.online','https://www.racingleague.online','https://juligg1506.github.io']){
 for(const method of ['GET','OPTIONS']){
  const r=await worker.fetch(new Request('https://test/api/features',{method,headers:{Origin:origin}}),env,ctx);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Vary'),'Origin');assert.ok(r.ok);
 }
}
const denied=await worker.fetch(new Request('https://test/api/features',{headers:{Origin:'https://untrusted.example'}}),env,ctx);assert.notEqual(denied.headers.get('Access-Control-Allow-Origin'),'https://untrusted.example');
const callback=await worker.fetch(new Request('https://test/auth/callback?error=access_denied'),env,ctx);assert.equal(callback.headers.get('Location'),'https://racingleague.online/#login_error=discord_denied');
console.log('PASS domain migration: request-local CORS, www/legacy support, untrusted origin blocked and Discord return URL');
