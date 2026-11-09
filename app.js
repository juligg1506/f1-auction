
const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);
const notice = message => { $('notice').textContent = message; };

let token = sessionStorage.getItem('f1_session');
let isAdmin = false;
let currentAuction = null;
let serverOffset = 0;

if (location.hash.startsWith('#session=')) {
  const candidate = location.hash.slice('#session='.length);

  if (/^[a-f0-9]{64}$/.test(candidate)) {
    token = candidate;
    sessionStorage.setItem('f1_session', token);
  }

  history.replaceState(null, '', location.pathname + location.search);
} else if (location.hash.startsWith('#login_error=')) {
  history.replaceState(null, '', location.pathname + location.search);
  notice('Discord-Anmeldung abgebrochen oder fehlgeschlagen.');
}

$('login').onclick = () => {
  location.assign(API + '/auth/start');
};

$('logout').onclick = async () => {
  try {
    await fetch(API + '/api/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (_) {}

  sessionStorage.removeItem('f1_session');
  token = null;
  location.reload();
};

async function apiRequest(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'API-Fehler');
  }

  return data;
}

async function boot() {
  if (!token) return;

  try {
    const me = await apiRequest('/api/me');

    isAdmin = Boolean(me.admin);

    $('login').classList.add('hidden');
    $('logout').classList.remove('hidden');
    $('guest').classList.add('hidden');
    $('app').classList.remove('hidden');

    $('identity').textContent = me.username;
    $('myTeam').textContent = me.team?.name || 'Noch nicht zugewiesen';
    $('myBalance').textContent = me.team
      ? format(me.team.budget) + ' Coins'
      : '–';

    $('admin').classList.toggle('hidden', !isAdmin);

    // Noch nicht implementierte Admin-Funktionen ausblenden.
    $('createTeam').classList.add('hidden');
    $('assignTeam').classList.add('hidden');
    $('close').classList.add('hidden');

    notice('Discord-Login erfolgreich.');
    $('teams').textContent = 'Teamübersicht folgt.';

    await loadDrivers();
    await loadAuction();
  } catch (error) {
    sessionStorage.removeItem('f1_session');
    token = null;
    notice(error.message);
  }
}

async function loadDrivers() {
  try {
    const data = await apiRequest('/api/drivers');
    const drivers = data.drivers || [];

    if (isAdmin) {
      const select = $('auctionDriver');
      select.replaceChildren(new Option('Fahrer auswählen', ''));

      for (const driver of drivers) {
        select.add(new Option(driver.name, driver.id));
      }
    }

    if (!currentAuction) {
      const container = $('auctions');
      const heading = document.createElement('h3');
      heading.textContent = 'Verfügbare Fahrer';

      const list = document.createElement('ul');

      for (const driver of drivers) {
        const item = document.createElement('li');
        item.textContent = driver.name;
        list.appendChild(item);
      }

      container.replaceChildren(heading, list);
    }
  } catch (error) {
    console.error('Fahrer konnten nicht geladen werden:', error);
  }
}

async function loadAuction() {
  try {
    const data = await apiRequest('/api/auctions');
    currentAuction = data.auction;
    serverOffset = Date.parse(data.serverTime) - Date.now();

    if (!currentAuction) {
      await loadDrivers();
      return;
    }

    const a = currentAuction;
    const container = $('auctions');

    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent = '🏎️ ' + a.driverName;

    const price = document.createElement('p');
    price.textContent = 'Startpreis: ' + format(a.startingPrice) + ' Coins';

    const highest = document.createElement('p');
    highest.textContent = a.highestBid
      ? 'Höchstgebot: ' + format(a.highestBid) + ' Coins'
      : 'Noch keine Gebote';

    const timer = document.createElement('div');
    timer.className = 'stat red';
    timer.id = 'auctionTimer';

    card.append(title, price, highest, timer);
    container.replaceChildren(card);

    updateTimer();
  } catch (error) {
    console.error('Auktion konnte nicht geladen werden:', error);
  }
}

function updateTimer() {
  if (!currentAuction) return;

  const timer = $('auctionTimer');
  if (!timer) return;

  const remaining = Math.max(
    0,
    Math.ceil(
      (Date.parse(currentAuction.endsAt) - Date.now() - serverOffset) / 1000
    )
  );

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  timer.textContent =
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0');

  if (remaining === 0) {
    timer.textContent = 'Zeit abgelaufen – Abschluss ausstehend';
  }
}

$('createAuction').addEventListener('submit', async event => {
  event.preventDefault();

  if (!isAdmin || !token) return;

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');

  const driverId = Number(form.elements.driverId.value);
  const startingPrice = Number(form.elements.startingPrice.value);

  if (!Number.isSafeInteger(driverId) || driverId <= 0 ||
      !Number.isSafeInteger(startingPrice) || startingPrice < 250000) {
    notice('Bitte gültigen Fahrer und Startpreis auswählen.');
    return;
  }

  if (!confirm('Diese Fahrerauktion wirklich starten?')) return;

  button.disabled = true;

  try {
    await apiRequest('/api/admin/auctions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, startingPrice })
    });

    notice('Fahrerauktion erfolgreich gestartet!');
    await loadAuction();
  } catch (error) {
    notice('Auktion konnte nicht gestartet werden: ' + error.message);
  } finally {
    button.disabled = false;
  }
});

setInterval(updateTimer, 1000);

setInterval(() => {
  if (token) loadAuction();
}, 3000);

boot();
