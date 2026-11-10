
const API = 'https://f1-auction-api.julianbacher668.workers.dev';

const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat('de-DE').format(n);

const notice = message => {
  $('notice').textContent = message;
};

const BID_STEP = 250000;

let token = sessionStorage.getItem('f1_session');
let isAdmin = false;
let myTeam = null;
let currentAuction = null;
let serverOffset = 0;
let bidPending = false;
let selectedBid = null;
let selectedAuctionId = null;
let auctionLoading = false;

if (location.hash.startsWith('#session=')) {
  const candidate = location.hash.slice('#session='.length);

  if (/^[a-f0-9]{64}$/.test(candidate)) {
    token = candidate;
    sessionStorage.setItem('f1_session', token);
  }

  history.replaceState(
    null,
    '',
    location.pathname + location.search
  );
} else if (location.hash.startsWith('#login_error=')) {
  history.replaceState(
    null,
    '',
    location.pathname + location.search
  );
  notice('Discord-Anmeldung fehlgeschlagen.');
}

$('login').onclick = () => {
  location.assign(API + '/auth/start');
};

$('logout').onclick = async () => {
  try {
    await fetch(API + '/api/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error(error);
  }

  sessionStorage.removeItem('f1_session');
  token = null;
  location.reload();
};

async function apiRequest(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {})
    },
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || data.message || 'API-Fehler'
    );
  }

  return data;
}

function displayBalance() {
  $('myTeam').textContent =
    myTeam?.name || 'Noch nicht zugewiesen';

  $('myBalance').textContent = myTeam
    ? format(myTeam.budget) + ' Coins'
    : '–';
}

async function refreshBalance() {
  const me = await apiRequest('/api/me');
  myTeam = me.team || null;
  displayBalance();
}

async function boot() {
  if (!token) return;

  try {
    const me = await apiRequest('/api/me');

    isAdmin = Boolean(me.admin);
    myTeam = me.team || null;

    $('login').classList.add('hidden');
    $('logout').classList.remove('hidden');
    $('guest').classList.add('hidden');
    $('app').classList.remove('hidden');

    $('identity').textContent = me.username;
    displayBalance();

    $('admin').classList.toggle('hidden', !isAdmin);

    $('createTeam').classList.add('hidden');
    $('assignTeam').classList.add('hidden');
    $('close').classList.add('hidden');

    $('teams').textContent = 'Teamübersicht folgt.';

    notice('Discord-Login erfolgreich.');

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

      select.replaceChildren(
        new Option('Fahrer auswählen', '')
      );

      for (const driver of drivers) {
        select.add(
          new Option(driver.name, driver.id)
        );
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
    console.error(
      'Fahrer konnten nicht geladen werden:',
      error
    );
  }
}

function getMinimumBid(auction) {
  return auction.highestBid != null
    ? Number(auction.highestBid) + BID_STEP
    : Number(auction.startingPrice);
}

function getRemainingMs(auction) {
  return Date.parse(auction.endsAt) -
    Date.now() - serverOffset;
}

function renderBidControls(card, auction) {
  if (!myTeam) return;

  const minimumBid = getMinimumBid(auction);

  if (selectedAuctionId !== auction.id) {
    selectedAuctionId = auction.id;
    selectedBid = minimumBid;
  }

  if (
    selectedBid === null ||
    selectedBid < minimumBid
  ) {
    selectedBid = minimumBid;
  }

  const controls = document.createElement('div');
  controls.className = 'bid-controls';

  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.justifyContent = 'center';
  controls.style.gap = '16px';
  controls.style.margin = '18px 0';
  controls.style.flexWrap = 'wrap';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.style.fontSize = '24px';
  minus.style.minWidth = '50px';

  const amountDisplay = document.createElement('strong');
  amountDisplay.style.fontSize = '20px';
  amountDisplay.style.textAlign = 'center';

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.style.fontSize = '24px';
  plus.style.minWidth = '50px';

  const bidButton = document.createElement('button');
  bidButton.type = 'button';
  bidButton.id = 'bidButton';

  bidButton.style.width = '100%';
  bidButton.style.marginTop = '10px';

  const warning = document.createElement('p');
  warning.style.textAlign = 'center';

  function updateControls() {
    amountDisplay.textContent =
      format(selectedBid) + ' Coins';

    bidButton.textContent =
      '💰 ' + format(selectedBid) + ' Coins bieten';

    const budget = Number(myTeam.budget);
    const expired = getRemainingMs(auction) <= 0;

    minus.disabled =
      bidPending ||
      expired ||
      selectedBid <= minimumBid;

    plus.disabled =
      bidPending ||
      expired ||
      selectedBid + BID_STEP > budget;

    bidButton.disabled =
      bidPending ||
      expired ||
      selectedBid < minimumBid ||
      selectedBid > budget;

    warning.textContent =
      selectedBid > budget
        ? 'Nicht genügend Coins.'
        : '';
  }

  minus.onclick = () => {
    selectedBid = Math.max(
      minimumBid,
      selectedBid - BID_STEP
    );
    updateControls();
  };

  plus.onclick = () => {
    const newAmount = selectedBid + BID_STEP;

    if (newAmount <= Number(myTeam.budget)) {
      selectedBid = newAmount;
      updateControls();
    }
  };

  bidButton.onclick = async () => {
    if (bidPending) return;

    if (getRemainingMs(auction) <= 0) {
      notice('Diese Auktion ist abgelaufen.');
      return;
    }

    const amount = selectedBid;

    if (
      amount < getMinimumBid(auction) ||
      amount > Number(myTeam.budget)
    ) {
      notice('Ungültiger Gebotsbetrag.');
      return;
    }

    if (!confirm(
      format(amount) + ' Coins für ' +
      auction.driverName + ' bieten?'
    )) return;

    bidPending = true;
    updateControls();

    try {
      await apiRequest('/api/auctions/bid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId: auction.id,
          amount: amount
        })
      });

      notice(
        'Gebot über ' + format(amount) +
        ' Coins erfolgreich abgegeben!'
      );

      await refreshBalance();
      await loadAuction();
    } catch (error) {
      notice(
        'Gebot fehlgeschlagen: ' + error.message
      );
    } finally {
      bidPending = false;
      updateControls();
    }
  };

  controls.append(minus, amountDisplay, plus);
  card.append(controls, bidButton, warning);

  updateControls();
}

