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
let guestMode = false;sessionStorage.removeItem(GUEST_MODE_KEY);
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
  history.replaceState(null, '', location.pathname + location.search);
  notice('Discord-Anmeldung fehlgeschlagen.');
}
$('login').onclick = () => { guestMode=false;sessionStorage.removeItem(GUEST_MODE_KEY);if(!sessionStorage.getItem('f1_return_view'))sessionStorage.setItem('f1_return_view','fahrerbereich'); location.assign(API + '/auth/start'); };
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
    // Official Formula 1 team directory image sources; no session data is sent.
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
        logo.src = 'https://media.formula1.com/image/upload/c_lfill,w_192/q_auto/v1740000001/common/f1/2026/' + slug + '/2026' + slug + 'logowhite.webp';
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
function renderDrivers() {
  const container=$('auctions');
  const card=document.createElement('div'); card.className='card auction-empty';
  const heading=document.createElement('h3'); heading.textContent='Aktuell keine aktive Auktion';
  const info=document.createElement('p'); info.className='muted'; info.textContent='Fahrerübersicht';
  const list=document.createElement('ul');
  for (const driver of drivers) { const item=document.createElement('li'); item.append(profileLink(driver)); list.appendChild(item); }
  card.append(heading,info,list); container.replaceChildren(card);
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
    const a=currentAuction, card=document.createElement('div'); card.className='card auction-card';
    const overview=document.createElement('div');overview.className='auction-overview';
    const bidding=document.createElement('div');bidding.className='auction-bidding';
    const status=document.createElement('span');status.className='auction-live-label';status.textContent='FAHRERAUKTION';
    const title=document.createElement('h3');title.style.marginTop='16px';title.append(profileLink({id:a.driverId,name:a.driverName}));
    const price=document.createElement('p');price.className='auction-starting-price';price.textContent='Startpreis: '+format(a.startingPrice)+' Coins';
    const highest=document.createElement('div');highest.className='auction-highest';
    const priceLabel=document.createElement('span');priceLabel.textContent='Aktuelles Höchstgebot';
    const priceAmount=document.createElement('strong');priceAmount.textContent=a.highestBid!=null?format(a.highestBid)+' Coins':'Noch kein Gebot';highest.append(priceLabel,priceAmount);
    const timerLabel=document.createElement('div');timerLabel.className='auction-clock-label';timerLabel.textContent='Verbleibende Zeit';
    const timer=document.createElement('div');timer.className='stat red';timer.id='auctionTimer';
    const clock=document.createElement('div');clock.className='auction-clock';clock.append(timerLabel,timer);
    overview.append(status,title,price,highest,clock);
    if (a.leadingTeamName) { const leader=document.createElement('p');leader.className='auction-leader';leader.textContent='Führendes Team: '+a.leadingTeamName;overview.append(leader); }
    if (data.features?.antiSnipeSeconds) { const rule=document.createElement('p');rule.className='auction-rule';rule.textContent='Gebote in den letzten '+data.features.antiSnipeSeconds+' Sekunden setzen die Restzeit auf '+data.features.antiSnipeSeconds+' Sekunden zurück.';overview.append(rule); }
    const bidHeading=document.createElement('h4');bidHeading.textContent=myTeam?'Dein Gebot':'Auktion verfolgen';
    const budgetInfo=document.createElement('p');budgetInfo.className='auction-budget';
    budgetInfo.textContent=myTeam?myTeam.name+' · '+format(myTeam.budget)+' Coins verfügbar':'Du schaust als Besucher zu. Gebote können Teamchefs abgeben.';
    bidding.append(bidHeading,budgetInfo);
    renderBidControls(bidding,a);
    card.append(overview,bidding,bidHistory(a));
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
  const section = ui('section', 'bid-history');
  section.append(ui('h4', '', 'Gebotsverlauf'));
  if (!Array.isArray(a.bids)) { section.append(ui('p', 'muted', 'Der Gebotsverlauf ist derzeit nicht verfügbar.')); return section; }
  if (!a.bids.length) { section.append(ui('p', 'muted', 'Noch keine Gebote.')); return section; }
  const list = ui('ol', 'bid-history-list');
  for (const bid of a.bids) {
    const row = ui('li', 'bid-history-row');
    row.append(ui('span', '', bid.teamName), ui('strong', '', format(bid.amount) + ' Coins'), ui('time', 'muted', dateText(bid.createdAt)));
    list.append(row);
  }
  section.append(list);
  if (a.bids.length === 100) section.append(ui('p', 'muted', 'Die letzten 100 Gebote werden angezeigt.'));
  return section;
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
  if(dates.status==='rejected'){container.replaceChildren(ui('p','muted','Der Rennkalender konnte nicht geladen werden. Bitte erneut versuchen.'));return;}
  const calendar=dates.value.calendar||[],today=berlinToday();container.replaceChildren();
  if(!calendar.length){$('heroRaceName').textContent='Renntermine folgen.';$('heroRaceDate').textContent='Der Kalender wird von der Ligaleitung veröffentlicht.';container.append(ui('p','muted','Noch keine Renntermine für diese Saison veröffentlicht.'));return;}
  const next=calendar.find(race=>race.status==='planned'&&race.raceDate>=today);
  $('heroRaceName').textContent=next?.name||'Weitere Termine folgen.';$('heroRaceDate').textContent=next?raceDate(next.raceDate):'Aktuell ist kein weiteres Rennen angekündigt.';
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
setInterval(()=>{if(!document.hidden&&authenticated&&['start','kalender'].includes(currentViewRoute()))loadDashboard();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated&&['start','kalender'].includes(currentViewRoute()))loadDashboard();});

