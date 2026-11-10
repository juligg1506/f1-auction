const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);
const notice = message => { $('notice').textContent = message; const auctionNotice = $('auctionNotice'); if (auctionNotice) auctionNotice.textContent = message; };
const BID_STEP = 250000;
let token = sessionStorage.getItem('f1_session');
let isAdmin = false, myTeam = null, currentAuction = null, serverOffset = 0;
let bidPending = false, selectedBid = null, selectedAuctionId = null, auctionLoading = false;
let drivers = [];
let extensionReady = false, trackedLead = null;
const knownDrivers = new Map();
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
    await loadTeams();
    notice('Discord-Login erfolgreich.');
    await loadDrivers(); await loadAuction(); await loadExtensions();
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

boot();

