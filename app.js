const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);
const notice = message => { $('notice').textContent = message; const auctionNotice = $('auctionNotice'); if (auctionNotice) auctionNotice.textContent = message; };
const BID_STEP = 250000;
let token = sessionStorage.getItem('f1_session');
let loginReturnView = null;
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
$('login').onclick = () => { sessionStorage.setItem('f1_return_view', currentViewRoute()); location.assign(API + '/auth/start'); };
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
    applyView();
    $('createTeam').classList.add('hidden'); $('assignTeam').classList.add('hidden');
    $('close').classList.add('hidden');
    await loadTeams();
    notice('Discord-Login erfolgreich.');
    await loadDrivers(); await loadAuction(); await loadExtensions(); await loadRaceArea();
  } catch(e) { sessionStorage.removeItem('f1_session'); token=null; notice(e.message); }
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
      details.append(ownerRow, budgetRow);
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
  const card=document.createElement('div'); card.className='card';
  const heading=document.createElement('h3'); heading.textContent='Aktuell keine aktive Auktion';
  const info=document.createElement('p'); info.className='muted'; info.textContent='Fahrerübersicht';
  const list=document.createElement('ul');
  for (const driver of drivers) { const item=document.createElement('li'); item.append(profileLink(driver)); list.appendChild(item); }
  card.append(heading,info,list); container.replaceChildren(card);
}
function getMinimumBid(a) { return a.highestBid != null ? Number(a.highestBid)+BID_STEP : Number(a.startingPrice); }
function getRemainingMs(a) { return Date.parse(a.endsAt)-Date.now()-serverOffset; }
function renderBidControls(card,a) {
  if (!myTeam) return;
  if (a.leadingTeamId != null && Number(a.leadingTeamId) === Number(myTeam.id)) { const info=document.createElement('p');info.textContent='Dein Team führt mit dem aktuellen Höchstgebot.';card.append(info);return; }
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
      const accepted = await apiRequest('/api/auctions/bid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auctionId:a.id,amount})});
      trackedLead = { auctionId: a.id, amount: Number(accepted.amount) };
      $('outbidAlert').classList.add('hidden');
      notice('Gebot über '+format(accepted.amount)+' Coins erfolgreich abgegeben!');
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
    const previousAuction = currentAuction;
    currentAuction=data.auction;
    trackLeadingBid(currentAuction);
    if (previousAuction && previousAuction.id !== currentAuction?.id) { loadTeams(); loadDrivers(); loadTransfers(); refreshBalance().catch(() => {}); if (isAdmin) loadQueue(); }
    serverOffset=Date.parse(data.serverTime)-Date.now();
    if(!currentAuction){selectedAuctionId=null;selectedBid=null;renderDrivers();return;}
    const a=currentAuction, card=document.createElement('div'); card.className='card auction-card';
    const overview=document.createElement('div');overview.className='auction-overview';
    const bidding=document.createElement('div');bidding.className='auction-bidding';
    const status=document.createElement('span');status.className='auction-live-label';status.textContent='FAHRERAUKTION';
    const title=document.createElement('h3');title.style.marginTop='16px';title.append(profileLink({id:a.driverId,name:a.driverName}));
    const price=document.createElement('p');price.className='muted';price.textContent='Startpreis: '+format(a.startingPrice)+' Coins';
    const highest=document.createElement('p');highest.className='auction-highest';highest.textContent=a.highestBid!=null?'Höchstgebot: '+format(a.highestBid)+' Coins':'Noch keine Gebote';
    const timerLabel=document.createElement('div');timerLabel.className='muted';timerLabel.textContent='Verbleibende Zeit';
    const timer=document.createElement('div');timer.className='stat red';timer.id='auctionTimer';
    overview.append(status,title,price,highest,timerLabel,timer);
    if (a.leadingTeamName) { const leader=document.createElement('p');leader.className='auction-leader';leader.textContent='Führendes Team: '+a.leadingTeamName;overview.append(leader); }
    if (data.features?.antiSnipeSeconds) { const rule=document.createElement('p');rule.className='muted';rule.textContent='Gebote in den letzten '+data.features.antiSnipeSeconds+' Sekunden setzen die Restzeit auf '+data.features.antiSnipeSeconds+' Sekunden zurück.';overview.append(rule); }
    const bidHeading=document.createElement('h4');bidHeading.textContent=myTeam?'Dein Gebot':'Auktion verfolgen';
    const budgetInfo=document.createElement('p');budgetInfo.className='auction-budget';
    budgetInfo.textContent=myTeam?myTeam.name+' · '+format(myTeam.budget)+' Coins verfügbar':'Du schaust als Besucher zu. Gebote können Teamchefs abgeben.';
    bidding.append(bidHeading,budgetInfo);
    renderBidControls(bidding,a);
    card.append(overview,bidding,bidHistory(a)); $('auctions').replaceChildren(card);updateTimer();
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
const auctionDialog = $('auctionDialog');
function openAuctionWindow(event) {
  event?.preventDefault();
  if ($('app').classList.contains('hidden')) {
    notice('Melde dich mit Discord an, um Auktionen anzusehen.');
    $('login').focus();
    return;
  }
  $('auctionNotice').textContent = '';
  if (!auctionDialog.open) auctionDialog.showModal();
  loadAuction();
}
$('openAuction').addEventListener('click', openAuctionWindow);
document.querySelector('a[href="#auction-section"]').addEventListener('click', openAuctionWindow);
$('closeAuction').addEventListener('click', () => auctionDialog.close());
setInterval(updateTimer,1000);
setInterval(()=>{if(token&&!bidPending)loadAuction();},3000);
const ui = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const dateText = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(date) : '–'; };
function profileLink(driver) {
  const button = ui('button', 'driver-link', driver.name);
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
    const data = await apiRequest('/api/drivers/' + encodeURIComponent(id));
    if (request !== profileRequest) return;
    $('driverDialogTitle').textContent = data.driver.name;
    $('driverProfileBody').replaceChildren(ui('p', 'profile-team', data.driver.teamName ? 'Aktuelles Team: ' + data.driver.teamName : 'Aktuell keinem Team zugeordnet.'), ui('h3', '', 'Bisherige Transfers'));
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
    refreshBalance().catch(() => {});
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
setInterval(() => { if (token && extensionReady) { loadTransfers(); if (isAdmin) loadQueue(); } }, 30000);

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
      raceEditor=data;racePoints=data.pointsSystem;renderRaceEditor();
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
  form.append(header,ui('p','muted','Punkte: '+racePoints.join(' · ')+'. Keine Zusatzpunkte. DNF, DNS und DSQ: ohne Platz und ohne Punkte. Für gewertete Fahrer „Klassifiziert“ wählen. Das Team gilt für dieses Rennen.'));
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
  const payload={name:form.elements.raceName.value,season:form.elements.raceSeason.value,raceDate:form.elements.raceDate.value,revision:raceEditor.race.revision,status,results};
  raceSaving=true;const controls=[...form.querySelectorAll('button,input,select')];const states=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);$('closeRaceDialog').disabled=true;$('raceEditorNotice').textContent='Wird gespeichert …';
  try{await apiRequest('/api/admin/races/'+raceEditor.race.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('raceSeason').value=payload.season.trim();$('raceDialog').close();raceOpenSequence++;navigateTo('rennergebnisse');await loadRaceArea();notice(status==='published'?'Rennergebnis veröffentlicht.':'Rennergebnis als Entwurf gespeichert.');}
  catch(error){$('raceEditorNotice').textContent=error.message;}
  finally{raceSaving=false;controls.forEach((e,i)=>e.disabled=states[i]);$('closeRaceDialog').disabled=false;}
}
$('raceSeason').value=String(new Date().getFullYear());$('newRaceSeason').value=$('raceSeason').value;
$('raceFilter').onsubmit=event=>{event.preventDefault();loadRaceArea();};
$('createRace').onsubmit=async event=>{
  event.preventDefault();if(!isAdmin||!raceEnabled)return;
  const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('raceCreateNotice').textContent='';
  try{const result=await apiRequest('/api/admin/races',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.elements.raceName.value,season:form.elements.raceSeason.value,raceDate:form.elements.raceDate.value})});$('raceSeason').value=form.elements.raceSeason.value;form.elements.raceName.value='';await loadRaceArea();await openRace(result.id,true);}
  catch(error){$('raceCreateNotice').textContent=error.message;}finally{button.disabled=false;}
};
$('closeRaceDialog').onclick=()=>{if(!raceSaving){raceOpenSequence++;$('raceDialog').close();}};
$('raceDialog').addEventListener('cancel',event=>{if(raceSaving)event.preventDefault();else raceOpenSequence++;});

