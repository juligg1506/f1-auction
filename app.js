const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);
const notice = message => { $('notice').textContent = message; const auctionNotice = $('auctionNotice'); if (auctionNotice) auctionNotice.textContent = message; };
const BID_STEP = 250000;
const GUEST_MODE_KEY = 'f1_guest_readonly_v2';
let token = sessionStorage.getItem('f1_session');
let loginReturnView = null;
let authenticated = false;
let memberDriver = null;
let guestMode = !token&&sessionStorage.getItem(GUEST_MODE_KEY)==='1';
sessionStorage.removeItem('f1_guest_mode');
let isAdmin = false, myTeam = null, currentAuction = null, serverOffset = 0;
let bidPending = false, selectedBid = null, selectedAuctionId = null, auctionLoading = false;
let drivers = [];
let extensionReady = false, trackedLead = null;
const knownDrivers = new Map();
if (location.hash.startsWith('#session=')) {
  const candidate = location.hash.slice('#session='.length);
  if (/^[a-f0-9]{64}$/.test(candidate)) {
    token = candidate;
    loginReturnView = sessionStorage.getItem('f1_return_view');
    sessionStorage.removeItem('f1_return_view');
    sessionStorage.setItem('f1_session', token);
  }
  history.replaceState(null, '', location.pathname + location.search);
} else if (location.hash.startsWith('#login_error=')) {
  const notMember=location.hash.includes('not_server_member');history.replaceState(null, '', location.pathname + location.search);
  notice(notMember?'Zugang nur für Mitglieder unseres Discord-Servers.':'Discord-Anmeldung fehlgeschlagen.');
}
$('login').onclick = () => { guestMode=false;sessionStorage.removeItem(GUEST_MODE_KEY);if(!sessionStorage.getItem('f1_return_view'))sessionStorage.setItem('f1_return_view','start'); location.assign(API + '/auth/start'); };
$('logout').onclick = async () => {
  try { await fetch(API + '/api/logout', { method:'POST', headers:{Authorization:`Bearer ${token}`} }); } catch(e) { console.error(e); }
  sessionStorage.removeItem('f1_session');sessionStorage.removeItem(GUEST_MODE_KEY);guestMode=false;token = null; authenticated=false;applyView();location.reload();
};
function invalidateSession() {
  sessionStorage.removeItem('f1_session');token=null;authenticated=false;isAdmin=false;myTeam=null;memberDriver=null;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('app').classList.add('hidden');$('guest').classList.remove('hidden');$('login').classList.remove('hidden');$('logout').classList.add('hidden');applyView();
}
async function apiRequest(path, options={}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...(options.headers||{}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
    cache:'no-store'
  });
  const data = await response.json();
  if(response.status===401&&token)invalidateSession();
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
    isAdmin = Boolean(me.admin); myTeam = me.team || null;memberDriver=me.driver||null;authenticated=true;guestMode=false;sessionStorage.removeItem(GUEST_MODE_KEY);
    $('login').classList.add('hidden'); $('logout').classList.remove('hidden');
    $('guest').classList.add('hidden'); $('app').classList.remove('hidden');
    $('identity').textContent = me.username; displayBalance();
    $('admin').classList.toggle('hidden', !isAdmin);
    applyView();
    $('createTeam').classList.add('hidden'); $('assignTeam').classList.add('hidden');
    $('close').classList.add('hidden');
    await loadTeams();
    notice('Discord-Login erfolgreich.');
    await loadDrivers(); await loadAuction(); await loadExtensions(); await loadRaceArea(); await loadDriverStatistics();
  } catch(e) { sessionStorage.removeItem('f1_session');token=null;authenticated=false;isAdmin=false;myTeam=null;memberDriver=null;$('app').classList.add('hidden');$('guest').classList.remove('hidden');$('login').classList.remove('hidden');$('logout').classList.add('hidden');applyView();notice('Bitte erneut mit Discord anmelden.'); }
}

async function loadTeams() {
  try {
    const data = await apiRequest('/api/teams');
    const container = $('teams');
    container.replaceChildren();
    const identities = {
      Alpine: ['ALP', '#ff87bc'], 'Aston Martin': ['AM', '#229971'],
      Audi: ['AUDI', '#f50537'], Cadillac: ['CAD', '#d4af37'],
      Ferrari: ['SF', '#e8002d'], Haas: ['HAAS', '#b6babd'],
      McLaren: ['MCL', '#ff8000'], Mercedes: ['AMG', '#27f4d2'],
      'Racing Bulls': ['VCARB', '#6692ff'], 'Red Bull': ['RBR', '#3671c6'],
      Williams: ['W', '#64c4ff']
    };
    // Team logo files are served from this website; no visitor requests go to the Formula 1 image host.
    const logoSlugs = {
      Alpine: 'alpine', 'Aston Martin': 'astonmartin', Audi: 'audi',
      Cadillac: 'cadillac', Ferrari: 'ferrari', Haas: 'haasf1team',
      McLaren: 'mclaren', Mercedes: 'mercedes', 'Racing Bulls': 'racingbulls',
      'Red Bull': 'redbullracing', Williams: 'williams'
    };
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const initials = name => String(name || '').trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || '–';
    for (const team of data.teams || []) {
      const [, color] = identities[team.name] || [initials(team.name), '#ff3c51'];
      const card = element('article', 'card team-profile');
      card.style.setProperty('--team-color', color);
      const header = element('header', 'team-profile-header');
      const mark = element('div', 'team-logo-slot');
      const slug = logoSlugs[team.name];
      if (slug) {
        const logo = element('img', 'team-logo');
        logo.alt = team.name + ' Logo';
        logo.width = 176;
        logo.height = 72;
        logo.loading = 'lazy';
        logo.decoding = 'async';
        logo.referrerPolicy = 'no-referrer';
        logo.addEventListener('error', () => {
          mark.replaceChildren(element('span', 'team-logo-fallback', team.name));
        }, { once: true });
        logo.src = 'assets/teams/' + slug + '.webp';
        mark.append(logo);
      } else {
        mark.append(element('span', 'team-logo-fallback', team.name));
      }
      const identity = element('div', 'team-identity');
      identity.append(element('p', 'team-kicker', 'RACING LEAGUE'), element('h3', 'team-name', team.name));
      header.append(mark, identity);
      const details = element('dl', 'team-details');
      const ownerRow = element('div', 'team-owner');
      // Never resolve a Discord ID to a guessed name.
      const ownerName = typeof team.owner_username === 'string' && team.owner_username.trim()
        ? team.owner_username : null;
      ownerRow.append(element('dt', '', 'Teamchef'), element('dd', '', ownerName || 'Nicht verfügbar'));
      const budgetRow = element('div', 'team-budget');
      const amount = element('dd', 'stat', format(team.budget));
      amount.append(element('span', 'coin-unit', 'Coins'));
      budgetRow.append(element('dt', '', 'Verfügbares Budget'), amount);
      details.append(ownerRow);if(authenticated&&Number.isFinite(team.budget))details.append(budgetRow);
      const squad = element('section', 'team-squad');
      const roster = Array.isArray(team.drivers) ? team.drivers : [];
      const squadHeader = element('div', 'team-squad-header');
      squadHeader.append(element('h4', '', 'Fahrerkader'), element('span', 'team-roster-count', String(roster.length).padStart(2, '0')));
      squad.append(squadHeader);
      if (roster.length) {
        const list = element('ul', 'team-roster');
        for (const driver of roster) {
          const row = element('li', 'team-driver');
          const monogram = element('span', 'driver-initials', initials(driver.name));
          monogram.setAttribute('aria-hidden', 'true');
          knownDrivers.set(Number(driver.id), { ...driver, teamName: team.name });
          row.append(monogram, profileLink(driver));
          list.append(row);
        }
        squad.append(list);
      } else {
        squad.append(element('p', 'team-empty', 'Noch keine Fahrer verpflichtet'));
      }
      card.append(header, details, squad);
      container.append(card);
    }
  } catch (error) {
    console.error(error);
    notice('Teamübersicht konnte nicht geladen werden.');
  }
}

