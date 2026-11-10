import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const worker=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(root,'worker.js'),'utf8')).toString('base64'))).default;
const dbfile=join(mkdtempSync(join(tmpdir(),'f1-worker-test-')),'test.sqlite');
function execute(items){const r=spawnSync('python3',[join(root,'tests/sqlite_bridge.py')],{input:JSON.stringify({file:dbfile,statements:items}),encoding:'utf8'});if(r.status)throw Error(r.stderr.trim());return JSON.parse(r.stdout);}
class Statement {constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args)}async all(){return execute([this])[0]}async first(){return (await this.all()).results[0]||null}async run(){return this.all()}}
let beforeBatch=null;
const DB={prepare:sql=>new Statement(sql),batch:async items=>{if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook(items)}return execute(items)}};
const hash=async t=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))).toString('hex');
const sessions=new Map();
const tokens={admin:'a'.repeat(64),other:'b'.repeat(64),viewer:'c'.repeat(64)};
for(const [key,token] of Object.entries(tokens))sessions.set('session:'+await hash(token),{discordId:key,username:key,admin:key==='admin'});
const env={DB,SESSIONS:{get:async k=>sessions.get(k)||null,put:async(k,v)=>sessions.set(k,JSON.parse(v)),delete:async k=>sessions.delete(k)},DISCORD_CLIENT_ID:'test',DISCORD_CLIENT_SECRET:'test',DISCORD_REDIRECT_URI:'https://test/auth/callback',DISCORD_BOT_TOKEN:'test',DISCORD_AUCTION_CHANNEL_ID:'123456789012345678'};
let messages=[],discordFailure=false;
globalThis.fetch=async(url,opts)=>{if(String(url).includes('/members'))return Response.json([]);if(discordFailure)return Response.json({retry_after:60},{status:429});messages.push(JSON.parse(opts.body));return Response.json({id:'test'})};
const pending=[];const ctx={waitUntil:p=>pending.push(p)};
async function drain(){while(pending.length)await Promise.all(pending.splice(0));}
async function request(path,who='admin',body){const headers={};if(who)headers.Authorization='Bearer '+tokens[who];if(body)headers['Content-Type']='application/json';const r=await worker.fetch(new Request('https://test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env,ctx);return {status:r.status,body:await r.json()};}
function sql(s,args=[]){return execute([{sql:s,args}])[0].results;}
function reset(){try{unlinkSync(dbfile)}catch{};const base=`CREATE TABLE teams(id INTEGER PRIMARY KEY,name TEXT NOT NULL,owner_discord_id TEXT,budget INTEGER NOT NULL CHECK(budget>=0));
CREATE TABLE drivers(id INTEGER PRIMARY KEY,name TEXT,team_id INTEGER REFERENCES teams(id),discord_id TEXT UNIQUE,discord_active INTEGER);
CREATE TABLE auctions(id INTEGER PRIMARY KEY AUTOINCREMENT,driver_id INTEGER REFERENCES drivers(id),starting_price INTEGER,ends_at TEXT,status TEXT,leading_bid_id INTEGER);
CREATE TABLE bids(id INTEGER PRIMARY KEY AUTOINCREMENT,auction_id INTEGER REFERENCES auctions(id),team_id INTEGER REFERENCES teams(id),amount INTEGER,created_at TEXT);`;
for(const statement of (base+readFileSync(join(root,'migrations/001_auction_features.sql'),'utf8').replace(/^--.*$/gm,'')).split(';').filter(s=>s.trim()))sql(statement);
sql("INSERT INTO teams VALUES(1,'Ferrari','admin',100000000),(2,'McLaren','other',100000000)");sql("INSERT INTO drivers VALUES(1,'Theo',NULL,'100',1),(2,'Moritz',1,'200',1)");messages=[];discordFailure=false;}
async function cron(){worker.scheduled({},env,ctx);await drain()}
reset();
assert.equal((await request('/api/admin/auctions',null,{driverId:1})).status,401);
assert.equal((await request('/api/admin/auctions','viewer',{driverId:1})).status,403);
assert.equal((await request('/api/admin/queue','other')).status,403);
assert.equal((await request('/api/admin/auctions','admin',{driverId:1,startingPrice:1})).status,400);
assert.equal((await request('/api/admin/auctions','admin',{driverId:1})).status,201);await drain();
assert.equal(messages.length,1);assert.deepEqual(messages[0].allowed_mentions,{parse:[]});
assert.equal((await request('/api/admin/auctions','admin',{driverId:2})).status,409);
assert.equal((await request('/api/auctions/bid','viewer',{auctionId:1,amount:2500000})).status,403);
assert.equal((await request('/api/auctions/bid','admin',{auctionId:1,amount:2600000})).status,400);
assert.equal((await request('/api/auctions/bid','admin',{auctionId:1,amount:5000000})).status,201);
assert.equal(sql('SELECT budget FROM teams WHERE id=1')[0].budget,95000000);
assert.equal((await request('/api/auctions/bid','admin',{auctionId:1,amount:5250000})).status,409);
assert.equal((await request('/api/auctions/bid','other',{auctionId:1,amount:5500000})).status,201);
assert.equal(sql('SELECT budget FROM teams WHERE id=1')[0].budget,100000000);
assert.equal(sql('SELECT budget FROM teams WHERE id=2')[0].budget,94500000);
let a=(await request('/api/auctions')).body.auction;assert.equal(a.leadingTeamId,2);assert.equal(a.bids.length,2);assert.equal(a.bids[0].amount,5500000);
sql("UPDATE auctions SET ends_at=?",[new Date(Date.now()+5000).toISOString()]);
const before=Date.now();assert.equal((await request('/api/auctions/bid','admin',{auctionId:1,amount:6000000})).status,201);
assert.ok(Date.parse(sql('SELECT ends_at FROM auctions')[0].ends_at)>=before+15000);
assert.equal(sql('SELECT budget FROM teams WHERE id=2')[0].budget,100000000);
console.log('PASS auth, admin/teamchef permissions, exact bid amount, refunds, leader/history, anti-snipe');
// Two requests observe the same leading bid; only one batch may win.
const r=await Promise.all([request('/api/auctions/bid','other',{auctionId:1,amount:6250000}),request('/api/auctions/bid','other',{auctionId:1,amount:6500000})]);
assert.equal(r.filter(x=>x.status===201).length,1);assert.equal(r.filter(x=>x.status===409).length,1);
const leader=sql('SELECT b.amount FROM auctions a JOIN bids b ON b.id=a.leading_bid_id')[0].amount;
assert.equal(sql('SELECT SUM(budget) AS total FROM teams')[0].total+leader,200000000);
// A closer that read an expired auction must not overwrite an intervening extension.
sql('UPDATE auctions SET ends_at=?',[new Date(Date.now()-5000).toISOString()]);
beforeBatch=()=>sql('UPDATE auctions SET ends_at=?',[new Date(Date.now()+60000).toISOString()]);
await cron();assert.equal(sql('SELECT status FROM auctions')[0].status,'active');assert.equal(sql('SELECT team_id FROM drivers WHERE id=1')[0].team_id,null);
sql('UPDATE auctions SET ends_at=?',[new Date(Date.now()-1000).toISOString()]);await cron();await cron();
assert.equal(sql('SELECT team_id FROM drivers WHERE id=1')[0].team_id,2);assert.equal(sql("SELECT COUNT(*) AS n FROM auction_notifications WHERE event_type='ended'")[0].n,1);
assert.equal((await request('/api/transfers')).body.transfers.length,1);
assert.equal((await request('/api/drivers/1')).body.driver.teamName,'McLaren');
assert.equal((await request('/api/drivers/1')).body.transfers[0].amount,leader);
assert.equal(messages.length,2);
console.log('PASS concurrent bids conserve money, late extension beats stale closer, idempotent closure, transfers/profiles');
// Reauction without bids preserves the existing team.
assert.equal((await request('/api/admin/auctions','admin',{driverId:2})).status,201);await drain();
sql("UPDATE auctions SET ends_at=? WHERE status='active'",[new Date(Date.now()-1000).toISOString()]);await cron();assert.equal(sql('SELECT team_id FROM drivers WHERE id=2')[0].team_id,1);
assert.equal((await request('/api/transfers')).body.transfers.length,1);
const time=new Date(Date.now()+60000).toISOString();
assert.equal((await request('/api/admin/queue','admin',{driverId:1,startingPrice:2500000,scheduledAt:time})).status,201);
assert.equal((await request('/api/admin/queue','admin',{driverId:1,startingPrice:2500000,scheduledAt:time})).status,409);
assert.equal((await request('/api/admin/queue','viewer',{driverId:2,startingPrice:2500000,scheduledAt:time})).status,403);
assert.equal((await request('/api/admin/queue','admin')).body.queue.length,1);
await cron();assert.equal(sql("SELECT COUNT(*) n FROM auctions WHERE status='active'")[0].n,0);
sql('UPDATE auction_queue SET scheduled_at=?',[new Date(Date.now()-1000).toISOString()]);await cron();await cron();
assert.equal(sql("SELECT COUNT(*) n FROM auctions WHERE status='active'")[0].n,1);assert.equal(sql('SELECT status FROM auction_queue')[0].status,'started');
assert.equal((await request('/api/admin/queue/1/cancel','admin',{})).status,409);
assert.equal((await request('/api/admin/queue','admin',{driverId:2,startingPrice:2500000,scheduledAt:time})).status,201);
assert.equal((await request('/api/admin/queue/2/cancel','admin',{})).status,200);
await cron();assert.equal(sql("SELECT COUNT(*) n FROM auctions WHERE status='active'")[0].n,1);
console.log('PASS no-bid roster preservation, reauction, queue dates/duplicates/cancel/serialization');
// Discord retry persists failures without touching budgets or closing twice.
discordFailure=true;sql("UPDATE auctions SET ends_at=? WHERE status='active'",[new Date(Date.now()-1000).toISOString()]);await cron();
let failed=sql("SELECT * FROM auction_notifications WHERE sent_at IS NULL");assert.equal(failed.length,1);assert.equal(failed[0].attempts,1);assert.equal(failed[0].lease_until,null);
discordFailure=false;sql("UPDATE auction_notifications SET next_attempt_at=? WHERE sent_at IS NULL",[new Date(Date.now()-1000).toISOString()]);await cron();
assert.equal(sql('SELECT COUNT(*) n FROM auction_notifications WHERE sent_at IS NULL')[0].n,0);
console.log('PASS durable Discord retry, no duplicate outbox events');
console.log('ALL WORKER TESTS PASSED');
