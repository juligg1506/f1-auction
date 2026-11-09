import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithCustomToken,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
const $=id=>document.getElementById(id);const cfg=window.F1_CONFIG;
if(!cfg||cfg.firebase.apiKey==='REPLACE'){$('notice').textContent='Bitte config.js einrichten.';throw Error('Missing config');}
const app=initializeApp(cfg.firebase),auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,cfg.functionsRegion||'us-central1');
const call=(name,data)=>httpsCallable(fn,name)(data);const money=n=>new Intl.NumberFormat('de-DE').format(n||0)+' Coins';
const state={teams:[],auctions:[],user:null,uid:null,admin:false,unsubs:[],bidUnsubs:[]};
function notify(msg,err=false){$('notice').textContent=msg;$('notice').className=err?'error':'';}
function clean(){state.unsubs.forEach(f=>f());state.bidUnsubs.forEach(f=>f());state.unsubs=[];state.bidUnsubs=[];}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function countdown(ts){const ms=Math.max(0,ts-Date.now());if(!ms)return 'Abgelaufen';const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${h}h ${m}m ${s}s`;}
function render(){const team=state.teams.find(t=>t.id===state.user?.teamId);$('myTeam').textContent=team?.name||'Nicht zugewiesen';$('myBalance').textContent=team?money(team.balance):'–';
 const select=$('teamSelect');select.replaceChildren();state.teams.forEach(t=>{const o=node('option','',t.name);o.value=t.id;select.append(o);});
 $('teams').replaceChildren();state.teams.forEach(t=>{const c=node('div','card');c.append(node('h3','',t.name),node('p','muted',`Verfügbar: ${money(t.balance)}`));$('teams').append(c);});
 state.bidUnsubs.forEach(f=>f());state.bidUnsubs=[];$('auctions').replaceChildren();
 state.auctions.forEach(a=>{const c=node('article','card');const top=node('div','row');top.append(node('h3','',a.driverName),node('span','pill',a.status==='open'?'LIVE':'BEENDET'));c.append(top);
 const highest=state.teams.find(t=>t.id===a.winnerTeamId);c.append(node('p','muted',`Höchstgebot: ${money(a.highestBid||0)}`),node('p','',`Führend: ${highest?.name||'Noch niemand'}`));
 const timer=node('p','red');const end=a.endsAt?.toMillis?.()||0;timer.textContent=a.status==='open'?countdown(end):'Auktion beendet';c.append(timer);
 if(a.status==='open'&&end>Date.now()&&state.user?.teamId){const form=node('form');const min=Math.max(a.startPrice||1,(a.highestBid||0)+(a.increment||1));const label=node('label','',`Gebot ab ${money(min)}`);const inp=node('input');inp.type='number';inp.min=String(min);inp.step='1';inp.value=String(min);inp.required=true;label.append(inp);const btn=node('button','', 'Gebot abgeben');form.append(label,btn);form.addEventListener('submit',async e=>{e.preventDefault();btn.disabled=true;try{await call('placeBid',{auctionId:a.id,amount:Number(inp.value)});notify('Gebot erfolgreich abgegeben.');}catch(err){notify(err.message,true);}finally{btn.disabled=false;}});c.append(form);}
 const title=node('h4','','Letzte Gebote');const list=node('ul','muted');c.append(title,list);state.bidUnsubs.push(onSnapshot(query(collection(db,'auctions',a.id,'bids'),orderBy('createdAt','desc'),limit(5)),snap=>{list.replaceChildren();snap.forEach(b=>{const d=b.data();const team=state.teams.find(t=>t.id===d.teamId);list.append(node('li','',`${team?.name||'Team'}: ${money(d.amount)}`));});},e=>notify(e.message,true)));
 $('auctions').append(c);});}
$('login').onclick=()=>location.assign(cfg.discordStartUrl);$('logout').onclick=()=>signOut(auth);
const code=new URL(location.href).searchParams.get('login_code');if(code){history.replaceState({},'',location.pathname);try{const r=await call('exchangeLogin',{code});await signInWithCustomToken(auth,r.data.token);}catch(e){notify('Discord-Anmeldung fehlgeschlagen: '+e.message,true);}}
onAuthStateChanged(auth,async user=>{clean();state.uid=user?.uid||null;state.user=null;state.teams=[];state.auctions=[];$('login').classList.toggle('hidden',!!user);$('logout').classList.toggle('hidden',!user);$('guest').classList.toggle('hidden',!!user);$('app').classList.toggle('hidden',!user);if(!user)return;
 const token=await user.getIdTokenResult();state.admin=token.claims.admin===true;$('admin').classList.toggle('hidden',!state.admin);
 state.unsubs.push(onSnapshot(doc(db,'users',user.uid),snap=>{state.user=snap.data()||{};$('identity').textContent=state.user.displayName||user.uid;render();},e=>notify(e.message,true)));
 state.unsubs.push(onSnapshot(collection(db,'teams'),snap=>{state.teams=snap.docs.map(d=>({id:d.id,...d.data()}));render();},e=>notify(e.message,true)));
 state.unsubs.push(onSnapshot(collection(db,'auctions'),snap=>{state.auctions=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.endsAt?.toMillis?.()||0)-(b.endsAt?.toMillis?.()||0));render();},e=>notify(e.message,true)));
});
function formHandler(id,fnName,makeData){$(id).addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const data=makeData(new FormData(e.currentTarget));await call(fnName,data);notify('Erfolgreich gespeichert.');e.currentTarget.reset();}catch(err){notify(err.message,true);}finally{b.disabled=false;}});}
formHandler('createTeam','adminCreateTeam',f=>({name:f.get('name')}));
formHandler('assignTeam','adminAssignTeam',f=>({discordId:f.get('discordId'),teamId:f.get('teamId')}));
formHandler('createAuction','adminCreateAuction',f=>({driverName:f.get('driverName'),startPrice:Number(f.get('startPrice'))*1000000,increment:Number(f.get('increment'))*1000000,durationHours:Number(f.get('durationHours'))}));
$('close').onclick=async()=>{try{const r=await call('adminCloseAuctions');notify(`${r.data.closed} Auktionen geprüft/abgeschlossen.`);}catch(e){notify(e.message,true);}};
setInterval(()=>{document.querySelectorAll('#auctions article').forEach((card,i)=>{const a=state.auctions[i];const timer=card.querySelector('.red');if(timer&&a)timer.textContent=a.status==='open'?countdown(a.endsAt?.toMillis?.()||0):'Auktion beendet';});},1000);
