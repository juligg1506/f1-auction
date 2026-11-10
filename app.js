const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);
const notice = message => { $('notice').textContent = message; };
const BID_STEP = 250000;
let token = sessionStorage.getItem('f1_session');
let isAdmin = false, myTeam = null, currentAuction = null, serverOffset = 0;
let bidPending = false, selectedBid = null, selectedAuctionId = null, auctionLoading = false;
let drivers = [];
if (location.hash.startsWith('#session=')) {
  const candidate = location.hash.slice('#session='.length);
  if (/^[a-f0-9]{64}$/.test(candidate)) {
    token = candidate;
    sessionStorage.setItem('f1_session', token);
  }
  history.replaceState(null, '', location.pathname + location.search);
} else if (location.hash.startsWith('#login_error=')) {
  history.replaceState(null, '', location.pathname + location.search);
  notice('Discord-Anmeldung fehlgeschlagen.');
}
$('login').onclick = () => location.assign(API + '/auth/start');
$('logout').onclick = async () => {
  try { await fetch(API + '/api/logout', { method:'POST', headers:{Authorization:`Bearer ${token}`} }); } catch(e) { console.error(e); }
  sessionStorage.removeItem('f1_session'); token = null; location.reload();
};
async function apiRequest(path, options={}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...(options.headers||{}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
    cache:'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'API-Fehler');
  return data;
}
function displayBalance() {
  $('myTeam').textContent = myTeam?.name || 'Noch nicht zugewiesen';
  $('myBalance').textContent = myTeam ? format(myTeam.budget) + ' Coins' : '–';
}
async function refreshBalance() {
  const me = await apiRequest('/api/me');
  myTeam = me.team || null; displayBalance();
}
async function boot() {
  if (!token) return;
  try {
    const me = await apiRequest('/api/me');
    isAdmin = Boolean(me.admin); myTeam = me.team || null;
    $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
    $('guest').classList.add('hidden'); $('app').classList.remove('hidden');
    $('identity').textContent = me.username; displayBalance();
    $('admin').classList.toggle('hidden', !isAdmin);
    $('createTeam').classList.add('hidden'); $('assignTeam').classList.add('hidden');
    $('close').classList.add('hidden');
    $('teams').textContent = 'Teamübersicht folgt.';
    notice('Discord-Login erfolgreich.');
    await loadDrivers(); await loadAuction();
  } catch(e) { sessionStorage.removeItem('f1_session'); token=null; notice(e.message); }
}
async function loadDrivers() {
  try {
    const data = await apiRequest('/api/drivers'); drivers = data.drivers || [];
    if (isAdmin) {
      const select = $('auctionDriver');
      const previous = select.value;
      select.replaceChildren(new Option('Fahrer auswählen',''));
      for (const driver of drivers) select.add(new Option(driver.name, driver.id));
      if ([...select.options].some(o=>o.value===previous)) select.value=previous;
    }
    if (!currentAuction) renderDrivers();
  } catch(e) { console.error('Fahrer konnten nicht geladen werden:',e); }
}
function renderDrivers() {
  const container=$('auctions');
  const card=document.createElement('div'); card.className='card';
  const heading=document.createElement('h3'); heading.textContent='Aktuell keine aktive Auktion';
  const info=document.createElement('p'); info.className='muted'; info.textContent='Verfügbare Fahrer';
  const list=document.createElement('ul');
  for (const driver of drivers) { const item=document.createElement('li'); item.textContent=driver.name; list.appendChild(item); }
  card.append(heading,info,list); container.replaceChildren(card);
}
function getMinimumBid(a) { return a.highestBid != null ? Number(a.highestBid)+BID_STEP : Number(a.startingPrice); }
function getRemainingMs(a) { return Date.parse(a.endsAt)-Date.now()-serverOffset; }
function renderBidControls(card,a) {
  if (!myTeam) return;
  const minimumBid=getMinimumBid(a);
  if (selectedAuctionId!==a.id) { selectedAuctionId=a.id; selectedBid=minimumBid; }
  if (selectedBid===null || selectedBid<minimumBid) selectedBid=minimumBid;
  const controls=document.createElement('div'); controls.className='bid-controls';
  const minus=document.createElement('button'); minus.type='button'; minus.textContent='−'; minus.setAttribute('aria-label','Gebot verringern');
  const amountDisplay=document.createElement('strong');
  const plus=document.createElement('button'); plus.type='button'; plus.textContent='+'; plus.setAttribute('aria-label','Gebot erhöhen');
  const bidButton=document.createElement('button'); bidButton.type='button'; bidButton.id='bidButton';
  const warning=document.createElement('p'); warning.className='muted';
  function updateControls() {
    amountDisplay.textContent=format(selectedBid)+' Coins';
    bidButton.textContent='💰 '+format(selectedBid)+' Coins bieten';
    const budget=Number(myTeam.budget), expired=getRemainingMs(a)<=0;
    minus.disabled=bidPending||expired||selectedBid<=minimumBid;
    plus.disabled=bidPending||expired||selectedBid+BID_STEP>budget;
    bidButton.disabled=bidPending||expired||selectedBid<minimumBid||selectedBid>budget;
    warning.textContent=selectedBid>budget?'Nicht genügend Coins.':'';
  }
  minus.onclick=()=>{ selectedBid=Math.max(minimumBid,selectedBid-BID_STEP); updateControls(); };
  plus.onclick=()=>{ if(selectedBid+BID_STEP<=Number(myTeam.budget)){selectedBid+=BID_STEP;updateControls();} };
  bidButton.onclick=async()=>{
    if(bidPending)return;
    if(getRemainingMs(a)<=0){notice('Diese Auktion ist abgelaufen.');return;}
    const amount=selectedBid;
    if(amount<getMinimumBid(a)||amount>Number(myTeam.budget)){notice('Ungültiger Gebotsbetrag.');return;}
    if(!confirm(format(amount)+' Coins für '+a.driverName+' bieten?'))return;
    bidPending=true;updateControls();
    try {
      await apiRequest('/api/auctions/bid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auctionId:a.id,amount})});
      notice('Gebot über '+format(amount)+' Coins erfolgreich abgegeben!');
      await refreshBalance();
    } catch(e) {notice('Gebot fehlgeschlagen: '+e.message);}
    finally {bidPending=false;updateControls();await loadAuction();}
  };
  controls.append(minus,amountDisplay,plus); card.append(controls,bidButton,warning); updateControls();
}
async function loadAuction() {
  if(auctionLoading||bidPending)return;
  auctionLoading=true;
  try {
    const data=await apiRequest('/api/auctions');
    currentAuction=data.auction; serverOffset=Date.parse(data.serverTime)-Date.now();
    if(!currentAuction){selectedAuctionId=null;selectedBid=null;renderDrivers();return;}
    const a=currentAuction, card=document.createElement('div'); card.className='card auction-card';
    const status=document.createElement('span');status.className='status';status.textContent='LIVE-AUKTION';
    const title=document.createElement('h3');title.style.marginTop='16px';title.textContent='🏎️ '+a.driverName;
    const price=document.createElement('p');price.className='muted';price.textContent='Startpreis: '+format(a.startingPrice)+' Coins';
    const highest=document.createElement('p');highest.textContent=a.highestBid!=null?'Höchstgebot: '+format(a.highestBid)+' Coins':'Noch keine Gebote';
    const timerLabel=document.createElement('div');timerLabel.className='muted';timerLabel.textContent='Verbleibende Zeit';
    const timer=document.createElement('div');timer.className='stat red';timer.id='auctionTimer';
    card.append(status,title,price,highest,timerLabel,timer);
    renderBidControls(card,a); $('auctions').replaceChildren(card);updateTimer();
  } catch(e) {console.error('Auktion konnte nicht geladen werden:',e);notice('Auktion konnte nicht geladen werden: '+e.message);}
  finally {auctionLoading=false;}
}
function updateTimer() {
  if(!currentAuction)return;
  const timer=$('auctionTimer');if(!timer)return;
  const remaining=Math.max(0,Math.ceil(getRemainingMs(currentAuction)/1000));
  const minutes=Math.floor(remaining/60),seconds=remaining%60;
  timer.textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  if(remaining===0){timer.textContent='Zeit abgelaufen – Abschluss ausstehend';
    const button=$('bidButton');if(button)button.disabled=true;
    document.querySelectorAll('.bid-controls button').forEach(b=>b.disabled=true);
  }
}
$('createAuction').addEventListener('submit',async event=>{
  event.preventDefault();if(!isAdmin||!token)return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  const driverId=Number(form.elements.driverId.value),startingPrice=Number(form.elements.startingPrice.value);
  if(!Number.isSafeInteger(driverId)||driverId<=0||!Number.isSafeInteger(startingPrice)||startingPrice<BID_STEP){notice('Bitte gültigen Fahrer und Startpreis auswählen.');return;}
  if(!confirm('Diese Fahrerauktion wirklich starten?'))return;
  button.disabled=true;
  try {await apiRequest('/api/admin/auctions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({driverId,startingPrice})});notice('Fahrerauktion erfolgreich gestartet!');await loadAuction();}
  catch(e){notice('Auktion konnte nicht gestartet werden: '+e.message);}
  finally{button.disabled=false;}
});
setInterval(updateTimer,1000);
setInterval(()=>{if(token&&!bidPending)loadAuction();},3000);
boot();