const viewRoutes = {
  dashboard: { label: 'Dashboard', section: 'dashboard' },
  rennergebnisse: { label: 'Rennergebnisse', section: 'results' },
  teams: { label: 'Teams & Fahrer', section: 'teams' },
  administration: { label: 'Administration', section: 'admin' }
};
const viewAliases = { 'results-section': 'rennergebnisse', 'team-section': 'teams', admin: 'administration' };
function currentViewRoute() {
  const hash=location.hash.slice(1) || loginReturnView || 'dashboard';
  return viewRoutes[hash] ? hash : viewAliases[hash] || 'dashboard';
}
function navigateTo(route) {
  if (!viewRoutes[route]) return;
  if (location.hash === '#' + route) applyView(true);
  else location.hash = route;
}
function applyView(moveFocus = false) {
  const loggedIn = !$('app').classList.contains('hidden');
  let route = currentViewRoute();
  if (loggedIn && route === 'administration' && !isAdmin) route = 'dashboard';
  if (location.hash !== '#' + route) history.replaceState(null, '', location.pathname + location.search + '#' + route);
  loginReturnView = null;
  const view = viewRoutes[loggedIn ? route : 'dashboard'];
  for (const panel of document.querySelectorAll('[data-page-view]')) panel.hidden = panel.dataset.pageView !== view.section;
  document.querySelector('.hero').hidden = loggedIn && route !== 'dashboard';
  for (const link of document.querySelectorAll('[data-view-link]')) {
    const active = link.dataset.viewLink === (loggedIn ? route : 'dashboard');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.querySelector('[data-view-link="administration"]').hidden = !loggedIn || !isAdmin;
  document.querySelector('.top-heading').textContent = loggedIn ? view.label : 'Fahrermarkt';
  document.querySelector('.top-sub').textContent = loggedIn && route === 'rennergebnisse' ? 'Rennen, Fahrerwertung und Teamwertung' : 'Racing League · Fahrer und Teams';
  document.title = (loggedIn ? view.label : 'Fahrermarkt') + ' | F1 Auction';
  if (moveFocus) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const panel = document.querySelector('[data-page-view="' + view.section + '"]:not([hidden])');
    const heading = (loggedIn ? panel?.querySelector('h2, h3') : null) || document.querySelector('.hero h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  if (loggedIn && route === 'rennergebnisse' && raceEnabled) loadRaceArea();
}
for (const link of document.querySelectorAll('[data-view-link]')) link.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigateTo(link.dataset.viewLink);
});
window.addEventListener('hashchange', () => applyView(true));
applyView();

boot();



