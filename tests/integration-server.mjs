import {worker, env, ctx, drain} from './worker.test.mjs';
import {createServer} from 'node:http';
await env.DB.prepare('UPDATE drivers SET racing_number=44 WHERE id=1').run();
await env.DB.prepare('UPDATE drivers SET racing_number=16 WHERE id=2').run();
// Isolated active auction fixture for read-only guest browser checks.
await env.DB.prepare("INSERT INTO auctions (driver_id, starting_price, ends_at, status) VALUES (1,2500000,?,'active')").bind(new Date(Date.now()+180000).toISOString()).run();
createServer(async (req,res)=>{
 try{
  let body='';for await(const chunk of req)body+=chunk;
  const request=new Request('https://test'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
  const response=await worker.fetch(request,env,ctx);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());await drain();
 }catch(error){res.writeHead(500);res.end(String(error))}
}).listen(8128,'127.0.0.1',()=>console.log('INTEGRATION SERVER READY'));