async function loadDrivers() {
  try {
    const data = await apiRequest('/api/drivers'); drivers = data.drivers || [];
    for (const driver of drivers) if (!knownDrivers.has(Number(driver.id))) knownDrivers.set(Number(driver.id), driver);
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
function auctionPortrait() {
 const art=ui('div','auction-driver-art'),image=ui('img','');image.src='assets/auction-driver.svg';image.alt='';image.width=420;image.height=540;art.append(image);art.setAttribute('aria-hidden','true');return art;
}
function setAuctionBadge(active){const badge=$('auctionStatusBadge');badge.textContent=active?'LIVE':'PAUSE';badge.classList.toggle('is-paused',!active);}
function renderDrivers() {
 setAuctionBadge(false);
 const card=ui('section','auction-empty'),copy=ui('div','auction-empty-copy');
 copy.append(ui('p','auction-eyebrow','VTR · FAHRERMARKT'),ui('h3','','Die nächste Auktion kommt.'),ui('p','muted',isAdmin?'Starte oder plane eine Fahrerauktion in der Verwaltung.':'Sobald die Ligaleitung eine Auktion startet, kannst du sie hier verfolgen.'));
 const roster=ui('section','auction-empty-roster');roster.append(ui('h4','','Fahrer im Paddock'));
 const list=ui('div','auction-driver-chips');for(const driver of drivers)list.append(profileLink(driver));roster.append(drivers.length?list:ui('p','muted','Zurzeit sind keine aktiven Fahrer verfügbar.'));
 card.append(auctionPortrait(),copy,roster);$('auctions').replaceChildren(card);
}
const AUCTION_TEAM_COLORS={Ferrari:'#ed3347',McLaren:'#ff9d31',Mercedes:'#48e1c0','Red Bull':'#5e85ff',Williams:'#4eabff','Racing Bulls':'#a5b9ff','Aston Martin':'#42b792',Alpine:'#ef8dbf',Audi:'#ed4b57',Haas:'#b9c4d2',Cadillac:'#cbb36b'};
function auctionTeamColor(name){return AUCTION_TEAM_COLORS[name]||'#8b75f7';}
function auctionBudgetPanel(){
 const panel=ui('aside','auction-budget-panel');panel.append(ui('p','auction-eyebrow',myTeam?'Dein verfügbares Budget':'Auktion verfolgen'),ui('strong','auction-budget-value',myTeam?format(myTeam.budget):'Nur ansehen'),ui('p','auction-budget',myTeam?myTeam.name+' · Liga-Coins':'Gebote können angemeldete Teamchefs abgeben.'));return panel;
}
function auctionActivity(a){
 const section=ui('section','auction-activity'),header=ui('div','auction-activity-header');header.append(ui('h4','','Live-Meldungen'),ui('span','','Abgleich alle 3 Sekunden'));section.append(header);
 const bids=(a.bids||[]).slice(0,3);
 if(!bids.length)section.append(ui('p','muted','Noch kein Gebot eingegangen.'));
 for(const bid of bids){const row=ui('div','auction-activity-row'),time=ui('time','',Number.isFinite(Date.parse(bid.createdAt))?new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(bid.createdAt)):'–');time.dateTime=bid.createdAt;row.style.setProperty('--bid-color',auctionTeamColor(bid.teamName));row.append(time,ui('span','',bid.teamName+' bietet '+format(bid.amount)+' Coins.'));section.append(row);}
 return section;
}
function getMinimumBid(a) { return a.highestBid != null ? Number(a.highestBid)+BID_STEP : Number(a.startingPrice); }
function getRemainingMs(a) { return Date.parse(a.endsAt)-Date.now()-serverOffset; }
function renderBidControls(card,a) {
  if (!authenticated || !myTeam) return;
  if (a.leadingTeamId != null && Number(a.leadingTeamId) === Number(myTeam.id)) {
    const status=document.createElement('div');status.className='bid-leading';
    const heading=document.createElement('h4');heading.textContent='Dein Team führt';heading.tabIndex=-1;heading.dataset.auctionFocus='leading';
    const amount=document.createElement('strong');amount.textContent=format(a.highestBid)+' Coins';
    const info=document.createElement('p');info.textContent='Dieses Gebot ist für dein Team reserviert. Wir melden dir, wenn du überboten wirst.';
    status.append(heading,amount,info);card.append(status);return;
  }
  const minimumBid=getMinimumBid(a);
  if (selectedAuctionId!==a.id) { selectedAuctionId=a.id; selectedBid=minimumBid; }
  if (selectedBid===null || selectedBid<minimumBid) selectedBid=minimumBid;
  const label=document.createElement('p');label.className='bid-amount-label';label.textContent='Gebotsbetrag';
  const controls=document.createElement('div');controls.className='bid-controls';
  const makeButton=(text,name,key)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',name);button.dataset.auctionFocus=key;return button;};
  const minus=makeButton('−','Gebot um 250.000 Coins verringern','minus');
  const plus=makeButton('+','Gebot um 250.000 Coins erhöhen','plus');
  const amountDisplay=document.createElement('strong');amountDisplay.tabIndex=-1;amountDisplay.dataset.auctionFocus='amount';
  const shortcuts=document.createElement('div');shortcuts.className='bid-shortcuts';
  const reset=makeButton('Mindestgebot','Mindestgebot auswählen','minimum');
  const addMillion=makeButton('+1 Mio.','Gebot um 1.000.000 Coins erhöhen','million');shortcuts.append(reset,addMillion);
  const remaining=document.createElement('p');remaining.className='bid-budget-preview';
  const bidButton=makeButton('','Gebot abgeben','submit');bidButton.id='bidButton';bidButton.removeAttribute('aria-label');
  const warning=document.createElement('p');warning.className='bid-warning';warning.setAttribute('role','status');
  const step=document.createElement('p');step.className='bid-step-note';step.textContent='Schrittweite 250.000 Coins · Bestätigung vor Abgabe';
  function updateControls() {
    amountDisplay.replaceChildren(document.createTextNode(format(selectedBid)));
    const unit=document.createElement('span');unit.textContent='Coins';amountDisplay.append(unit);
    bidButton.textContent=bidPending?'Gebot wird gesendet …':format(selectedBid)+' Coins bieten';
    const budget=Number(myTeam.budget),expired=getRemainingMs(a)<=0;
    minus.disabled=bidPending||expired||selectedBid<=minimumBid;
    plus.disabled=bidPending||expired||selectedBid+BID_STEP>budget;
    reset.disabled=bidPending||expired||selectedBid===minimumBid;
    addMillion.disabled=bidPending||expired||selectedBid+4*BID_STEP>budget;
    bidButton.disabled=bidPending||expired||selectedBid<minimumBid||selectedBid>budget;
    remaining.textContent=selectedBid<=budget?'Nach dem Gebot verfügbar: '+format(budget-selectedBid)+' Coins':'Verfügbares Budget: '+format(budget)+' Coins';
    warning.textContent=expired?'Die Auktion ist abgelaufen.':selectedBid>budget?'Dein Budget reicht für das Mindestgebot nicht aus.':'';
  }
  function change(amount) { if(bidPending||getRemainingMs(a)<=0)return; if(amount>=minimumBid && amount<=Number(myTeam.budget))selectedBid=amount;updateControls(); }
  minus.onclick=()=>change(Math.max(minimumBid,selectedBid-BID_STEP));plus.onclick=()=>change(selectedBid+BID_STEP);
  reset.onclick=()=>change(minimumBid);addMillion.onclick=()=>change(selectedBid+4*BID_STEP);
  bidButton.onclick=async()=>{
    if(bidPending)return;
    if(!authenticated||!token||!myTeam){notice('Zum Bieten bitte mit Discord anmelden.');return;}
    if(getRemainingMs(a)<=0){notice('Diese Auktion ist abgelaufen.');return;}
    const amount=selectedBid;
    if(amount<getMinimumBid(a)||amount>Number(myTeam.budget)){notice('Ungültiger Gebotsbetrag.');return;}
    if(!confirm(format(amount)+' Coins für '+a.driverName+' bieten?'))return;
    bidPending=true;updateControls();
    try {
      const accepted=await apiRequest('/api/auctions/bid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auctionId:a.id,amount})});
      trackedLead={auctionId:a.id,amount:Number(accepted.amount)};
      $('outbidAlert').classList.add('hidden');notice('Gebot über '+format(accepted.amount)+' Coins erfolgreich abgegeben!');await refreshBalance();
    }catch(e){notice('Gebot fehlgeschlagen: '+e.message);}
    finally{bidPending=false;updateControls();await loadAuction();}
  };
  controls.append(minus,amountDisplay,plus);card.append(label,controls,shortcuts,remaining,bidButton,warning,step);updateControls();
}
async function loadAuction() {
  if(auctionLoading||bidPending)return;
  auctionLoading=true;
  try {
    const data=await apiRequest('/api/auctions');
    const previousAuction = currentAuction;
    currentAuction=data.auction;
    trackLeadingBid(currentAuction);
    if (previousAuction && previousAuction.id !== currentAuction?.id) { loadTeams(); loadDrivers(); loadTransfers(); authenticated && refreshBalance().catch(() => {}); if (isAdmin) loadQueue(); }
    serverOffset=Date.parse(data.serverTime)-Date.now();
    if(!currentAuction){selectedAuctionId=null;selectedBid=null;renderDrivers();return;}
    setAuctionBadge(true);
    const a=currentAuction,card=ui('div','auction-card'),overview=ui('section','auction-overview'),identity=ui('div','auction-driver-identity');
    const driver=drivers.find(d=>Number(d.id)===Number(a.driverId))||knownDrivers.get(Number(a.driverId));
    const title=ui('h3','auction-driver-title');title.append(profileLink({id:a.driverId,name:a.driverName,racingNumber:driver?.racingNumber}));
    identity.append(ui('span','auction-live-label','Aktueller Fahrer'),title,ui('p','auction-starting-price','Startpreis: '+format(a.startingPrice)+' Coins'));
    const metrics=ui('div','auction-key-metrics'),highest=ui('div','auction-highest'),leader=ui('div','auction-leader');
    highest.append(ui('span','','Höchstgebot'),ui('strong','',a.highestBid!=null?format(a.highestBid):'Noch kein Gebot'),ui('small','','Liga-Coins'));
    leader.append(ui('span','','Höchstbietender'),ui('strong','',a.leadingTeamName||'Noch kein Team'));metrics.append(highest,leader);
    identity.append(metrics);
    const clock=ui('div','auction-clock'),clockText=ui('div','auction-clock-text'),timer=ui('div','stat');timer.id='auctionTimer';clockText.append(ui('span','auction-clock-label','Restzeit'),timer);
    const bar=ui('progress','auction-time-bar');bar.id='auctionTimeBar';bar.max=180;bar.value=180;bar.setAttribute('aria-label','Verbleibende Auktionszeit');clock.append(clockText,bar);
    overview.append(auctionPortrait(),identity,clock);
    const bidding=ui('section','auction-bidding');bidding.append(ui('h4','',myTeam?'Dein nächstes Gebot':'Du verfolgst die Auktion'));
    if(myTeam)renderBidControls(bidding,a);else bidding.append(ui('p','auction-spectator','Nur Teamchefs können Gebote abgeben. Du kannst Höchstgebot und Verlauf live verfolgen.'));
    if(data.features?.antiSnipeSeconds){const rule=ui('p','auction-rule','Gebote in den letzten '+data.features.antiSnipeSeconds+' Sekunden setzen die Restzeit auf '+data.features.antiSnipeSeconds+' Sekunden zurück.');bidding.append(rule);}
    const side=ui('div','auction-side');side.append(auctionBudgetPanel(),bidHistory(a));
    card.append(overview,side,bidding,auctionActivity(a));
    const focusKey=$('auctions').contains(document.activeElement)?document.activeElement.dataset.auctionFocus:null;
    const historyScroll=$('auctions').querySelector('.bid-history-list')?.scrollTop || 0;
    $('auctions').replaceChildren(card);updateTimer();
    const historyList=card.querySelector('.bid-history-list');if(historyList)historyList.scrollTop=historyScroll;
    if(focusKey){const target=card.querySelector('[data-auction-focus="'+focusKey+'"]');const fallback=card.querySelector('[data-auction-focus="amount"], [data-auction-focus="leading"]');if(target&&!target.disabled)target.focus({preventScroll:true});else fallback?.focus({preventScroll:true});}
  } catch(e) {console.error('Auktion konnte nicht geladen werden:',e);notice('Auktion konnte nicht geladen werden: '+e.message);}
  finally {auctionLoading=false;}
}
function updateTimer() {
  if(!currentAuction)return;
  const timer=$('auctionTimer');if(!timer)return;
  const remaining=Math.max(0,Math.ceil(getRemainingMs(currentAuction)/1000));
  const minutes=Math.floor(remaining/60),seconds=remaining%60;
  timer.textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  timer.classList.toggle('is-expired',remaining===0);
  const bar=$('auctionTimeBar');if(bar){bar.hidden=remaining===0;bar.max=Math.max(180,remaining);bar.value=remaining;bar.setAttribute('aria-valuetext',remaining+' Sekunden verbleibend');}
  timer.closest('.auction-clock')?.classList.toggle('is-critical',remaining<=15);
  if(remaining===0)$('auctionStatusBadge').textContent='ABSCHLUSS';
  if(remaining===0){timer.textContent='Zeit abgelaufen – Abschluss ausstehend';
    const button=$('bidButton');if(button)button.disabled=true;
    document.querySelectorAll('.bid-controls button, .bid-shortcuts button').forEach(b=>b.disabled=true);
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
setInterval(()=>{if(authenticated&&!bidPending)loadAuction();},3000);
const ui = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const dateText = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(date) : '–'; };
function profileLink(driver) {
  const button = ui('button', 'driver-link', driver.name);
  if(Number.isInteger(driver.racingNumber)){const badge=ui('span','racing-number','#'+driver.racingNumber);badge.setAttribute('aria-label','Startnummer '+driver.racingNumber);button.prepend(badge);}
  button.type = 'button'; button.addEventListener('click', () => openDriverProfile(driver.id));
  return button;
}
async function loadExtensions() {
  try { const result = await apiRequest('/api/features'); extensionReady = result.version >= 2; } catch { extensionReady = false; }
  $('queueSection').classList.toggle('hidden', !isAdmin || !extensionReady);
  if (extensionReady) {
    const hint = $('discordDeliveryStatus');
    try { const f = await apiRequest('/api/features'); hint.textContent = f.discordConfigured ? 'Discord-Benachrichtigungen sind eingerichtet.' : 'Für Discord-Benachrichtigungen muss noch ein Kanal hinterlegt werden.'; } catch { hint.textContent = ''; }
    await loadTransfers();
    if (isAdmin) await loadQueue();
  } else { $('transferList').textContent = 'Die Transferhistorie ist derzeit nicht verfügbar.'; }
}
function transferRows(rows) {
  const list = ui('ul', 'transfer-list');
  for (const t of rows) {
    const row = ui('li', 'transfer-row');
    row.append(profileLink({ id: t.driverId, name: t.driverName }), ui('span', '', t.teamName), ui('strong', '', format(t.amount) + ' Coins'), ui('time', 'muted', dateText(t.endedAt)));
    list.append(row);
  }
  return list;
}
async function loadTransfers() {
  if (!extensionReady) return;
  try {
    const data = await apiRequest('/api/transfers');
    const rows = data.transfers || [];
    $('transferList').replaceChildren(rows.length ? transferRows(rows) : ui('p', 'muted', 'Noch keine abgeschlossenen Transfers.'));
  } catch { $('transferList').textContent = 'Die Transferhistorie konnte nicht geladen werden.'; }
}
let profileRequest = 0;
async function openDriverProfile(id) {
  if(!authenticated){requestDriverLogin('fahrerstatistiken');return;}
  const dialog = $('driverDialog'), request = ++profileRequest;
  const known = knownDrivers.get(Number(id));
  $('driverDialogTitle').textContent = known?.name || 'Fahrerprofil';
  $('driverProfileBody').textContent = 'Profil wird geladen …';
  if (!dialog.open) dialog.showModal();
  if (!extensionReady) {
    $('driverProfileBody').replaceChildren(ui('p', '', known?.teamName ? 'Aktuelles Team: ' + known.teamName : 'Aktuell keinem Team zugeordnet.'), ui('p', 'muted', 'Die Transferhistorie ist derzeit nicht verfügbar.'));
    return;
  }
  try {
    const data = await apiRequest('/api/drivers/' + encodeURIComponent(id)+'?season='+encodeURIComponent($('statisticsSeason').value.trim()));
    if (request !== profileRequest) return;
    $('driverDialogTitle').textContent = data.driver.name+(Number.isInteger(data.driver.racingNumber)?' · #'+data.driver.racingNumber:'');
    $('driverProfileBody').replaceChildren(ui('p', 'profile-team', data.driver.teamName ? 'Aktuelles Team: ' + data.driver.teamName : 'Aktuell keinem Team zugeordnet.'));
    if(data.statistics)$('driverProfileBody').append(driverStatisticsSection(data));
    const numberInfo=ui('p','profile-racing-number',Number.isInteger(data.driver.racingNumber)?'Startnummer #'+data.driver.racingNumber:'Noch keine Startnummer gewählt.');$('driverProfileBody').prepend(numberInfo);
    $('driverProfileBody').append(ui('h3','','Bisherige Transfers'));
    $('driverProfileBody').append(data.transfers?.length ? transferRows(data.transfers) : ui('p', 'muted', 'Noch keine abgeschlossenen Transfers.'));
  } catch { if (request === profileRequest) $('driverProfileBody').textContent = 'Das Fahrerprofil konnte nicht geladen werden.'; }
}
function trackLeadingBid(a) {
  if (!a || (trackedLead && trackedLead.auctionId !== a.id)) trackedLead = null;
  if (!a || !myTeam || a.leadingTeamId == null) return;
  if (Number(a.leadingTeamId) === Number(myTeam.id)) {
    trackedLead = { auctionId: a.id, amount: Number(a.highestBid) };
  } else if (trackedLead?.auctionId === a.id && Number(a.highestBid) > trackedLead.amount) {
    const text = (a.leadingTeamName || 'Ein anderes Team') + ' hat dich bei ' + a.driverName + ' überboten: ' + format(a.highestBid) + ' Coins.';
    $('outbidAlert').textContent = text; $('outbidAlert').classList.remove('hidden');
    notice(text); trackedLead = null;
    authenticated && refreshBalance().catch(() => {});
  }
}
function bidHistory(a) {
 const section=ui('section','bid-history');section.append(ui('h4','','Gebotsverlauf'),ui('p','auction-history-note','Alle Beträge in Liga-Coins'));
 if(!Array.isArray(a.bids)){section.append(ui('p','muted','Der Gebotsverlauf ist derzeit nicht verfügbar.'));return section;}
 if(!a.bids.length){section.append(ui('p','muted','Noch keine Gebote. Das erste Gebot eröffnet das Duell.'));return section;}
 const list=ui('ol','bid-history-list');
 for(const [index,bid]of a.bids.entries()){
  const row=ui('li','bid-history-row'+(index===0?' is-leading':''));row.style.setProperty('--bid-color',auctionTeamColor(bid.teamName));
  const time=ui('time','muted',dateText(bid.createdAt));time.dateTime=bid.createdAt;
  row.append(ui('span','bid-team-name',bid.teamName),ui('strong','',format(bid.amount)),time);list.append(row);
 }
 section.append(list);if(a.bids.length===100)section.append(ui('p','muted','Die letzten 100 Gebote werden angezeigt.'));return section;
}
async function loadQueue() {
  if (!extensionReady || !isAdmin) return;
  try {
    const data = await apiRequest('/api/admin/queue');
    const select = $('queueDriver'), previous = select.value;
    select.replaceChildren(new Option('Fahrer auswählen', ''));
    for (const driver of drivers) select.add(new Option(driver.name, driver.id));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
    const list = $('queueList'); list.replaceChildren();
    for (const entry of data.queue || []) {
      const row = ui('li', 'queue-row');
      const cancel = ui('button', 'outline', 'Entfernen'); cancel.type = 'button';
      cancel.onclick = async () => {
        if (!confirm(entry.driverName + ' aus der Planung entfernen?')) return;
        cancel.disabled = true;
        try { await apiRequest('/api/admin/queue/' + entry.id + '/cancel', { method: 'POST' }); await loadQueue(); }
        catch (e) { notice(e.message); cancel.disabled = false; }
      };
      row.append(ui('strong', '', entry.driverName), ui('span', 'muted', dateText(entry.scheduledAt) + ' Uhr (Berlin)'), ui('span', '', format(entry.startingPrice) + ' Coins'), cancel);
      list.append(row);
    }
    if (!list.children.length) list.append(ui('li', 'muted', 'Keine Auktionen vorgemerkt.'));
  } catch { $('queueList').textContent = 'Die Planung konnte nicht geladen werden.'; }
}
$('planAuction').addEventListener('submit', async event => {
  event.preventDefault(); if (!isAdmin || !extensionReady) return;
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
  const when = new Date(form.elements.scheduledAt.value);
  if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) { notice('Bitte einen zukünftigen Termin wählen.'); return; }
  button.disabled = true;
  try {
    await apiRequest('/api/admin/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId: Number(form.elements.driverId.value), startingPrice: Number(form.elements.startingPrice.value), scheduledAt: when.toISOString() }) });
    notice('Auktion vorgemerkt.'); form.reset(); await loadQueue();
  } catch (e) { notice(e.message); }
  finally { button.disabled = false; }
});
$('closeDriver').addEventListener('click', () => { profileRequest++; $('driverDialog').close(); });
$('driverDialog').addEventListener('cancel', () => { profileRequest++; });
$('refreshTransfers').addEventListener('click', loadTransfers);
setInterval(() => { if (authenticated && extensionReady) { loadTransfers(); if (isAdmin) loadQueue(); } }, 30000);

let raceEnabled = false, raceOptions = { drivers: [], teams: [] }, raceLoadSequence = 0, raceOpenSequence = 0, raceSaving = false;
let raceEditor = null, racePoints = [25,18,15,12,10,8,6,4,2,1];
const raceStatusLabel = { classified: 'Klassifiziert', dnf: 'DNF', dns: 'DNS', dsq: 'DSQ' };
function raceDate(value) { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')); }
function resultTable(headers, rows, label) {
  const wrap = ui('div', 'race-table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role','region'); wrap.setAttribute('aria-label',label);
  const table = ui('table', 'race-table'), caption = ui('caption','sr-only',label), head=ui('thead',''), header=ui('tr',''), body=ui('tbody','');
  for (const text of headers) { const cell=ui('th','',text);cell.scope='col';header.append(cell); }
  head.append(header);
  for (const cells of rows) { const row=ui('tr','');for (const value of cells) { const cell=ui('td',''); if (value instanceof Node) cell.append(value);else cell.textContent=String(value);row.append(cell); }body.append(row); }
  table.append(caption,head,body);wrap.append(table);return wrap;
}
async function loadRaceArea() {
  const sequence=++raceLoadSequence;
  const season=$('raceSeason').value.trim(); if (!season || season.length>40) return;
  try {
    if (!raceEnabled) { const features=await apiRequest('/api/features');raceEnabled=features.raceResults === true; }
    if (sequence!==raceLoadSequence) return;
    $('raceCreateSection').classList.toggle('hidden',!isAdmin || !raceEnabled);
    if (!raceEnabled) { $('raceList').textContent='Noch keine Rennergebnisse verfügbar.';$('driverStandings').replaceChildren();$('teamStandings').replaceChildren();return; }
    if (isAdmin && !raceOptions.drivers.length) raceOptions=await apiRequest('/api/admin/races/options');
    const [data, standings]=await Promise.all([apiRequest((isAdmin?'/api/admin/races':'/api/races')+'?season='+encodeURIComponent(season)),apiRequest('/api/standings?season='+encodeURIComponent(season))]);
    if (sequence!==raceLoadSequence) return;
    racePoints=data.pointsSystem;
    $('raceFilter').hidden=!leagueState.season&&!data.seasons?.length;
    $('raceSeasons').replaceChildren(...(data.seasons||[]).map(value=>new Option(value,value)));
    $('raceList').replaceChildren();
    for (const race of data.races) {
      const row=ui('article','race-list-row'), info=ui('div','');
      info.append(ui('p','muted',raceDate(race.raceDate)+' · '+(race.status==='draft'?'Entwurf':'Veröffentlicht')),ui('h3','',race.name));
      const button=ui('button','outline',isAdmin?'Ergebnisse bearbeiten':'Ergebnisse ansehen');button.type='button';button.onclick=()=>openRace(race.id,isAdmin);
      row.append(info,button);$('raceList').append(row);
    }
    if (!data.races.length) $('raceList').append(ui('p','muted','Für diese Saison sind noch keine Rennen vorhanden.'));
    for (const [id,items,label] of [['driverStandings',standings.drivers,'Fahrerwertung'],['teamStandings',standings.teams,'Teamwertung']]) {
      $(id).replaceChildren(items.length?resultTable(['Platz',label==='Fahrerwertung'?'Fahrer':'Team','Punkte','Siege'],items.map(row=>[row.rank,row.name,row.points,row.wins]),label):ui('p','muted','Noch keine veröffentlichten Ergebnisse.'));
    }
  } catch (error) { if (sequence===raceLoadSequence) $('raceList').textContent='Die Rennergebnisse konnten nicht geladen werden. Bitte erneut versuchen.'; }
}
async function openRace(id, edit) {
  const sequence=++raceOpenSequence;
  $('raceDialogTitle').textContent=edit?'Rennergebnisse bearbeiten':'Rennergebnis';$('raceDialogBody').textContent='Rennen wird geladen …';$('raceEditorNotice').textContent='';
  if (!$('raceDialog').open) $('raceDialog').showModal();
  try {
    const data=await apiRequest((edit?'/api/admin/races/':'/api/races/')+id);
    if (sequence!==raceOpenSequence) return;
    if (edit) {
      raceEditor=data;racePoints=data.pointsSystem;
    $('raceFilter').hidden=!leagueState.season&&!data.seasons?.length;renderRaceEditor();
    } else {
      $('raceDialogTitle').textContent=data.race.name;
      $('raceDialogBody').replaceChildren(ui('p','muted',data.race.season+' · '+raceDate(data.race.raceDate)),resultTable(['Platz','Fahrer','Team','Status','Punkte'],data.results.map(row=>[row.position??'–',row.driverName,row.teamName||'Ohne Team',raceStatusLabel[row.status],row.points]),'Rennergebnis'));
    }
  } catch { if(sequence===raceOpenSequence)$('raceDialogBody').textContent='Das Rennen konnte nicht geladen werden.'; }
}
function raceField(labelText, control) { const label=ui('label','',labelText);label.append(control);return label; }
function raceInput(type,name,value) { const input=ui('input','');input.type=type;input.name=name;input.value=value;input.required=true;return input; }
function renderRaceEditor() {
  const {race,results}=raceEditor, form=ui('form','race-editor');form.id='raceEditorForm';
  const header=ui('div','race-editor-meta'), name=raceInput('text','raceName',race.name), season=raceInput('text','raceSeason',race.season), date=raceInput('date','raceDate',race.raceDate);
  name.maxLength=120;season.maxLength=40;
  header.append(raceField('Rennen',name),raceField('Saison / Meisterschaft',season),raceField('Renndatum',date));
  const calendarLabel=ui('label','calendar-checkbox'),calendarCheck=ui('input','');calendarCheck.type='checkbox';calendarCheck.name='calendarVisible';calendarCheck.checked=Boolean(race.calendarVisible);calendarLabel.append(calendarCheck,document.createTextNode('Renntermin vor Veröffentlichung der Ergebnisse im Kalender zeigen'));
  form.append(header,calendarLabel,ui('p','muted','Punkte: '+racePoints.join(' · ')+'. Keine Zusatzpunkte. DNF, DNS und DSQ: ohne Platz und ohne Punkte. Für gewertete Fahrer „Klassifiziert“ wählen. Das Team gilt für dieses Rennen.'));
  const wrap=resultTable(['Fahrer','Team im Rennen','Status','Platz','Punkte',''],[],'Ergebnisse bearbeiten; auf kleinen Displays seitlich scrollen');wrap.classList.add('race-editor-table');wrap.querySelector('tbody').id='raceEditorRows';form.append(wrap);
  const add=ui('button','outline','Fahrer hinzufügen');add.type='button';add.id='addRaceResult';add.onclick=()=>addRaceRow();
  const footer=ui('div','race-editor-actions'), draft=ui('button','outline',race.status==='published'?'Veröffentlichung zurücknehmen':'Entwurf speichern');draft.type='button';draft.id='saveRaceDraft';
  draft.onclick=()=>{ if(form.reportValidity())saveRace('draft'); };
  const publish=ui('button','',race.status==='published'?'Korrektur veröffentlichen':'Ergebnisse veröffentlichen');publish.type='submit';publish.id='publishRace';
  form.onsubmit=event=>{event.preventDefault();saveRace('published');};
  footer.append(draft,publish);form.append(add,footer);$('raceDialogBody').replaceChildren(form);
  for (const result of results) addRaceRow(result);
  if (!results.length) addRaceRow();
}
function addRaceRow(result) {
  const body=$('raceEditorRows');if(body.children.length>=60)return;
  const row=ui('tr','race-result-input');
  const driver=ui('select','race-driver');driver.required=true;driver.setAttribute('aria-label','Fahrer');driver.add(new Option('Fahrer auswählen',''));
  for (const item of raceOptions.drivers) driver.add(new Option(item.name+(item.active?'':' (inaktiv)'),item.id));
  const team=ui('select','race-team');team.setAttribute('aria-label','Team im Rennen');team.add(new Option('Ohne Team',''));for(const item of raceOptions.teams)team.add(new Option(item.name,item.id));
  const status=ui('select','race-result-status');status.setAttribute('aria-label','Ergebnisstatus');for(const [value,label]of Object.entries(raceStatusLabel))status.add(new Option(label,value));
  const position=ui('input','race-position');position.type='number';position.min='1';position.max='60';position.step='1';position.setAttribute('aria-label','Platzierung');
  const points=ui('output','race-points'),remove=ui('button','outline','Entfernen');remove.type='button';remove.setAttribute('aria-label','Ergebniszeile entfernen');remove.onclick=()=>row.remove();
  function update(){const classified=status.value==='classified';position.disabled=!classified;position.required=classified;if(!classified)position.value='';points.textContent=String(classified?(racePoints[Number(position.value)-1]||0):0);}
  driver.onchange=()=>{const item=raceOptions.drivers.find(item=>item.id===Number(driver.value));team.value=item?.teamId==null?'':String(item.teamId);};
  status.onchange=update;position.oninput=update;
  for(const control of [driver,team,status,position,points,remove]){const cell=ui('td','');cell.append(control);row.append(cell);}body.append(row);
  if(result){driver.value=String(result.driverId);team.value=result.teamId==null?'':String(result.teamId);status.value=result.status;position.value=result.position??'';}
  else{const used=new Set([...body.querySelectorAll('.race-position')].map(input=>Number(input.value)));let next=1;while(used.has(next))next++;position.value=String(next);}
  update();
}
async function saveRace(status) {
  if(raceSaving||!raceEditor)return;
  const form=$('raceEditorForm'),rows=[...$('raceEditorRows').children];
  const results=rows.map(row=>({driverId:Number(row.querySelector('.race-driver').value),teamId:row.querySelector('.race-team').value?Number(row.querySelector('.race-team').value):null,status:row.querySelector('.race-result-status').value,position:row.querySelector('.race-result-status').value==='classified'?Number(row.querySelector('.race-position').value):null}));
  if(status==='published'&&!results.length){$('raceEditorNotice').textContent='Bitte mindestens einen Fahrer eintragen.';return;}
  if(new Set(results.map(row=>row.driverId)).size!==results.length){$('raceEditorNotice').textContent='Jeden Fahrer nur einmal eintragen.';return;}
  const positions=results.filter(row=>row.position!==null).map(row=>row.position);
  if(new Set(positions).size!==positions.length){$('raceEditorNotice').textContent='Jeden Platz nur einmal vergeben.';return;}
  if(status==='published'&&!confirm('Diese Ergebnisse veröffentlichen und die Meisterschaftswertungen aktualisieren?'))return;
  if(status==='draft'&&raceEditor.race.status==='published'&&!confirm('Veröffentlichung zurücknehmen? Dieses Rennen zählt dann nicht mehr zur Wertung.'))return;
  const payload={name:form.elements.raceName.value,season:form.elements.raceSeason.value,raceDate:form.elements.raceDate.value,revision:raceEditor.race.revision,calendarVisible:form.elements.calendarVisible.checked,status,results};
  raceSaving=true;const controls=[...form.querySelectorAll('button,input,select')];const states=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);$('closeRaceDialog').disabled=true;$('raceEditorNotice').textContent='Wird gespeichert …';
  try{await apiRequest('/api/admin/races/'+raceEditor.race.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('raceSeason').value=payload.season.trim();$('raceDialog').close();raceOpenSequence++;navigateTo('rennergebnisse');await loadRaceArea();notice(status==='published'?'Rennergebnis veröffentlicht.':'Rennergebnis als Entwurf gespeichert.');}
  catch(error){$('raceEditorNotice').textContent=error.message;}
  finally{raceSaving=false;controls.forEach((e,i)=>e.disabled=states[i]);$('closeRaceDialog').disabled=false;}
}
$('raceSeason').value=String(new Date().getFullYear());$('newRaceSeason').value='';
$('raceFilter').onsubmit=event=>{event.preventDefault();loadRaceArea();};
$('createRace').onsubmit=async event=>{
  event.preventDefault();if(!isAdmin||!raceEnabled)return;
  const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('raceCreateNotice').textContent='';
  try{const result=await apiRequest('/api/admin/races',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.elements.raceName.value,season:form.elements.raceSeason.value,raceDate:form.elements.raceDate.value,calendarVisible:form.elements.calendarVisible.checked})});$('raceSeason').value=form.elements.raceSeason.value;form.elements.raceName.value='';await loadRaceArea();await openRace(result.id,true);}
  catch(error){$('raceCreateNotice').textContent=error.message;}finally{button.disabled=false;}
};
$('closeRaceDialog').onclick=()=>{if(!raceSaving){raceOpenSequence++;$('raceDialog').close();}};
$('raceDialog').addEventListener('cancel',event=>{if(raceSaving)event.preventDefault();else raceOpenSequence++;});

let dashboardSequence=0, dashboardAutoPicked=false, dashboardUserSelected=false;
function berlinToday() { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-'); }
function showNextRace(next,message) {
 $('heroRaceName').textContent=next?.name||'Weitere Termine folgen.';
 $('heroRaceDate').textContent=next?raceDate(next.raceDate):(message||'Aktuell ist kein weiteres Rennen angekündigt.');
 const countdown=$('heroRaceCountdown');countdown.hidden=!next;
 if(next){const days=Math.round((Date.parse(next.raceDate+'T00:00:00Z')-Date.parse(berlinToday()+'T00:00:00Z'))/86400000);
  countdown.textContent=days===0?'Heute ist Renntag':days===1?'Noch 1 Tag':'Noch '+days+' Tage';
 }
}
async function loadDashboard() {
  const sequence=++dashboardSequence,season=$('dashboardSeason').value.trim();if(!season||season.length>40)return;
  const [scores,dates]=await Promise.allSettled([apiRequest('/api/standings?season='+encodeURIComponent(season)),apiRequest('/api/calendar?season='+encodeURIComponent(season))]);
  if(sequence!==dashboardSequence)return;
  if(dates.status==='fulfilled') {
    const seasons=dates.value.seasons||[];
    $('dashboardSeasons').replaceChildren(...seasons.map(value=>new Option(value,value)));
    if(!dashboardAutoPicked&&!dashboardUserSelected&&seasons.length&&!seasons.includes(season)&&!dates.value.calendar?.length&&scores.status==='fulfilled'&&!scores.value.drivers?.length){
      dashboardAutoPicked=true;$('dashboardSeason').value=seasons.find(value=>value.startsWith(berlinToday().slice(0,4)))||seasons[0];return loadDashboard();
    }
  }
  if(scores.status==='fulfilled') {
    for(const [id,items,label]of[['dashboardDrivers',scores.value.drivers||[],'Fahrerwertung'],['dashboardTeams',scores.value.teams||[],'Teamwertung']]){
      $(id).replaceChildren(items.length?resultTable(['Platz',label==='Fahrerwertung'?'Fahrer':'Team','Punkte','Siege'],items.map(row=>[row.rank,row.name,row.points,row.wins]),label):ui('p','muted','Noch keine gewerteten Rennergebnisse für diese Saison.'));
    }
  }else{for(const id of['dashboardDrivers','dashboardTeams'])$(id).replaceChildren(ui('p','muted','Die Wertung konnte nicht geladen werden. Bitte erneut versuchen.'));}
  const container=$('dashboardCalendar');$('dashboardNextRace').hidden=true;
  if(dates.status==='rejected'){showNextRace(null,'Der Rennkalender konnte nicht geladen werden.');container.replaceChildren(ui('p','muted','Der Rennkalender konnte nicht geladen werden. Bitte erneut versuchen.'));return;}
  const calendar=dates.value.calendar||[],today=berlinToday();container.replaceChildren();
  if(!calendar.length){showNextRace(null,'Der Kalender wird von der Ligaleitung veröffentlicht.');container.append(ui('p','muted','Noch keine Renntermine für diese Saison veröffentlicht.'));return;}
  const next=[...calendar].sort((a,b)=>a.raceDate.localeCompare(b.raceDate)||a.id-b.id).find(race=>race.status==='planned'&&race.raceDate>=today);
  showNextRace(next);
  if(next){$('dashboardNextRace').textContent='Nächstes Rennen: '+next.name+' · '+raceDate(next.raceDate);$('dashboardNextRace').hidden=false;}
  const list=ui('ol','calendar-list');
  for(const race of calendar){
    const row=ui('li','calendar-entry'+(race.id===next?.id?' calendar-entry-next':''));
    const date=ui('time','calendar-date');date.dateTime=race.raceDate;
    date.append(ui('strong','',race.raceDate.slice(8,10)),ui('span','',new Intl.DateTimeFormat('de-DE',{month:'short',timeZone:'UTC'}).format(new Date(race.raceDate+'T00:00:00Z'))));
    const text=ui('div','calendar-race');text.append(ui('h3','',race.name),ui('p','muted',raceDate(race.raceDate)));
    const status=ui('span','calendar-status',race.status==='published'?'Ergebnis veröffentlicht':race.raceDate<today?'Ergebnis ausstehend':'Geplant');
    row.append(date,text,status);list.append(row);
  }
  container.append(list);
}
$('dashboardSeason').value=berlinToday().slice(0,4);
$('dashboardFilter').addEventListener('submit',event=>{event.preventDefault();dashboardUserSelected=true;loadDashboard();});
setInterval(()=>{if(!document.hidden&&(authenticated||guestMode)&&['start','kalender'].includes(currentViewRoute()))loadDashboard();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(authenticated||guestMode)&&['start','kalender'].includes(currentViewRoute()))loadDashboard();});

let statisticsSequence=0,statisticsAutoPicked=false,statisticsUserSelected=false;
let comparisonSequence=0,comparisonSeason=null;
function svgElement(tag,attributes={},text=null){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));
 if(text!==null)node.textContent=String(text);return node;
}
function championshipChart(series) {
 const raceMap=new Map();for(const entry of series)for(const row of entry.rows)raceMap.set(row.raceId,row);
 const timeline=[...raceMap.values()].sort((a,b)=>a.raceDate.localeCompare(b.raceDate)||a.raceId-b.raceId);
 series=series.map(entry=>{const byId=new Map(entry.rows.map(row=>[row.raceId,row]));return {...entry,rows:timeline.map(race=>byId.get(race.raceId)||{...race,points:null,rank:null})};});
 const section=ui('section','wm-chart'),header=ui('div','wm-chart-header');header.append(ui('h4','','WM-Verlauf'));
 const controls=ui('div','wm-chart-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Kennzahl für den WM-Verlauf');
 const plot=ui('div','wm-chart-plot'),readout=ui('p','wm-chart-readout','Punkt im Diagramm berühren oder mit Tab auswählen.'),legend=ui('div','wm-chart-legend');
 series.forEach((entry,i)=>{const label=ui('span','wm-series-'+i,entry.name);legend.append(label);});
 const pointsButton=ui('button','outline','Punkte'),rankButton=ui('button','outline','WM-Platz');pointsButton.type=rankButton.type='button';controls.append(pointsButton,rankButton);header.append(controls);section.append(header,legend,plot,readout);
 const races=series[0]?.rows||[];
 if(!races.length){section.replaceChildren(ui('h4','','WM-Verlauf'),ui('p','stats-empty','Der WM-Verlauf erscheint nach dem ersten veröffentlichten Rennen dieser Saison.'));return section;}
 const tableDetails=ui('details','wm-chart-data');tableDetails.append(ui('summary','','Werte als Tabelle anzeigen'));
 tableDetails.append(resultTable(['Rennen',...series.flatMap(s=>[s.name+' · Punkte',s.name+' · WM-Platz'])],races.map((race,i)=>[race.raceName,...series.flatMap(s=>[s.rows[i]?.points??'–',s.rows[i]?.rank==null?'–':'P'+s.rows[i].rank])]),'WM-Verlauf nach veröffentlichten Rennen'));
 section.append(ui('p','stats-note','Stand nach jedem veröffentlichten Rennen, inklusive Gleichständen und Platzierungsvergleich. Ohne Rennteilnahme bleiben die Punkte bestehen; der WM-Platz kann sich ändern.'),tableDetails);
 function draw(metric){
  pointsButton.setAttribute('aria-pressed',String(metric==='points'));rankButton.setAttribute('aria-pressed',String(metric==='rank'));
  const width=760,height=240,left=42,right=18,top=20,bottom=37,values=series.flatMap(s=>s.rows.map(row=>row[metric])).filter(v=>v!==null&&Number.isFinite(v));
  if(!values.length){plot.replaceChildren(ui('p','stats-empty','Für diese Fahrer gibt es noch keinen WM-Platz in dieser Saison.'));readout.textContent='Ein WM-Platz entsteht mit dem ersten veröffentlichten Ergebnis.';return;}
  const max=metric==='rank'?Math.max(2,...values):Math.max(1,...values),min=metric==='rank'?1:0;
  const x=i=>left+(races.length===1?(width-left-right)/2:i*(width-left-right)/(races.length-1));
  const y=value=>metric==='rank'?top+(value-min)/(max-min)*(height-top-bottom):height-bottom-(value-min)/(max-min)*(height-top-bottom);
  const svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':metric==='rank'?'WM-Platz nach Rennen; Platz 1 ist oben':'Gesamtpunkte nach Rennen'});
  const ticks=[...new Set(Array.from({length:5},(_,i)=>Math.round(min+(max-min)*i/4)))];
  for(const tick of ticks){svg.append(svgElement('line',{x1:left,x2:width-right,y1:y(tick),y2:y(tick),class:'wm-gridline'}),svgElement('text',{x:left-10,y:y(tick)+4,'text-anchor':'end',class:'wm-axis'},metric==='rank'?'P'+tick:tick));}
  const step=Math.max(1,Math.ceil(races.length/7));
  races.forEach((race,i)=>{if(i%step===0||i===races.length-1)svg.append(svgElement('text',{x:x(i),y:height-12,'text-anchor':'middle',class:'wm-axis'},'R'+(i+1)));});
  series.forEach((entry,seriesIndex)=>{
   let path='';let connected=false;
   entry.rows.forEach((row,i)=>{const value=row[metric];if(value===null||!Number.isFinite(value)){connected=false;return;}path+=(connected?' L':' M')+x(i)+' '+y(value);connected=true;});
   svg.append(svgElement('path',{d:path,class:'wm-line wm-series-'+seriesIndex,fill:'none'}));
   entry.rows.forEach((row,i)=>{const value=row[metric];if(value===null||!Number.isFinite(value))return;
    const text=entry.name+' · '+row.raceName+' · '+raceDate(row.raceDate)+' · '+(metric==='rank'?'WM-Platz '+value:value+' Punkte');
    const dot=svgElement('circle',{cx:x(i),cy:y(value),r:5,class:'wm-dot wm-series-'+seriesIndex,tabindex:0,role:'img','aria-label':text});dot.append(svgElement('title',{},text));
    for(const event of ['mouseenter','focus','touchstart'])dot.addEventListener(event,()=>{readout.textContent=text;});svg.append(dot);
   });
  });
  plot.replaceChildren(svg);readout.textContent='Punkt im Diagramm berühren oder mit Tab auswählen.';
 }
 pointsButton.onclick=()=>draw('points');rankButton.onclick=()=>draw('rank');draw('points');return section;
}
function prepareDriverComparison(list){
 const choices=[...list].sort((a,b)=>a.name.localeCompare(b.name,'de')),first=$('comparisonFirst'),second=$('comparisonSecond'),oldFirst=first.value,oldSecond=second.value;
 for(const select of [first,second])select.replaceChildren(new Option('Fahrer auswählen',''),...choices.map(d=>new Option(d.name+(Number.isInteger(d.racingNumber)?' · #'+d.racingNumber:''),String(d.id))));
 first.value=choices.some(d=>String(d.id)===oldFirst)?oldFirst:String(choices.find(d=>d.id===memberDriver?.id)?.id||choices[0]?.id||'');
 second.value=choices.some(d=>String(d.id)===oldSecond)&&oldSecond!==first.value?oldSecond:String(choices.find(d=>String(d.id)!==first.value)?.id||'');
 if(oldFirst!==first.value||oldSecond!==second.value){++comparisonSequence;$('comparisonResult').replaceChildren();}
 $('comparisonForm').querySelector('button').disabled=choices.length<2;
 $('comparisonNotice').textContent=choices.length<2?'Für einen Vergleich werden mindestens zwei aktive Fahrer benötigt.':'';
}
function comparisonView(first,second){
 const fragment=document.createDocumentFragment(),names=[first.driver.name,second.driver.name],table=ui('div','comparison-metrics');
 const rows=[['Punkte','points',false],['Rennstarts','starts',false],['Siege','wins',false],['Podien','podiums',false],['WM-Platz','rank',true],['Bestes Ergebnis','bestFinish',true],['Ø gewertete Platzierung','averageFinish',true],['Ausfälle','retirements',true]];
 const heading=ui('div','comparison-metric comparison-names');heading.append(ui('span','','Saisonwerte'),...names.map((name,i)=>ui('strong','wm-series-'+i,name)));table.append(heading);
 for(const [label,key,lower]of rows){const row=ui('div','comparison-metric'),a=first.statistics[key],b=second.statistics[key];row.append(ui('span','',label));
  [a,b].forEach((value,i)=>{const best=a!==null&&b!==null&&a!==b&&(lower?value===Math.min(a,b):value===Math.max(a,b));row.append(ui('strong',best?'comparison-better':'',value===null?'–':format(value)));});table.append(row);
 }
 fragment.append(table,ui('p','stats-note','Hervorgehobene Werte zeigen den besseren Saisonwert; unterschiedliche Anzahlen an Rennstarts sind möglich.'));
 fragment.append(championshipChart([{name:names[0],rows:first.progression||[]},{name:names[1],rows:second.progression||[]}]));
 const secondRaces=new Map((second.progression||[]).map(row=>[row.raceId,row]));
 const common=(first.progression||[]).filter(row=>row.participated&&secondRaces.get(row.raceId)?.participated);
 const classified=common.filter(row=>row.status==='classified'&&secondRaces.get(row.raceId).status==='classified');
 const wins=classified.filter(row=>row.position<secondRaces.get(row.raceId).position).length,losses=classified.filter(row=>row.position>secondRaces.get(row.raceId).position).length;
 const duel=ui('section','comparison-duel');duel.append(ui('h4','','Direktduell'),ui('p','',names[0]+' '+wins+' : '+losses+' '+names[1]),ui('p','stats-note',classified.length+' gemeinsam gewertete Rennen · Nur Rennen, in denen beide klassifiziert wurden. Ausfälle, Nichtstarts und Disqualifikationen zählen nicht als Duellsieg.'));
 if(common.length)duel.append(resultTable(['Gemeinsames Rennen',names[0],names[1]],common.map(row=>[row.raceName,...[row,secondRaces.get(row.raceId)].map(r=>r.status==='classified'?'P'+r.position:raceStatusLabel[r.status]||'–')]),'Ergebnisse bei gemeinsamen Rennteilnahmen'));
 else duel.append(ui('p','stats-empty','Noch keine gemeinsamen Rennergebnisse in dieser Saison.'));
 fragment.append(duel);return fragment;
}
async function loadDriverComparison(){
 if(!authenticated)return;
 const a=$('comparisonFirst').value,b=$('comparisonSecond').value,sequence=++comparisonSequence,season=$('statisticsSeason').value.trim();
 if(!a||!b||a===b){$('comparisonNotice').textContent='Bitte wähle zwei unterschiedliche Fahrer.';return;}
 $('comparisonResult').replaceChildren();$('comparisonNotice').textContent='Vergleich wird geladen …';
 try{
  const data=await Promise.all([a,b].map(id=>apiRequest('/api/drivers/'+encodeURIComponent(id)+'?season='+encodeURIComponent(season))));
  if(sequence!==comparisonSequence||!authenticated)return;
  $('comparisonResult').replaceChildren(comparisonView(...data));$('comparisonNotice').textContent='Vergleich für Saison '+season;
 }catch{if(sequence===comparisonSequence)$('comparisonNotice').textContent='Der Vergleich konnte nicht geladen werden. Bitte erneut versuchen.';}
}
$('comparisonForm').addEventListener('submit',event=>{event.preventDefault();loadDriverComparison();});
for(const id of ['comparisonFirst','comparisonSecond'])$(id).addEventListener('change',()=>{++comparisonSequence;$('comparisonResult').replaceChildren();$('comparisonNotice').textContent='Auswahl geändert. Klicke auf Vergleichen.';});