let statisticsSequence=0,statisticsAutoPicked=false,statisticsUserSelected=false;
function statisticsGrid(s) {
 const grid=ui('dl','driver-stat-grid');
 for(const [label,value]of[['Punkte',s.points],['Rennstarts',s.starts],['Siege',s.wins],['Podien',s.podiums],['Beste Platzierung',s.bestFinish??'–'],['Meisterschaftsrang',s.rank??'–']]){
  const cell=ui('div','driver-stat');cell.append(ui('dt','',label),ui('dd','',String(value)));grid.append(cell);
 }
 return grid;
}
function driverStatisticsSection(data) {
 const section=ui('section','driver-statistics');section.append(ui('h3','','Statistiken · '+data.season),statisticsGrid(data.statistics));
 const details=ui('p','muted');const s=data.statistics;
 details.textContent='Top 10: '+s.top10+' · Ausfälle: '+s.retirements+' · Nicht gestartet: '+s.dns+' · Disqualifikationen: '+s.disqualifications+' · Ø gewertete Platzierung: '+(s.averageFinish==null?'–':format(s.averageFinish));section.append(details);
 section.append(ui('h3','','Rennergebnisse'));
 section.append(data.raceResults?.length?resultTable(['Rennen','Datum','Team','Platz / Status','Punkte'],data.raceResults.map(row=>[row.raceName,raceDate(row.raceDate),row.teamName||'Ohne Team',row.position??raceStatusLabel[row.status],row.points]),'Veröffentlichte Rennergebnisse dieses Fahrers'):ui('p','muted','Für diese Saison sind noch keine veröffentlichten Rennergebnisse vorhanden.'));
 if(data.raceResults?.length===50)section.append(ui('p','muted','Die letzten 50 Ergebnisse werden angezeigt; die Statistik zählt alle veröffentlichten Rennen dieser Saison.'));
 return section;
}
async function loadDriverStatistics() {
 if(!authenticated)return;
 const sequence=++statisticsSequence,season=$('statisticsSeason').value.trim();if(!season||season.length>40)return;
 try{
  const data=await apiRequest('/api/driver-stats?season='+encodeURIComponent(season));if(sequence!==statisticsSequence)return;
  extensionReady=true;const list=data.drivers||[],seasons=data.seasons||[];
  $('statisticsFilter').hidden=!leagueState.season&&!seasons.length;
  if(!statisticsAutoPicked&&!statisticsUserSelected&&seasons.length&&!seasons.includes(season)&&list.every(row=>!row.statistics.entries)){statisticsAutoPicked=true;$('statisticsSeason').value=seasons.find(s=>s.startsWith(berlinToday().slice(0,4)))||seasons[0];return loadDriverStatistics();}
  $('statisticsSeasons').replaceChildren(...seasons.map(s=>new Option(s,s)));
  for(const driver of list)knownDrivers.set(Number(driver.id),driver);
  const ordered=[...list].sort((a,b)=>(a.statistics.rank??Infinity)-(b.statistics.rank??Infinity)||a.name.localeCompare(b.name,'de'));
  $('statisticsList').replaceChildren(ordered.length?resultTable(['Fahrer','Aktuelles Team','Starts','Punkte','Siege','Podien','Beste Platzierung'],ordered.map(row=>[profileLink(row),row.teamName||'Ohne Team',row.statistics.starts,row.statistics.points,row.statistics.wins,row.statistics.podiums,row.statistics.bestFinish??'–']),'Fahrerstatistiken; auf kleinen Displays seitlich scrollen'):ui('p','muted','Noch keine Fahrer erfasst.'));
  $('ownStatistics').hidden=!authenticated||!memberDriver;
  $('driverLinkHint').hidden=!authenticated||Boolean(memberDriver);
  if(authenticated&&memberDriver){
   let own=list.find(row=>row.id===memberDriver.id);
   if(!own){const detail=await apiRequest('/api/drivers/'+memberDriver.id+'?season='+encodeURIComponent(season));if(sequence!==statisticsSequence)return;own={...detail.driver,statistics:detail.statistics};}
   const button=ui('button','outline','Mein Fahrerprofil öffnen');button.type='button';button.onclick=()=>openDriverProfile(memberDriver.id);
   $('ownStatistics').replaceChildren(ui('h3','','Deine Statistiken · '+own.name+(Number.isInteger(own.racingNumber)?' · #'+own.racingNumber:'')),statisticsGrid(own.statistics),button);
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
function updateLoginChoice(){const checking=Boolean(token)&&!authenticated;$('entryScreen').hidden=currentViewRoute()!=='anmeldung';$('loginChoice').hidden=false;$('guest').classList.remove('hidden');$('login').classList.remove('hidden');$('guestSession').hidden=true;$('login').disabled=checking;$('guestContinue').disabled=false;$('accountActions').hidden=!authenticated;}
$('guestContinue').onclick=()=>{sessionStorage.removeItem('f1_return_view');navigateTo('start');};
$('returnToLogin').onclick=()=>navigateTo('anmeldung');
$('menuToggle').onclick=()=>{const open=document.querySelector('.sidebar').classList.toggle('menu-open');$('menuToggle').setAttribute('aria-expanded',String(open));};
function loadTwitchPlayer(){
 const frame=$('twitchPlayer');if(!frame||frame.getAttribute('src'))return;
 const parent=location.hostname;
 if(!['juligg1506.github.io','racingleague.online','www.racingleague.online'].includes(parent))return;
 const url=new URL('https://player.twitch.tv/');url.search=new URLSearchParams({channel:'vdr_julian',parent,autoplay:'false',muted:'true'}).toString();frame.src=url.href;
}
function applyView(moveFocus=false){
 let route=currentViewRoute();
 if(viewRoutes[route].protected&&!authenticated){if(token){$('entryScreen').hidden=true;return;}sessionStorage.setItem('f1_return_view',route);route='anmeldung';}
 if(authenticated&&route==='anmeldung')route='fahrerbereich';
 if(route==='administration'&&!isAdmin)route='start';
 if(location.hash!=='#'+route)history.replaceState(null,'',location.pathname+location.search+'#'+route);
 loginReturnView=null;const view=viewRoutes[route];document.body.classList.remove('landing-mode');$('app').classList.remove('hidden');
 for(const panel of document.querySelectorAll('[data-page-view]'))panel.hidden=panel.dataset.pageView!==view.section||(panel.hasAttribute('data-auth-only')&&!authenticated);
 for(const link of document.querySelectorAll('[data-view-link]')){const key=link.dataset.viewLink;link.hidden=(['fahrerstatistiken','auktionen'].includes(key)&&!authenticated)||(key==='administration'&&!isAdmin);const active=key===route;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 document.querySelector('.top-heading').textContent=view.label;document.title=view.label+' | Virtual Tier Racing';
 document.querySelector('.sidebar').classList.remove('menu-open');$('menuToggle').setAttribute('aria-expanded','false');updateLoginChoice();
 if(route==='fahrerbereich'&&authenticated)loadNumberRules();if(route==='livestream')loadTwitchPlayer();else $('twitchPlayer').removeAttribute('src');if(route==='teams')loadTeams();if(route==='rennergebnisse')loadRaceArea();if(route==='fahrerstatistiken')loadDriverStatistics();if(route==='auktionen'&&authenticated)loadAuction();if(route==='administration')loadLeagueAdmin();
 if(route==='start'||route==='kalender')loadDashboard();
 if(moveFocus){window.scrollTo({top:0,behavior:'instant'});const panel=document.querySelector('[data-page-view="'+view.section+'"]:not([hidden])');const heading=panel?.querySelector('h1,h2,h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}else if(route==='anmeldung')$('login').focus({preventScroll:true});}
}
for(const link of document.querySelectorAll('[data-view-link]'))link.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigateTo(link.dataset.viewLink);});
window.addEventListener('hashchange',()=>applyView(true));
applyView();
(async()=>{await loadLeague();await loadDashboard();await boot();})();


setInterval(()=>{if(document.hidden)return;const route=currentViewRoute();if(route==='teams')loadTeams();if(authenticated&&route==='fahrerstatistiken')loadDriverStatistics();if(isAdmin&&route==='administration')loadNumberSyncStatus();},60000);