async function loadAuction() {
  if (auctionLoading || bidPending) return;

  auctionLoading = true;

  try {
    const data = await apiRequest('/api/auctions');

    currentAuction = data.auction;
    serverOffset =
      Date.parse(data.serverTime) - Date.now();

    if (!currentAuction) {
      selectedAuctionId = null;
      selectedBid = null;

      await loadDrivers();
      return;
    }

    const auction = currentAuction;
    const container = $('auctions');

    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent =
      '🏎️ ' + auction.driverName;

    const price = document.createElement('p');
    price.textContent =
      'Startpreis: ' +
      format(auction.startingPrice) + ' Coins';

    const highest = document.createElement('p');
    highest.textContent =
      auction.highestBid != null
        ? 'Höchstgebot: ' +
          format(auction.highestBid) + ' Coins'
        : 'Noch keine Gebote';

    const timer = document.createElement('div');
    timer.className = 'stat red';
    timer.id = 'auctionTimer';

    card.append(title, price, highest, timer);

    renderBidControls(card, auction);

    container.replaceChildren(card);

    updateTimer();
  } catch (error) {
    console.error(
      'Auktion konnte nicht geladen werden:',
      error
    );
  } finally {
    auctionLoading = false;
  }
}

function updateTimer() {
  if (!currentAuction) return;

  const timer = $('auctionTimer');
  if (!timer) return;

  const remaining = Math.max(
    0,
    Math.ceil(
      getRemainingMs(currentAuction) / 1000
    )
  );

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  timer.textContent =
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0');

  if (remaining === 0) {
    timer.textContent =
      'Zeit abgelaufen – Abschluss ausstehend';

    const bidButton = $('bidButton');
    if (bidButton) bidButton.disabled = true;

    const controls = document.querySelectorAll(
      '.bid-controls button'
    );

    controls.forEach(button => {
      button.disabled = true;
    });
  }
}

$('createAuction').addEventListener(
  'submit',
  async event => {
    event.preventDefault();

    if (!isAdmin || !token) return;

    const form = event.currentTarget;
    const button = form.querySelector(
      'button[type="submit"]'
    );

    const driverId = Number(
      form.elements.driverId.value
    );

    const startingPrice = Number(
      form.elements.startingPrice.value
    );

    if (
      !Number.isSafeInteger(driverId) ||
      driverId <= 0 ||
      !Number.isSafeInteger(startingPrice) ||
      startingPrice < BID_STEP
    ) {
      notice(
        'Bitte gültigen Fahrer und Startpreis auswählen.'
      );
      return;
    }

    if (!confirm(
      'Diese Fahrerauktion wirklich starten?'
    )) return;

    button.disabled = true;

    try {
      await apiRequest('/api/admin/auctions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          driverId,
          startingPrice
        })
      });

      notice('Fahrerauktion erfolgreich gestartet!');

      await loadAuction();
    } catch (error) {
      notice(
        'Auktion konnte nicht gestartet werden: ' +
        error.message
      );
    } finally {
      button.disabled = false;
    }
  }
);

setInterval(updateTimer, 1000);

setInterval(() => {
  if (token && !bidPending) {
    loadAuction();
  }
}, 3000);

boot();