function statisticCells(values,className) {
 const grid=ui('dl',className);
 for(const [label,value]of values){const cell=ui('div','driver-stat');cell.append(ui('dt','',label),ui('dd','',String(value)));grid.append(cell);}
 return grid;
}
function statisticsGrid(s) {
 return statisticCells([['Punkte',s.points],['Rennstarts',s.starts],['Siege',s.wins],['Podien',s.podiums]],'driver-stat-grid');
}
function statisticsDetails(s) {
 const section=ui('div','stats-details');
 section.append(statisticCells([['WM-Platz',s.rank==null?'–':'P'+s.rank],['Bestes Ergebnis',s.bestFinish==null?'–':'P'+s.bestFinish],['Ø Platzierung',s.averageFinish==null?'–':format(s.averageFinish)],['Top-10-Ergebnisse',s.top10]],'stats-detail-grid'));
 const statuses=ui('p','stats-statuses');
 for(const [label,value]of[['Ausfälle',s.retirements],['Nicht gestartet',s.dns],['Disqualifikationen',s.disqualifications]]){const item=ui('span','');item.append(ui('strong','',String(value)),document.createTextNode(' '+label));statuses.append(item);}
 section.append(statuses,ui('p','stats-note','Ø Platzierung berücksichtigt nur gewertete Ergebnisse.'));return section;
}
function driverRaceList(rows) {
 const list=ui('ol','stats-race-list');
 for(const row of rows){
  const item=ui('li','stats-race-row'),classified=row.status==='classified'&&Number.isInteger(row.position);
  const result=ui('span','stats-finish'+(classified&&row.position<=3?' stats-finish-podium':''),classified?'P'+row.position:raceStatusLabel[row.status]||'–');
  const race=ui('div','stats-race-name');race.append(ui('h4','',row.raceName),ui('p','',raceDate(row.raceDate)+' · '+(row.teamName||'Ohne Team')));
  const points=ui('div','stats-race-points');points.append(ui('strong','',String(row.points)),ui('span','','Punkte'));
  item.append(result,race,points);list.append(item);
 }
 return list;
}
function driverStatisticsSection(data) {
 const section=ui('section','driver-statistics');section.append(ui('h3','','Saison '+data.season),statisticsGrid(data.statistics),statisticsDetails(data.statistics));
 section.append(championshipChart([{name:data.driver.name,rows:data.progression||[]}]),ui('h3','','Rennergebnisse'));
 section.append(data.raceResults?.length?driverRaceList(data.raceResults):ui('p','stats-empty','Noch keine veröffentlichten Rennergebnisse in dieser Saison.'));
 if(data.raceResults?.length===50)section.append(ui('p','stats-note','Die letzten 50 Ergebnisse werden angezeigt; die Statistik zählt alle veröffentlichten Rennen dieser Saison.'));
 return section;
}
function personalStatistics(data,season) {
 const keepRank=$('ownStatistics').querySelector('.wm-chart-controls button:last-child')?.getAttribute('aria-pressed')==='true';
 const driver=data.driver,section=$('ownStatistics'),header=ui('div','stats-personal-header'),identity=ui('div','stats-identity');
 identity.append(ui('p','stats-eyebrow','Deine Saison · '+season),ui('h3','',driver.name),ui('p','stats-team',driver.teamName||'Aktuell ohne Team'));
 const number=ui('span','stats-number',Number.isInteger(driver.racingNumber)?'#'+driver.racingNumber:'–');number.setAttribute('aria-label',Number.isInteger(driver.racingNumber)?'Startnummer '+driver.racingNumber:'Keine Startnummer gewählt');
 header.append(identity,number);
 const results=ui('section','stats-recent'),heading=ui('div','stats-recent-heading');heading.append(ui('h4','','Deine letzten Rennen'),ui('span','stats-note','Neueste zuerst'));results.append(heading);
 results.append(data.raceResults?.length?driverRaceList(data.raceResults.slice(0,5)):ui('p','stats-empty','Deine Saison beginnt hier. Sobald ein Rennergebnis veröffentlicht ist, erscheinen deine Werte und Ergebnisse automatisch.'));
 const button=ui('button','outline','Vollständiges Fahrerprofil');button.type='button';button.onclick=()=>openDriverProfile(driver.id);
 const footer=ui('div','stats-personal-footer');footer.append(ui('p','stats-note','Nur veröffentlichte Ergebnisse · '+season),button);
 section.replaceChildren(header,statisticsGrid(data.statistics),statisticsDetails(data.statistics),championshipChart([{name:driver.name,rows:data.progression||[]}]),results,footer);
 if(keepRank)section.querySelector('.wm-chart-controls button:last-child')?.click();
}
async function loadDriverStatistics() {
 if(!authenticated)return;
 const sequence=++statisticsSequence,season=$('statisticsSeason').value.trim();if(!season||season.length>40)return;
 if(comparisonSeason!==season){++comparisonSequence;comparisonSeason=season;$('comparisonResult').replaceChildren();$('comparisonNotice').textContent='';}
 try{
  const data=await apiRequest('/api/driver-stats?season='+encodeURIComponent(season));if(sequence!==statisticsSequence)return;
  extensionReady=true;const list=data.drivers||[],seasons=data.seasons||[];
  $('statisticsFilter').hidden=!leagueState.season&&!seasons.length;
  if(!statisticsAutoPicked&&!statisticsUserSelected&&seasons.length&&!seasons.includes(season)&&list.every(row=>!row.statistics.entries)){statisticsAutoPicked=true;$('statisticsSeason').value=seasons.find(s=>s.startsWith(berlinToday().slice(0,4)))||seasons[0];return loadDriverStatistics();}
  $('statisticsSeasons').replaceChildren(...seasons.map(s=>new Option(s,s)));
  for(const driver of list)knownDrivers.set(Number(driver.id),driver);
  prepareDriverComparison(list);
  if($('comparisonResult').hasChildNodes())await loadDriverComparison();
  if(sequence!==statisticsSequence)return;
  const ordered=[...list].sort((a,b)=>(a.statistics.rank??Infinity)-(b.statistics.rank??Infinity)||a.name.localeCompare(b.name,'de'));
  $('statisticsList').replaceChildren(ordered.length?resultTable(['Fahrer','Aktuelles Team','Starts','Punkte','Siege','Podien','Beste Platzierung'],ordered.map(row=>[profileLink(row),row.teamName||'Ohne Team',row.statistics.starts,row.statistics.points,row.statistics.wins,row.statistics.podiums,row.statistics.bestFinish??'–']),'Fahrerstatistiken; auf kleinen Displays seitlich scrollen'):ui('p','muted','Noch keine Fahrer erfasst.'));
  $('ownStatistics').hidden=!authenticated||!memberDriver;
  $('driverLinkHint').hidden=!authenticated||Boolean(memberDriver);
  if(authenticated&&memberDriver){
   const driverId=memberDriver.id;
   try{
    const detail=await apiRequest('/api/drivers/'+encodeURIComponent(driverId)+'?season='+encodeURIComponent(season));
    if(sequence!==statisticsSequence||!authenticated||memberDriver?.id!==driverId)return;
    personalStatistics(detail,season);
   }catch{
    if(sequence!==statisticsSequence)return;
    $('ownStatistics').replaceChildren(ui('p','stats-empty','Deine persönlichen Statistiken konnten nicht geladen werden. Bitte versuche es erneut.'));
   }
  }
 }catch{if(sequence===statisticsSequence)$('statisticsList').textContent='Die Fahrerstatistiken konnten nicht geladen werden. Bitte erneut versuchen.';}
}
$('statisticsSeason').value=berlinToday().slice(0,4);
$('statisticsFilter').addEventListener('submit',event=>{event.preventDefault();statisticsUserSelected=true;loadDriverStatistics();});
let leagueState={season:null},leagueRevision=1,editingContent=null,leagueContent=[];
async function loadLeague(){
 try{
  const data=await apiRequest('/api/league');leagueState=data;
  $('leagueSeasonLabel').textContent=data.season||'Noch offen';
  if(data.season){for(const id of ['dashboardSeason','raceSeason','statisticsSeason','newRaceSeason'])$(id).value=data.season;}
  else $('newRaceSeason').value='';
  $('dashboardFilter').hidden=!data.season;
  const news=$('leagueNews');news.replaceChildren();
  for(const item of data.news||[]){const article=ui('article','');article.append(ui('p','eyebrow',dateText(item.publishedAt)),ui('h3','',item.title),ui('p','content-text',item.body));news.append(article);}
  if(!news.childElementCount)news.append(ui('p','muted','Neuigkeiten der Ligaleitung erscheinen hier, sobald sie veröffentlicht sind.'));
  if(data.rules)$('leagueRules').replaceChildren(ui('h2','',data.rules.title),ui('p','content-text',data.rules.body));
  else $('leagueRules').replaceChildren(ui('h2','','Regelwerk'),ui('p','muted','Das Regelwerk wurde noch nicht veröffentlicht.'));
 }catch{$('leagueNews').textContent='Liga-Inhalte konnten nicht geladen werden. Bitte die Seite erneut laden.';}
}
async function loadNumberRules(){
 if(!authenticated)return;
 try{const data=await apiRequest('/api/racing-number-rules');$('numberRules').textContent='Gesperrte F1-Nummern (Saison '+[...new Set(data.reserved.map(row=>row.season))].join(', ')+'): '+data.reserved.map(row=>'#'+row.number+' ('+row.driverName+')').join(', ')+'.';}catch{$('numberRules').textContent='Die Sperrliste konnte nicht geladen werden. Der Bot prüft jede Nummer vor der Vergabe.';}
}
async function loadNumberSyncStatus(){
 if(!isAdmin)return;
 try{const data=await apiRequest('/api/admin/number-sync');$('numberSyncStatus').textContent=!data.configured?'Startnummern-Kanal noch nicht eingerichtet.':data.status?.lastError?'Startnummern: '+data.status.lastError:data.status?.lastCheckedAt?'Startnummern zuletzt geprüft: '+dateText(data.status.lastCheckedAt)+(data.pendingReplies?' · Antworten ausstehend: '+data.pendingReplies:''):'Startnummern: erster Abruf steht noch aus.';}catch{$('numberSyncStatus').textContent='Der Startnummern-Status konnte nicht geladen werden.';}
}
async function loadLeagueAdmin(){
 if(!isAdmin)return;
 loadNumberSyncStatus();
 try{const data=await apiRequest('/api/admin/league');leagueRevision=data.settings.revision;$('leagueSeasonInput').value=data.settings.season||'';leagueContent=data.content||[];
 $('contentList').replaceChildren();for(const item of leagueContent){const button=ui('button','outline',item.title+' · '+(item.status==='published'?'Veröffentlicht':'Entwurf'));button.type='button';button.onclick=()=>editLeagueContent(item);$('contentList').append(button);}
 }catch(error){$('leagueAdminNotice').textContent=error.message;}
}
function editLeagueContent(item=null){editingContent=item;$('contentKind').value=item?.kind||'news';$('contentKind').disabled=Boolean(item);$('contentTitle').value=item?.title||'';$('contentBody').value=item?.body||'';$('contentStatus').value=item?.status||'draft';$('leagueAdminNotice').textContent='';}
$('newContent').onclick=()=>editLeagueContent();
$('leagueSeasonForm').onsubmit=async event=>{event.preventDefault();if(!isAdmin)return;const button=event.currentTarget.querySelector('button');button.disabled=true;try{await apiRequest('/api/admin/league/season',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({season:$('leagueSeasonInput').value.trim()||null,revision:leagueRevision})});await loadLeagueAdmin();await loadLeague();await loadDashboard();$('leagueAdminNotice').textContent='Saison gespeichert.';}catch(error){$('leagueAdminNotice').textContent=error.message;}finally{button.disabled=false;}};
$('leagueContentForm').onsubmit=async event=>{event.preventDefault();if(!isAdmin)return;const body={kind:$('contentKind').value,title:$('contentTitle').value,body:$('contentBody').value,status:$('contentStatus').value,...(editingContent?{revision:editingContent.revision}:{})};
 if((body.status==='published'||editingContent?.status==='published')&&!confirm(body.status==='published'?'Diesen Inhalt öffentlich veröffentlichen?':'Diesen Inhalt von der öffentlichen Website zurückziehen?'))return;
 const button=event.currentTarget.querySelector('button');button.disabled=true;try{await apiRequest('/api/admin/league/content'+(editingContent?'/'+editingContent.id:''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await loadLeagueAdmin();await loadLeague();editLeagueContent();$('leagueAdminNotice').textContent='Inhalt gespeichert.';}catch(error){$('leagueAdminNotice').textContent=error.message;}finally{button.disabled=false;}};
const viewRoutes={
 livestream:{label:'Livestream',section:'stream'},
 start:{label:'Startseite',section:'dashboard'},anmeldung:{label:'Anmeldung',section:null},
 kalender:{label:'Rennkalender',section:'calendar'},liga:{label:'Die Liga',section:'league'},
 fahrerbereich:{label:'Fahrerbereich',section:'driver',protected:true},
 auktionen:{label:'Live-Auktionen',section:'auctions',protected:true},
 rennergebnisse:{label:'Rennergebnisse',section:'results'},teams:{label:'Teams & Fahrer',section:'teams'},
 fahrerstatistiken:{label:'Fahrerstatistiken',section:'statistics',protected:true},administration:{label:'Verwaltung',section:'admin',protected:true}
};
const viewAliases={dashboard:'start','auction-section':'auktionen','results-section':'rennergebnisse','team-section':'teams',admin:'administration'};
function currentViewRoute(){const hash=location.hash.slice(1)||loginReturnView||'start';return viewRoutes[hash]?hash:viewAliases[hash]||'start';}
function navigateTo(route){if(!viewRoutes[route])return;if(location.hash==='#'+route)applyView(true);else location.hash=route;}
function requestDriverLogin(route='fahrerbereich'){sessionStorage.setItem('f1_return_view',route);navigateTo('anmeldung');}
function updateLoginChoice(){const checking=Boolean(token)&&!authenticated;$('entryScreen').hidden=currentViewRoute()!=='anmeldung';$('loginChoice').hidden=false;$('guest').classList.remove('hidden');$('login').classList.remove('hidden');$('guestSession').hidden=true;$('login').disabled=checking;$('guestContinue').disabled=checking;$('accountActions').hidden=!authenticated;}

$('guestContinue').onclick=()=>{guestMode=true;sessionStorage.setItem(GUEST_MODE_KEY,'1');navigateTo('start');loadLeague().then(loadDashboard);};
$('returnToLogin').onclick=()=>navigateTo('anmeldung');
$('menuToggle').onclick=()=>{const open=document.querySelector('.sidebar').classList.toggle('menu-open');$('menuToggle').setAttribute('aria-expanded',String(open));};
const CONSENT_KEY='vtr_privacy_preferences_v1',CONSENT_AGE=180*24*60*60*1000;
let consentChoice=null,twitchConsent=false,analyticsConsent=false,analyticsLoaded=false;
function readConsent(){try{const value=JSON.parse(localStorage.getItem(CONSENT_KEY)||'null');if(value?.version===2&&typeof value.twitch==='boolean'&&typeof value.analytics==='boolean'&&Number.isFinite(value.updatedAt)&&Date.now()-value.updatedAt>=0&&Date.now()-value.updatedAt<CONSENT_AGE)return value;localStorage.removeItem(CONSENT_KEY);}catch{}return null;}
function stopTwitchPlayer(){
 $('twitchPlayer').removeAttribute('src');$('twitchFrame').hidden=true;$('twitchConsentPanel').hidden=false;$('twitchRevoke').hidden=true;
}
function loadTwitchPlayer(){
 if((!authenticated&&!guestMode)||!twitchConsent)return;
 const frame=$('twitchPlayer');if(!frame||frame.getAttribute('src'))return;
 const parent=location.hostname;if(!['juligg1506.github.io','racingleague.online','www.racingleague.online'].includes(parent))return;
 const url=new URL('https://player.twitch.tv/');url.search=new URLSearchParams({channel:'vdr_julian',parent,autoplay:'false',muted:'true'}).toString();frame.src=url.href;
 $('twitchConsentPanel').hidden=true;$('twitchFrame').hidden=false;$('twitchRevoke').hidden=false;
}
function resetTwitchConsent(){stopTwitchPlayer();}
function loadVisitorAnalytics(){
 if(analyticsLoaded||!analyticsConsent||!['racingleague.online','www.racingleague.online'].includes(location.hostname))return;
 analyticsLoaded=true;const script=document.createElement('script');script.id='visitorAnalytics';script.async=true;script.src='https://static.cloudflareinsights.com/beacon.min.js';script.setAttribute('data-cf-beacon',JSON.stringify({token:'fa6f9e129e874601a91db8398b896ca1'}));document.head.append(script);
}
function applyConsent(value){
 consentChoice=value;twitchConsent=Boolean(value?.twitch);analyticsConsent=Boolean(value?.analytics);$('cookieTwitch').checked=twitchConsent;$('cookieAnalytics').checked=analyticsConsent;
 stopTwitchPlayer();if(twitchConsent&&(authenticated||guestMode)&&currentViewRoute()==='livestream')loadTwitchPlayer();
 if(analyticsConsent)loadVisitorAnalytics();else if(analyticsLoaded)location.reload();
}
function saveConsent(twitch,analytics=analyticsConsent){
 const value={version:2,twitch,analytics,updatedAt:Date.now()};let saved=true;
 try{localStorage.setItem(CONSENT_KEY,JSON.stringify(value));}catch{saved=false;}
 applyConsent(value);$('cookieBanner').hidden=true;$('cookieStatus').textContent=saved?'Deine Datenschutzauswahl wurde gespeichert.':'Die Auswahl gilt für diesen Seitenbesuch. Dein Browser erlaubt keine dauerhafte Speicherung.';
}
function openCookieSettings(){const details=$('cookieDetails');$('cookieBanner').hidden=false;details.open=true;$('cookieTwitch').checked=twitchConsent;$('cookieAnalytics').checked=analyticsConsent;$('cookieHeading').focus();}
$('cookieAcceptAll').onclick=()=>saveConsent(true,true);
$('cookieNecessary').onclick=()=>saveConsent(false,false);
$('cookieSave').onclick=()=>saveConsent($('cookieTwitch').checked,$('cookieAnalytics').checked);
$('cookieSettings').onclick=openCookieSettings;
$('twitchDecline').onclick=()=>{saveConsent(false);$('twitchChoiceStatus').textContent='Twitch bleibt gesperrt. Es wird kein Player geladen.';};
$('twitchAccept').onclick=()=>{$('twitchChoiceStatus').textContent='';saveConsent(true);};
$('twitchRevoke').onclick=()=>{saveConsent(false);$('twitchAccept').focus();};
window.addEventListener('storage',event=>{if(event.key===CONSENT_KEY||event.key===null){const value=readConsent();applyConsent(value);$('cookieBanner').hidden=Boolean(value);}});
applyConsent(readConsent());$('cookieBanner').hidden=Boolean(consentChoice);
setInterval(()=>{if(consentChoice&&Date.now()-consentChoice.updatedAt>=CONSENT_AGE){try{localStorage.removeItem(CONSENT_KEY);}catch{}applyConsent(null);$('cookieBanner').hidden=false;}},60000);
function applyView(moveFocus=false){
 let route=currentViewRoute();const entered=authenticated||guestMode;
 if(!entered||(viewRoutes[route].protected&&!authenticated)){if(route!=='anmeldung')sessionStorage.setItem('f1_return_view',route);route='anmeldung';}
 else if(route==='anmeldung'){const target=loginReturnView||sessionStorage.getItem('f1_return_view');route=viewRoutes[target]&&target!=='anmeldung'?target:'start';sessionStorage.removeItem('f1_return_view');}
 if(route==='administration'&&!isAdmin)route='start';
 if(location.hash!=='#'+route)history.replaceState(null,'',location.pathname+location.search+'#'+route);
 if(authenticated)loginReturnView=null;const view=viewRoutes[route];document.body.classList.toggle('landing-mode',!entered||route==='anmeldung');$('app').classList.toggle('hidden',!entered);
 for(const panel of document.querySelectorAll('[data-page-view]'))panel.hidden=!entered||panel.dataset.pageView!==view.section||(panel.hasAttribute('data-auth-only')&&!authenticated);
 for(const link of document.querySelectorAll('[data-view-link]')){const key=link.dataset.viewLink;link.hidden=!entered||(['fahrerstatistiken','auktionen'].includes(key)&&!authenticated)||(key==='administration'&&!isAdmin);const active=key===route;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 document.querySelector('.top-heading').textContent=view.label;document.title=view.label+' | Virtual Tier Racing';
 document.querySelector('.sidebar').classList.remove('menu-open');$('menuToggle').setAttribute('aria-expanded','false');updateLoginChoice();
 if(route==='fahrerbereich'&&authenticated)loadNumberRules();if(route==='livestream'){if(twitchConsent)loadTwitchPlayer();}else resetTwitchConsent();if(route==='teams')loadTeams();if(route==='rennergebnisse')loadRaceArea();if(route==='fahrerstatistiken')loadDriverStatistics();if(route==='auktionen'&&authenticated)loadAuction();if(route==='administration')loadLeagueAdmin();
 if(route==='start'||route==='kalender')loadDashboard();
 if(moveFocus){window.scrollTo({top:0,behavior:'instant'});const panel=document.querySelector('[data-page-view="'+view.section+'"]:not([hidden])');const heading=panel?.querySelector('h1,h2,h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}else if(route==='anmeldung')$('login').focus({preventScroll:true});}
}
for(const link of document.querySelectorAll('[data-view-link]'))link.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigateTo(link.dataset.viewLink);});
window.addEventListener('hashchange',()=>applyView(true));
applyView();
(async()=>{await boot();if(authenticated||guestMode){await loadLeague();await loadDashboard();}})();


setInterval(()=>{if(document.hidden)return;const route=currentViewRoute();if(route==='teams')loadTeams();if(authenticated&&route==='fahrerstatistiken')loadDriverStatistics();if(isAdmin&&route==='administration')loadNumberSyncStatus();},60000);



let membershipCheckPending=false;
async function refreshMembership(){
 if(!authenticated||membershipCheckPending)return;membershipCheckPending=true;
 try{const me=await apiRequest('/api/me');memberDriver=me.driver||null;if(!memberDriver){$('ownStatistics').hidden=true;$('driverLinkHint').hidden=false;}}catch{if(token){invalidateSession();notice('Der Zugang konnte nicht bestätigt werden. Bitte erneut mit Discord anmelden.');}}
 finally{membershipCheckPending=false;}
}
setInterval(()=>{if(!document.hidden)refreshMembership();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMembership();});




setInterval(()=>{if(authenticated&&!document.hidden&&['auktionen','administration'].includes(currentViewRoute()))loadDrivers();},60000);




