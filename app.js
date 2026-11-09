// Login-only first stage. Auctions are not active until secure bid endpoints are deployed.
const API = 'https://f1-auction-api.julianbacher668.workers.dev';
const $ = id => document.getElementById(id);
const notice = message => { $('notice').textContent = message; };
let token = sessionStorage.getItem('f1_session');
if (location.hash.startsWith('#session=')) {
  const candidate = location.hash.slice('#session='.length);
  if (/^[a-f0-9]{64}$/.test(candidate)) { token = candidate; sessionStorage.setItem('f1_session', token); }
  history.replaceState(null, '', location.pathname + location.search);
} else if (location.hash.startsWith('#login_error=')) {
  history.replaceState(null, '', location.pathname + location.search);
  notice('Discord-Anmeldung abgebrochen oder fehlgeschlagen.');
}
$('login').onclick = () => { location.assign(API + '/auth/start'); };
$('logout').onclick = async () => {
  try { await fetch(API + '/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch (_) {}
  sessionStorage.removeItem('f1_session'); token = null; location.reload();
};
async function boot() {
  if (!token) return;
  try {
    const response = await fetch(API + '/api/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Anmeldung abgelaufen. Bitte erneut anmelden.');
    const me = await response.json();
    $('login').classList.add('hidden');
    $('logout').classList.remove('hidden');
    $('guest').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('identity').textContent = me.username;
    $('myTeam').textContent = me.team?.name || 'Noch nicht zugewiesen';
    $('myBalance').textContent = me.team ? new Intl.NumberFormat('de-DE').format(me.team.budget) + ' Coins' : '–';
    document.querySelectorAll('#admin form, #close').forEach(el => el.classList.remove('hidden'));
    notice('Discord-Login erfolgreich. Auktionen werden im nächsten Schritt aktiviert.');
    // Existing Firebase admin forms are disabled until Cloudflare API endpoints exist.
    document.querySelectorAll('#admin form, #close').forEach(el => { el.classList.add('hidden'); });
    $('teams').textContent = 'Teamübersicht wird im nächsten Schritt verbunden.';
  } catch (error) {
    sessionStorage.removeItem('f1_session'); token = null; notice(error.message);
  }
}
async function loadDrivers() {
  const container = $('auctions');

  try {
    const response = await fetch(API + '/api/drivers');
    if (!response.ok) throw new Error('API nicht erreichbar');

    const data = await response.json();

    const heading = document.createElement('h3');
    heading.textContent = 'Verfügbare Fahrer';

    const list = document.createElement('ul');

    for (const driver of data.drivers) {
      const item = document.createElement('li');
      item.textContent = driver.name;
      list.appendChild(item);
    }

    container.replaceChildren(heading, list);
  } catch (error) {
    container.textContent = 'Fahrer konnten nicht geladen werden.';
    console.error(error);
  }
}

loadDrivers();
boot();
