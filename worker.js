/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// F1 Auction Discord OAuth2 login. Bind KV namespace as SESSIONS and D1 as DB.
const DISCORD_GUILD_ID = '1542175377961648128';
const TEAM_ROLES = {
  '1569350409867235519': 'McLaren',
  '1569350503794479154': 'Mercedes',
  '1569350591254241360': 'Red Bull',
  '1569350271274979510': 'Ferrari',
  '1569351176804241548': 'Williams',
  '1569350731612422195': 'Racing Bulls',
  '1569351066942709922': 'Aston Martin',
  '1569350989775896576': 'Haas',
  '1569351359738810448': 'Audi',
  '1569350847035351220': 'Alpine',
  '1569351267183108106': 'Cadillac'
};
const FRONTEND = 'https://juligg1506.github.io/f1-auction/';
const ALLOWED_ORIGIN = 'https://juligg1506.github.io';
const encoder = new TextEncoder();
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const random = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); };
const sha256 = async (v) => { const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(v))); return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); };
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN.replace(/\/$/, ''), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
const redirect = (url, headers = {}) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', ...headers } });
const cookie = (value, age) => `f1_oauth=${value}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=${age}`;
function safeError(message, status = 400) { return json({ error: message }, status, cors); }
function checkEnv(env) { return env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_REDIRECT_URI && env.SESSIONS && env.DB; }
async function getSession(request, env) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '');
  if (!match) return null;
  const key = 'session:' + await sha256(match[1]);
  const session = await env.SESSIONS.get(key, 'json');
  return session ? { ...session, key } : null;
}
async function getDiscordTeam(accessToken) {
  const response = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

if (response.status === 404) {
  return null;
}

if (!response.ok) {
  throw new Error('Discord-Rollen konnten nicht geprüft werden');
}
  const member = await response.json();

  const teams = member.roles
    .filter(roleId => TEAM_ROLES[roleId])
    .map(roleId => TEAM_ROLES[roleId]);

  return teams.length === 1 ? teams[0] : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!checkEnv(env)) return safeError('Worker configuration incomplete', 503);
    try {
      if (path === '/auth/start' && request.method === 'GET') {
        const state = random();
        const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
        await env.SESSIONS.put('oauth:' + await sha256(state), JSON.stringify({ verifier }), { expirationTtl: 600 });
        const oauth = new URL('https://discord.com/oauth2/authorize');
        oauth.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
        oauth.searchParams.set('redirect_uri', env.DISCORD_REDIRECT_URI);
        oauth.searchParams.set('response_type', 'code');
        oauth.searchParams.set('scope', 'identify guilds.members.read');
        oauth.searchParams.set('state', state);
        oauth.searchParams.set('code_challenge', challenge);
        oauth.searchParams.set('code_challenge_method', 'S256');
        return redirect(oauth.toString(), { 'Set-Cookie': cookie(state, 600) });
      }
      if (path === '/auth/callback' && request.method === 'GET') {
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        const savedCookie = /(?:^|;\s*)f1_oauth=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
        if (url.searchParams.has('error')) return redirect(FRONTEND + '#login_error=discord_denied', { 'Set-Cookie': cookie('', 0) });
        if (!state || !code || !savedCookie || state !== savedCookie || !/^[a-f0-9]{64}$/.test(state)) return safeError('Invalid OAuth state', 403);
        const stateKey = 'oauth:' + await sha256(state);
        const saved = await env.SESSIONS.get(stateKey, 'json');
        if (!saved) return safeError('Login expired; try again', 403);
        await env.SESSIONS.delete(stateKey);
        const body = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: env.DISCORD_REDIRECT_URI, code_verifier: saved.verifier });
        const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        if (!tokenResponse.ok) return safeError('Discord token exchange failed', 502);
        const tokens = await tokenResponse.json();
        console.log('OAuth token check:', {
  hasAccessToken: typeof tokens.access_token === 'string' && tokens.access_token.length > 0,
  tokenType: tokens.token_type,
  scope: tokens.scope
});
        const profileResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!profileResponse.ok) {
        console.error('Discord profile error:', profileResponse.status, await profileResponse.text());
        return safeError('Discord profile lookup failed', 502);
        }        
        const profile = await profileResponse.json();
        if (!/^\d{15,25}$/.test(profile.id)) return safeError('Invalid Discord identity', 502);
        const discordTeam = await getDiscordTeam(tokens.access_token);
if (discordTeam === null) {
  await env.DB.prepare(`
    UPDATE teams
    SET owner_discord_id = NULL
    WHERE owner_discord_id = ?
  `).bind(profile.id).run();
}

if (discordTeam) {
    await env.DB.prepare(`
    UPDATE teams
    SET owner_discord_id = NULL
    WHERE owner_discord_id = ?
      AND name != ?
  `).bind(profile.id, discordTeam).run();
}
        if (discordTeam) {
  const result = await env.DB.prepare(`
    UPDATE teams
    SET owner_discord_id = ?
    WHERE name = ?
      AND (
        owner_discord_id IS NULL
        OR owner_discord_id = ?
      )
  `)
    .bind(profile.id, discordTeam, profile.id)
    .run();

  if (result.meta.changes !== 1) {
    return safeError(
      'Dieses Team ist bereits vergeben.',
      409
    );
  }
}

        await env.SESSIONS.put('profile:' + profile.id, JSON.stringify({ username: profile.global_name || profile.username }), { expirationTtl: 2592000 });
        const sessionToken = random();
        const sessionKey = 'session:' + await sha256(sessionToken);
        const session = {
        discordId: profile.id,
        username: profile.global_name || profile.username,
        admin: profile.id === env.ADMIN_DISCORD_ID,
        discordTeam: discordTeam
        };
        await env.SESSIONS.put(sessionKey, JSON.stringify(session), { expirationTtl: 3600 });
        // Fragment never goes to GitHub Pages server. Frontend immediately removes it.
        return redirect(FRONTEND + '#session=' + sessionToken, { 'Set-Cookie': cookie('', 0), 'Referrer-Policy': 'no-referrer' });
      }
      const driverRead = ['/api/drivers','/api/auctions','/api/transfers','/api/driver-stats'].includes(path) || /^\/api\/drivers\/\d+$/.test(path);
      if(request.method==='GET'&&driverRead&&!await getSession(request,env))return safeError('Für den Fahrerbereich bitte mit Discord anmelden',401);
      if (path === '/api/drivers' && request.method === 'GET') {
  const result = await env.DB.prepare(`
    SELECT id, name
    FROM drivers
    WHERE discord_active = 1
    ORDER BY name
  `).all();

  return json({ drivers: result.results }, 200, cors);
}

if (path === '/api/teams' && request.method === 'GET') {
  const viewerSession=await getSession(request,env);
  const result = await env.DB.prepare(`
    SELECT id, name, budget, owner_discord_id
    FROM teams
    ORDER BY name
  `).all();

  const driversResult = await env.DB.prepare(`
    SELECT id, name, team_id
    FROM drivers
    WHERE team_id IS NOT NULL
      AND discord_active = 1
    ORDER BY name
  `).all();

  const teams = await Promise.all(result.results.map(async team => ({
    id: team.id, name: team.name, budget: viewerSession ? team.budget : undefined,
    owner_username: team.owner_discord_id ? (await env.SESSIONS.get('profile:' + team.owner_discord_id, 'json'))?.username || null : null,
    drivers: driversResult.results
      .filter(driver => driver.team_id === team.id)
      .map(driver => ({
        id: driver.id,
        name: driver.name
      }))
  })));

  return json({ teams }, 200, cors);
}

if (path === '/api/auctions' && request.method === 'GET') {
  const auction = await env.DB.prepare(`
    SELECT a.id, a.driver_id AS driverId, d.name AS driverName,
      a.starting_price AS startingPrice, a.ends_at AS endsAt, a.status,
      b.amount AS highestBid, b.team_id AS leadingTeamId, t.name AS leadingTeamName
    FROM auctions a JOIN drivers d ON d.id = a.driver_id
    LEFT JOIN bids b ON b.id = a.leading_bid_id LEFT JOIN teams t ON t.id = b.team_id
    WHERE a.status = 'active' ORDER BY a.id LIMIT 1
  `).first();
  const bids = auction ? (await env.DB.prepare(`
    SELECT b.id, b.team_id AS teamId, t.name AS teamName, b.amount, b.created_at AS createdAt
    FROM bids b JOIN teams t ON t.id = b.team_id
    WHERE b.auction_id = ? ORDER BY b.id DESC LIMIT 100
  `).bind(auction.id).all()).results : [];
  return json({ auction: auction ? { ...auction, bids } : null,
    serverTime: new Date().toISOString(), features: { version: 2, antiSnipeSeconds: 15 } }, 200, cors);
}
      if (path === '/api/me' && request.method === 'GET') {
        const session = await getSession(request, env);
        if (!session) return safeError('Not authenticated', 401);
        const team = await env.DB.prepare('SELECT id, name, budget FROM teams WHERE owner_discord_id = ?').bind(session.discordId).first();
        const driver = await env.DB.prepare('SELECT id, name FROM drivers WHERE discord_id = ?').bind(session.discordId).first();
        return json({ discordId: session.discordId, username: session.username, admin: session.admin, team, driver: driver || null }, 200, cors);
      }
      if (path === '/api/logout' && request.method === 'POST') {
        const session = await getSession(request, env);
        if (session) await env.SESSIONS.delete(session.key);
        return json({ ok: true }, 200, cors);
      }
if (path === '/api/admin/auctions' && request.method === 'POST') {    

  const session = await getSession(request, env);

  if (!session) {
    return safeError('Nicht angemeldet', 401);
  }

  if (!session.admin) {
    return safeError('Nur Admins dürfen Auktionen starten', 403);
  }

  const body = await request.json();
  const driverId = Number(body.driverId);
  const startingPrice = body.startingPrice === undefined
    ? 2500000
    : Number(body.startingPrice);

  if (!Number.isSafeInteger(driverId) || driverId <= 0 ||
      !Number.isSafeInteger(startingPrice) || startingPrice < 250000 || startingPrice % 250000 !== 0) {
    return safeError('Ungültiger Fahrer oder Startpreis', 400);
  }

  const driver = await env.DB.prepare(
    'SELECT id FROM drivers WHERE id = ? AND discord_active = 1'
  ).bind(driverId).first();

  if (!driver) {
    return safeError('Fahrer nicht verfügbar', 400);
  }

  try {
    const auction = await startAuction(env, driverId, startingPrice);
    ctx.waitUntil(deliverNotifications(env));
    return json({ ok: true, ...auction }, 201, cors);
  } catch (error) {
    return safeError('Auktion konnte nicht gestartet werden. Ist bereits eine aktiv?', 409);
  }
}

if (path === '/api/auctions/bid' && request.method === 'POST') {
  const session = await getSession(request, env);

  if (!session) {
    return safeError('Nicht angemeldet', 401);
  }

  const team = await env.DB.prepare(
    'SELECT id, budget FROM teams WHERE owner_discord_id = ?'
  ).bind(session.discordId).first();

  if (!team) {
    return safeError('Du bist kein Teamchef', 403);
  }

  const body = await request.json().catch(() => ({}));
  const auctionId = Number(body.auctionId);

  if (!Number.isSafeInteger(auctionId) || auctionId <= 0) {
    return safeError('Ungültige Auktion', 400);
  }

  const auction = await env.DB.prepare(`
    SELECT a.id, a.starting_price, a.ends_at,
           a.status, a.leading_bid_id,
           b.amount AS highest_amount,
           b.team_id AS highest_team_id
    FROM auctions a
    LEFT JOIN bids b ON b.id = a.leading_bid_id
    WHERE a.id = ?
  `).bind(auctionId).first();

  if (!auction || auction.status !== 'active') {
    return safeError('Auktion nicht aktiv', 409);
  }

  if (Date.parse(auction.ends_at) <= Date.now()) {
    return safeError('Auktion abgelaufen', 409);
  }

  if (auction.highest_team_id === team.id) {
    return safeError('Dein Team führt bereits', 409);
  }

  const minimum = auction.highest_amount == null ? auction.starting_price : auction.highest_amount + 250000;
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < minimum || (amount - auction.starting_price) % 250000 !== 0) {
    return safeError('Ungültiger Gebotsbetrag oder Gebotsschritt', 400);
  }

  if (amount > team.budget) {
    return safeError('Nicht genügend Coins', 409);
  }     

const now = new Date().toISOString();

try {
  const results = await env.DB.batch([
    // Prüfen, ob das Gebot noch gültig ist.
    // Bei einem Fehler wird die Transaktion abgebrochen.
    env.DB.prepare(`
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM auctions a
          LEFT JOIN bids b ON b.id = a.leading_bid_id
          WHERE a.id = ?
            AND a.status = 'active'
            AND julianday(a.ends_at) > julianday('now')
            AND a.leading_bid_id IS ?
            AND (
              b.id IS NULL
              OR b.team_id != ?
            )
        )
        AND EXISTS (
          SELECT 1
          FROM teams
          WHERE id = ?
            AND owner_discord_id = ?
            AND budget >= ?
        )
        THEN 1
        ELSE json_extract('ungueltig', '$')
      END
    `).bind(
      auctionId,
      auction.leading_bid_id,
      team.id,
      team.id,
      session.discordId,
      amount
    ),

    // Coins beim neuen Höchstbietenden reservieren.
    env.DB.prepare(`
      UPDATE teams
      SET budget = budget - ?
      WHERE id = ? AND budget >= ?
    `).bind(amount, team.id, amount),

    // Coins des bisherigen Höchstbietenden freigeben.
    env.DB.prepare(`
      UPDATE teams
      SET budget = budget + ?
      WHERE id = ?
        AND ? IS NOT NULL
    `).bind(
      auction.highest_amount || 0,
      auction.highest_team_id,
      auction.highest_team_id
    ),

    // Neues Gebot speichern.
    env.DB.prepare(`
      INSERT INTO bids
        (auction_id, team_id, amount, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(auctionId, team.id, amount, now),

    // Neues Höchstgebot zuordnen.
    env.DB.prepare(`
      UPDATE auctions
      SET ends_at = CASE WHEN julianday(ends_at) < julianday('now', '+15 seconds') THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+15 seconds') ELSE ends_at END,
      leading_bid_id = (
        SELECT MAX(id)
        FROM bids
        WHERE auction_id = ?
      )
      WHERE id = ?
    `).bind(auctionId, auctionId)
  ]);

  return json({
    ok: true,
    amount,
    message: 'Gebot erfolgreich gespeichert'
  }, 201, cors);

} catch (error) {
  console.error('Gebotsfehler:', error);

  return safeError(
    'Gebot nicht angenommen. Bitte Auktion aktualisieren.',
    409
  );
}

}

if (path === '/api/features' && request.method === 'GET') {
  return json({ version: 2, raceResults: true, publicDashboard: true, raceCalendar: true, guestReadOnly: true, driverStatistics: true, leaguePortal: true, protectedDriverArea: true, racePoints: RACE_POINTS, antiSnipeSeconds: 15, discordConfigured: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_AUCTION_CHANNEL_ID) }, 200, cors);
}
if (path === '/api/transfers' && request.method === 'GET') {
  return json({ transfers: await transferHistory(env) }, 200, cors);
}
if(path==='/api/driver-stats'&&request.method==='GET'){
  const season=(url.searchParams.get('season')||String(new Date().getUTCFullYear())).trim();
  if(!season||season.length>40)return safeError('Ungültige Saison',400);
  return json(await driverStatistics(env,season),200,cors);
}
const driverMatch = /^\/api\/drivers\/(\d+)$/.exec(path);
if (driverMatch && request.method === 'GET') {
  const id = Number(driverMatch[1]);
  if (!Number.isSafeInteger(id) || id < 1) return safeError('Ungültiger Fahrer', 400);
  const driver = await env.DB.prepare(`SELECT d.id, d.name, d.team_id AS teamId,
    t.name AS teamName, d.discord_active AS active FROM drivers d
    LEFT JOIN teams t ON t.id = d.team_id WHERE d.id = ?`).bind(id).first();
  if (!driver) return safeError('Fahrer nicht gefunden', 404);
  const season=(url.searchParams.get('season')||String(new Date().getUTCFullYear())).trim();
  if(!season||season.length>40)return safeError('Ungültige Saison',400);
  const all=await driverStatistics(env,season);
  const statistics=all.drivers.find(row=>row.id===id)?.statistics||summarizeDriver([]);
  return json({ driver, season, seasons:all.seasons, statistics, raceResults:await driverRaceHistory(env,id,season), transfers:await transferHistory(env,id) },200,cors);
}
if (path.startsWith('/api/admin/queue')) {
  const session = await getSession(request, env);
  if (!session) return safeError('Nicht angemeldet', 401);
  if (!session.admin) return safeError('Nur Admins dürfen Auktionen planen', 403);
  if (path === '/api/admin/queue' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT q.id, q.driver_id AS driverId, d.name AS driverName,
      q.starting_price AS startingPrice, q.scheduled_at AS scheduledAt, q.status, q.auction_id AS auctionId
      FROM auction_queue q JOIN drivers d ON d.id = q.driver_id
      WHERE q.status = 'pending' ORDER BY q.scheduled_at, q.id LIMIT 100`).all();
    return json({ queue: rows.results }, 200, cors);
  }
  if (path === '/api/admin/queue' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const driverId = Number(body.driverId), price = Number(body.startingPrice), date = Date.parse(body.scheduledAt);
    if (!Number.isSafeInteger(driverId) || driverId < 1 || !Number.isSafeInteger(price) || price < 250000 || price % 250000 !== 0 || !Number.isFinite(date) || date < Date.now() || date > Date.now() + 366 * 86400000) {
      return safeError('Ungültige Planung: Fahrer, Preis oder Termin prüfen', 400);
    }
    try {
      const result = await env.DB.prepare(`INSERT INTO auction_queue (driver_id, starting_price, scheduled_at, created_by, created_at)
        SELECT id, ?, ?, ?, ? FROM drivers WHERE id = ? AND discord_active = 1 RETURNING id`)
        .bind(price, new Date(date).toISOString(), session.discordId, new Date().toISOString(), driverId).all();
      if (!result.results.length) return safeError('Fahrer nicht verfügbar', 400);
      return json({ ok: true, id: result.results[0].id }, 201, cors);
    } catch (error) { return safeError('Dieser Fahrer ist bereits eingeplant oder die Planung konnte nicht gespeichert werden.', 409); }
  }
  const cancel = /^\/api\/admin\/queue\/(\d+)\/cancel$/.exec(path);
  if (cancel && request.method === 'POST') {
    const result = await env.DB.prepare("UPDATE auction_queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(Number(cancel[1])).run();
    if (result.meta.changes !== 1) return safeError('Eintrag bereits gestartet oder entfernt', 409);
    return json({ ok: true }, 200, cors);
  }
}
const isRaceAdminPath = path === '/api/admin/races' || path.startsWith('/api/admin/races/');
const isRacePublicPath = path === '/api/races' || /^\/api\/races\/\d+$/.test(path) || path === '/api/standings' || path === '/api/calendar';
if (isRaceAdminPath || isRacePublicPath) {
  const adminSession = isRaceAdminPath ? await getSession(request, env) : null;
  if (isRaceAdminPath && !adminSession) return safeError('Nicht angemeldet', 401);
  if (isRaceAdminPath && !adminSession.admin) return safeError('Nur Admins dürfen Rennergebnisse bearbeiten', 403);
  const season = (url.searchParams.get('season') || String(new Date().getUTCFullYear())).trim();
  if (!season || season.length > 40) return safeError('Ungültige Saison', 400);
  if (path === '/api/admin/races/options' && request.method === 'GET') {
    const result = await env.DB.batch([
      env.DB.prepare('SELECT id, name, team_id AS teamId, discord_active AS active FROM drivers ORDER BY name'),
      env.DB.prepare('SELECT id, name FROM teams ORDER BY name')
    ]);
    return json({ drivers: result[0].results, teams: result[1].results }, 200, cors);
  }
  if ((path === '/api/races' || path === '/api/admin/races') && request.method === 'GET') {
    const result = await env.DB.prepare(`SELECT id, season, name, race_date AS raceDate, status, revision, calendar_visible AS calendarVisible
      FROM races WHERE season = ? ${isRaceAdminPath ? '' : "AND status = 'published'"} ORDER BY race_date DESC, id DESC`).bind(season).all();
    const seasons = await env.DB.prepare(`SELECT DISTINCT season FROM races ${isRaceAdminPath ? '' : "WHERE status = 'published'"} ORDER BY season DESC`).all();
    return json({ races: result.results, seasons: seasons.results.map(row => row.season), pointsSystem: RACE_POINTS }, 200, cors);
  }
  if (path === '/api/calendar' && request.method === 'GET') {
    const result = await env.DB.batch([
      env.DB.prepare(`SELECT id, season, name, race_date AS raceDate,
        CASE WHEN status = 'published' THEN 'published' ELSE 'planned' END AS status
        FROM races WHERE season = ? AND (status = 'published' OR calendar_visible = 1) ORDER BY race_date, id`).bind(season),
      env.DB.prepare(`SELECT DISTINCT season FROM races WHERE status = 'published' OR calendar_visible = 1 ORDER BY season DESC`)
    ]);
    return json({ season, calendar: result[0].results, seasons: result[1].results.map(row => row.season) }, 200, cors);
  }
  if (path === '/api/standings' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT rr.driver_id AS driverId, rr.driver_name AS driverName,
      rr.team_id AS teamId, rr.team_name AS teamName, rr.position, rr.status, rr.points
      FROM race_results rr JOIN races r ON r.id = rr.race_id
      WHERE r.status = 'published' AND r.season = ? ORDER BY r.race_date, r.id`).bind(season).all();
    return json({ season, drivers: buildStandings(rows.results, 'driver'), teams: buildStandings(rows.results, 'team') }, 200, cors);
  }
  const match = /^\/api\/(?:admin\/)?races\/(\d+)$/.exec(path);
  if (match && request.method === 'GET') {
    const race = await readRace(env, Number(match[1]), isRaceAdminPath);
    return race ? json(race, 200, cors) : safeError('Rennen nicht gefunden', 404);
  }
  if (path === '/api/admin/races' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const header = validateRaceHeader(body);
    if (!header || (body.calendarVisible !== undefined && typeof body.calendarVisible !== 'boolean')) return safeError('Name, Saison, Renndatum oder Kalenderfreigabe ungültig', 400);
    const now = new Date().toISOString();
    try {
      const result = await env.DB.prepare(`INSERT INTO races (season, name, race_date, created_by, created_at, updated_at, calendar_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, revision`).bind(header.season, header.name, header.raceDate, adminSession.discordId, now, now, body.calendarVisible === true ? 1 : 0).all();
      return json({ ok: true, ...result.results[0] }, 201, cors);
    } catch (error) { return safeError('Ein Rennen mit diesem Namen und Datum ist in dieser Saison bereits vorhanden oder konnte nicht angelegt werden.', 409); }
  }
  if (match && isRaceAdminPath && request.method === 'POST') {
    const id = Number(match[1]), body = await request.json().catch(() => null);
    const header = validateRaceHeader(body);
    if (!header || (body.calendarVisible !== undefined && typeof body.calendarVisible !== 'boolean') || !Number.isSafeInteger(body.revision) || body.revision < 1 || !['draft','published'].includes(body.status) || !Array.isArray(body.results) || body.results.length > 60 || (body.status === 'published' && !body.results.length)) {
      return safeError('Ungültige Ergebnisse oder fehlende Rennangaben', 400);
    }
    const options = await env.DB.batch([env.DB.prepare('SELECT id, name FROM drivers'), env.DB.prepare('SELECT id, name FROM teams')]);
    const driverMap = new Map(options[0].results.map(row => [row.id, row.name]));
    const teamMap = new Map(options[1].results.map(row => [row.id, row.name]));
    const existing = await readRace(env, id, true);
    if (!existing) return safeError('Rennen nicht gefunden', 404);
    const snapshots = new Map(existing.results.map(row => [row.driverId, row]));
    const seenDrivers = new Set(), seenPositions = new Set(), clean = [];
    for (const item of body.results) {
      if (!item || !Number.isSafeInteger(item.driverId) || !driverMap.has(item.driverId) || seenDrivers.has(item.driverId) || !['classified','dnf','dns','dsq'].includes(item.status) || !(item.teamId === null || (Number.isSafeInteger(item.teamId) && teamMap.has(item.teamId)))) {
        return safeError('Fahrer und Teams müssen gültig sein; jeder Fahrer darf nur einmal vorkommen.', 400);
      }
      const position = item.status === 'classified' ? item.position : null;
      if ((item.status !== 'classified' && item.position !== null) || (item.status === 'classified' && (!Number.isSafeInteger(position) || position < 1 || position > 60 || seenPositions.has(position)))) {
        return safeError('Klassifizierte Plätze müssen zwischen 1 und 60 liegen und eindeutig sein. DNF, DNS und DSQ haben keinen Platz.', 400);
      }
      seenDrivers.add(item.driverId); if (position !== null) seenPositions.add(position);
      const prior = snapshots.get(item.driverId);
      clean.push({ driverId: item.driverId, driverName: prior?.driverName || driverMap.get(item.driverId), teamId: item.teamId,
        teamName: item.teamId === null ? null : prior?.teamId === item.teamId ? prior.teamName : teamMap.get(item.teamId),
        position, status: item.status, points: position === null ? 0 : RACE_POINTS[position - 1] || 0 });
    }
    try {
      const statements = [env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM races WHERE id = ? AND revision = ?)
        THEN 1 ELSE json_extract('stale race', '$') END`).bind(id, body.revision),
        env.DB.prepare(`UPDATE races SET season = ?, name = ?, race_date = ?, status = ?, revision = revision + 1, updated_at = ?, calendar_visible = ? WHERE id = ? AND revision = ?`)
          .bind(header.season, header.name, header.raceDate, body.status, new Date().toISOString(), body.calendarVisible === undefined ? (existing.race.calendarVisible || 0) : body.calendarVisible ? 1 : 0, id, body.revision),
        env.DB.prepare('DELETE FROM race_results WHERE race_id = ?').bind(id)];
      for (const row of clean) statements.push(env.DB.prepare(`INSERT INTO race_results (race_id, driver_id, driver_name, team_id, team_name, position, status, points)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, row.driverId, row.driverName, row.teamId, row.teamName, row.position, row.status, row.points));
      await env.DB.batch(statements);
      return json({ ok: true, revision: body.revision + 1 }, 200, cors);
    } catch (error) { return safeError('Ergebnisse wurden zwischenzeitlich geändert oder konnten nicht gespeichert werden. Bitte das Rennen neu öffnen.', 409); }
  }
  return safeError('Route oder Methode nicht gefunden', 404);
}

if(path==='/api/league'&&request.method==='GET'){
 const data=await env.DB.batch([
  env.DB.prepare('SELECT season, revision FROM league_settings WHERE id=1'),
  env.DB.prepare("SELECT id,title,body,published_at AS publishedAt FROM league_content WHERE kind='news' AND status='published' ORDER BY published_at DESC,id DESC LIMIT 20"),
  env.DB.prepare("SELECT id,title,body,published_at AS publishedAt FROM league_content WHERE kind='rules' AND status='published' LIMIT 1")
 ]);
 return json({name:'Virtual Tier Racing',division:'Tier 1',season:data[0].results[0]?.season||null,seasonRevision:data[0].results[0]?.revision||1,news:data[1].results,rules:data[2].results[0]||null},200,cors);
}
if(path==='/api/admin/league'||path.startsWith('/api/admin/league/')){
 const session=await getSession(request,env);if(!session)return safeError('Nicht angemeldet',401);if(!session.admin)return safeError('Nur die Ligaleitung darf Inhalte bearbeiten',403);
 if(path==='/api/admin/league'&&request.method==='GET'){
  const data=await env.DB.batch([env.DB.prepare('SELECT season,revision FROM league_settings WHERE id=1'),env.DB.prepare('SELECT id,kind,title,body,status,revision,published_at AS publishedAt FROM league_content ORDER BY updated_at DESC,id DESC LIMIT 100')]);
  return json({settings:data[0].results[0],content:data[1].results},200,cors);
 }
 if(path==='/api/admin/league/season'&&request.method==='POST'){
  const body=await request.json().catch(()=>null);
  if(!body||!(body.season===null||typeof body.season==='string')||!Number.isSafeInteger(body.revision)||body.revision<1)return safeError('Saison oder Revision ungültig',400);
  const season=body.season===null?null:body.season.trim()||null;if(season&&season.length>40)return safeError('Saisonbezeichnung zu lang',400);
  const result=await env.DB.prepare('UPDATE league_settings SET season=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(season,new Date().toISOString(),body.revision).run();
  if(result.meta.changes!==1)return safeError('Die Saison wurde zwischenzeitlich geändert. Bitte neu laden.',409);
  return json({ok:true,revision:body.revision+1},200,cors);
 }
 const update=/^\/api\/admin\/league\/content\/(\d+)$/.exec(path);
 if((path==='/api/admin/league/content'||update)&&request.method==='POST'){
  const body=await request.json().catch(()=>null);
  if(!body||!['news','rules'].includes(body.kind)||typeof body.title!=='string'||typeof body.body!=='string'||!['draft','published'].includes(body.status))return safeError('Inhalt ungültig',400);
  const title=body.title.trim(),text=body.body.trim();if(!title||title.length>120||!text||text.length>10000)return safeError('Titel (max. 120) und Text (max. 10.000 Zeichen) sind erforderlich',400);
  const now=new Date().toISOString();
  try{
   if(update){
    if(!Number.isSafeInteger(body.revision)||body.revision<1)return safeError('Revision ungültig',400);
    const result=await env.DB.prepare(`UPDATE league_content SET title=?,body=?,status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,revision=revision+1,updated_at=? WHERE id=? AND kind=? AND revision=?`)
     .bind(title,text,body.status,body.status,now,now,Number(update[1]),body.kind,body.revision).run();
    if(result.meta.changes!==1)return safeError('Dieser Inhalt wurde zwischenzeitlich geändert. Bitte neu öffnen.',409);
    return json({ok:true,revision:body.revision+1},200,cors);
   }
   const result=await env.DB.prepare('INSERT INTO league_content(kind,title,body,status,published_at,created_by,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING id,revision').bind(body.kind,title,text,body.status,body.status==='published'?now:null,session.discordId,now).all();
   return json({ok:true,...result.results[0]},201,cors);
  }catch(error){return safeError('Inhalt konnte nicht gespeichert werden. Ein Regelwerk ist möglicherweise bereits angelegt.',409);}
 }
 return safeError('Route oder Methode nicht gefunden',404);
}

  return safeError('Not found', 404);

} catch (err) {
  console.error('Request failed', err?.message);
  return safeError('Internal server error', 500);
}},
async scheduled(event, env, ctx) {
  ctx.waitUntil(syncDiscordDrivers(env));
  ctx.waitUntil((async () => {
    await closeExpiredAuctions(env);
    await startDueAuction(env);
    await deliverNotifications(env);
  })());
}
};

async function syncDiscordDrivers(env) {
  const guildId = '1542175377961648128';
  const driverRoleId = '1569398144998051890';

  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord Bot Token fehlt');
  }

  let after = '0';
  const drivers = [];

  while (true) {
    const url = new URL(
      `https://discord.com/api/v10/guilds/${guildId}/members`
    );
    url.searchParams.set('limit', '1000');
    url.searchParams.set('after', after);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Discord API Fehler: ${response.status}`);
    }

    const members = await response.json();

    for (const member of members) {
      if (member.roles.includes(driverRoleId)) {
        drivers.push({
          id: member.user.id,
          name:
            member.nick ||
            member.user.global_name ||
            member.user.username
        });
      }
    }

    if (members.length < 1000) break;

    after = members[members.length - 1].user.id;
  }

  for (const driver of drivers) {
    await env.DB.prepare(`
      INSERT INTO drivers
        (name, discord_id, discord_active)
      VALUES (?, ?, 1)
      ON CONFLICT(discord_id)
      DO UPDATE SET
        name = excluded.name,
        discord_active = 1
    `).bind(driver.name, driver.id).run();
  }

  return drivers.length;
}
async function transferHistory(env, driverId = null) {
  const query = `SELECT a.id AS auctionId, d.id AS driverId, d.name AS driverName,
    t.id AS teamId, t.name AS teamName, b.amount, a.ends_at AS endedAt
    FROM auctions a JOIN drivers d ON d.id = a.driver_id
    JOIN bids b ON b.id = a.leading_bid_id JOIN teams t ON t.id = b.team_id
    WHERE a.status = 'ended' ${driverId === null ? '' : 'AND d.id = ?'}
    ORDER BY julianday(a.ends_at) DESC, a.id DESC LIMIT 50`;
  const statement = env.DB.prepare(query);
  return (await (driverId === null ? statement : statement.bind(driverId)).all()).results;
}
async function startAuction(env, driverId, price, queueId = null) {
  const now = new Date().toISOString(), endsAt = new Date(Date.now() + 180000).toISOString();
  const statements = [env.DB.prepare(`SELECT CASE WHEN
    NOT EXISTS (SELECT 1 FROM auctions WHERE status = 'active')
    AND EXISTS (SELECT 1 FROM drivers WHERE id = ? AND discord_active = 1)
    AND (? IS NULL OR EXISTS (SELECT 1 FROM auction_queue WHERE id = ? AND status = 'pending' AND driver_id = ?))
    THEN 1 ELSE json_extract('invalid', '$') END`).bind(driverId, queueId, queueId, driverId),
    env.DB.prepare(`INSERT INTO auctions (driver_id, starting_price, ends_at, status)
      VALUES (?, ?, ?, 'active') RETURNING id`).bind(driverId, price, endsAt),
    env.DB.prepare(`INSERT INTO auction_notifications (event_key, auction_id, event_type, next_attempt_at)
      SELECT 'start:' || id, id, 'started', ? FROM auctions WHERE status = 'active' AND driver_id = ?`).bind(now, driverId)];
  if (queueId !== null) statements.push(env.DB.prepare(`UPDATE auction_queue SET status = 'started', auction_id =
    (SELECT id FROM auctions WHERE status = 'active' AND driver_id = ?) WHERE id = ? AND status = 'pending'`).bind(driverId, queueId));
  const result = await env.DB.batch(statements);
  return { auctionId: result[1].results[0].id, driverId, startingPrice: price, endsAt };
}
async function startDueAuction(env) {
  const next = await env.DB.prepare(`SELECT q.id, q.driver_id, q.starting_price FROM auction_queue q
    JOIN drivers d ON d.id = q.driver_id WHERE q.status = 'pending' AND d.discord_active = 1
    AND julianday(q.scheduled_at) <= julianday('now')
    AND NOT EXISTS (SELECT 1 FROM auctions WHERE status = 'active') ORDER BY q.scheduled_at, q.id LIMIT 1`).first();
  if (!next) return;
  try { await startAuction(env, next.driver_id, next.starting_price, next.id); }
  catch (error) { console.warn('Geplante Auktion wird beim nächsten Cron erneut geprüft'); }
}
async function closeExpiredAuctions(env) {
  const expired = await env.DB.prepare(`SELECT id, driver_id, leading_bid_id FROM auctions
    WHERE status = 'active' AND julianday(ends_at) <= julianday('now')`).all();
  for (const auction of expired.results) {
    try {
      await env.DB.batch([
        // The guard, roster assignment and closure commit together. A late valid bid invalidates this snapshot.
        env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM auctions WHERE id = ? AND status = 'active'
          AND leading_bid_id IS ? AND julianday(ends_at) <= julianday('now')) THEN 1 ELSE json_extract('invalid', '$') END`)
          .bind(auction.id, auction.leading_bid_id),
        env.DB.prepare(`UPDATE drivers SET team_id = (SELECT team_id FROM bids WHERE id = ? AND auction_id = ?)
          WHERE id = ? AND ? IS NOT NULL`).bind(auction.leading_bid_id, auction.id, auction.driver_id, auction.leading_bid_id),
        env.DB.prepare("UPDATE auctions SET status = 'ended' WHERE id = ? AND status = 'active'").bind(auction.id),
        env.DB.prepare(`INSERT INTO auction_notifications (event_key, auction_id, event_type, next_attempt_at)
          VALUES (?, ?, 'ended', ?)`).bind('end:' + auction.id, auction.id, new Date().toISOString())
      ]);
    } catch (error) { console.warn('Auktionsabschluss wird erneut geprüft', auction.id); }
  }
}
async function deliverNotifications(env) {
  if (!env.DISCORD_BOT_TOKEN || !/^\d{15,25}$/.test(env.DISCORD_AUCTION_CHANNEL_ID || '')) return;
  for (let i = 0; i < 5; i++) {
    const now = new Date().toISOString(), lease = new Date(Date.now() + 120000).toISOString();
    const result = await env.DB.prepare(`UPDATE auction_notifications SET lease_until = ?, attempts = attempts + 1
      WHERE event_key = (SELECT event_key FROM auction_notifications WHERE sent_at IS NULL AND attempts < 12
        AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?) ORDER BY next_attempt_at, event_key LIMIT 1)
      AND sent_at IS NULL AND (lease_until IS NULL OR lease_until <= ?) RETURNING *`).bind(lease, now, now, now).all();
    const item = result.results[0];
    if (!item) return;
    try {
      const row = await env.DB.prepare(`SELECT d.name AS driver, a.starting_price, b.amount, t.name AS team
        FROM auctions a JOIN drivers d ON d.id = a.driver_id LEFT JOIN bids b ON b.id = a.leading_bid_id
        LEFT JOIN teams t ON t.id = b.team_id WHERE a.id = ?`).bind(item.auction_id).first();
      if (!row) throw new Error('Auktion nicht gefunden');
      const coins = n => new Intl.NumberFormat('de-DE').format(n) + ' Coins';
      const content = item.event_type === 'started'
        ? `Auktion gestartet: ${row.driver}\nStartpreis: ${coins(row.starting_price)}\n${FRONTEND}`
        : row.team ? `Transfer abgeschlossen: ${row.driver} → ${row.team}\nAblöse: ${coins(row.amount)}\n${FRONTEND}`
        : `Auktion beendet: ${row.driver}\nKeine Gebote – die bisherige Teamzuordnung bleibt bestehen.\n${FRONTEND}`;
      const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_AUCTION_CHANNEL_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] }, nonce: item.event_key, enforce_nonce: true }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const retry = response.status === 429 ? Number((await response.json()).retry_after) : 0;
        throw Object.assign(new Error('Discord HTTP ' + response.status), { retryAfter: retry });
      }
      await env.DB.prepare('UPDATE auction_notifications SET sent_at = ?, lease_until = NULL WHERE event_key = ? AND lease_until = ?')
        .bind(new Date().toISOString(), item.event_key, lease).run();
    } catch (error) {
      const delay = Math.max(60, Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7)), Number(error.retryAfter) || 0);
      await env.DB.prepare('UPDATE auction_notifications SET next_attempt_at = ?, lease_until = NULL WHERE event_key = ? AND lease_until = ?')
        .bind(new Date(Date.now() + delay * 1000).toISOString(), item.event_key, lease).run();
      console.warn('Discord-Nachricht wird erneut versucht', item.event_key, item.attempts);
    }
  }
}


const RACE_POINTS = [25,18,15,12,10,8,6,4,2,1];
function validateRaceHeader(body) {
  if (!body || typeof body.name !== 'string' || typeof body.season !== 'string' || typeof body.raceDate !== 'string') return null;
  const name = body.name.trim(), season = body.season.trim(), date = new Date(body.raceDate + 'T00:00:00Z');
  if (!name || name.length > 120 || !season || season.length > 40 || !/^\d{4}-\d{2}-\d{2}$/.test(body.raceDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== body.raceDate) return null;
  return { name, season, raceDate: body.raceDate };
}
async function readRace(env, id, includeDraft) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const result = await env.DB.batch([
    env.DB.prepare(`SELECT id, season, name, race_date AS raceDate, status, revision, calendar_visible AS calendarVisible FROM races WHERE id = ? ${includeDraft ? '' : "AND status = 'published'"}`).bind(id),
    env.DB.prepare(`SELECT driver_id AS driverId, driver_name AS driverName, team_id AS teamId, team_name AS teamName, position, status, points
      FROM race_results WHERE race_id = ? ORDER BY position IS NULL, position, driver_name, driver_id`).bind(id)
  ]);
  return result[0].results[0] ? { race: result[0].results[0], results: result[1].results, pointsSystem: RACE_POINTS } : null;
}
function buildStandings(rows, kind) {
  const map = new Map();
  for (const row of rows) {
    const id = row[kind + 'Id']; if (id === null) continue;
    let item = map.get(id);
    if (!item) { item = { id, name: row[kind + 'Name'], points: 0, wins: 0, countback: Array(60).fill(0) }; map.set(id, item); }
    item.name = row[kind + 'Name']; item.points += row.points;
    if (row.status === 'classified' && row.position !== null) { item.countback[row.position - 1]++; if (row.position === 1) item.wins++; }
  }
  const compare = (a,b) => { if (a.points !== b.points) return b.points - a.points; for (let i=0;i<60;i++) if (a.countback[i] !== b.countback[i]) return b.countback[i] - a.countback[i]; return 0; };
  const list = [...map.values()].sort((a,b) => compare(a,b) || a.name.localeCompare(b.name, 'de') || a.id - b.id);
  return list.map((item,i) => { item.rank = i && compare(item,list[i-1]) === 0 ? list[i-1].rank : i+1; return { id: item.id, name: item.name, points: item.points, wins: item.wins, rank: item.rank }; });
}



async function driverStatistics(env, season) {
  const results=await env.DB.batch([
    env.DB.prepare(`SELECT d.id, d.name, d.team_id AS teamId, t.name AS teamName, d.discord_active AS active
      FROM drivers d LEFT JOIN teams t ON t.id=d.team_id
      WHERE d.discord_active=1 OR EXISTS (SELECT 1 FROM race_results rr JOIN races r ON r.id=rr.race_id WHERE rr.driver_id=d.id AND r.status='published') ORDER BY d.name`),
    env.DB.prepare(`SELECT rr.driver_id AS driverId,rr.driver_name AS driverName,rr.team_id AS teamId,rr.team_name AS teamName,rr.position,rr.status,rr.points
      FROM race_results rr JOIN races r ON r.id=rr.race_id WHERE r.status='published' AND r.season=? ORDER BY r.race_date,r.id`).bind(season),
    env.DB.prepare("SELECT DISTINCT season FROM races WHERE status='published' ORDER BY season DESC")
  ]);
  const ranks=new Map(buildStandings(results[1].results,'driver').map(row=>[row.id,row.rank]));
  const grouped=new Map();for(const row of results[1].results){if(!grouped.has(row.driverId))grouped.set(row.driverId,[]);grouped.get(row.driverId).push(row);}
  return {season,seasons:results[2].results.map(row=>row.season),drivers:results[0].results.map(driver=>({...driver,statistics:summarizeDriver(grouped.get(driver.id)||[],ranks.get(driver.id)||null)}))};
}
function summarizeDriver(rows, rank=null) {
  const classified=rows.filter(row=>row.status==='classified'&&row.position!==null),positions=classified.map(row=>row.position);
  return {entries:rows.length,starts:rows.filter(row=>row.status!=='dns').length,points:rows.reduce((sum,row)=>sum+row.points,0),
    wins:positions.filter(p=>p===1).length,podiums:positions.filter(p=>p<=3).length,top10:positions.filter(p=>p<=10).length,
    classified:classified.length,retirements:rows.filter(row=>row.status==='dnf').length,dns:rows.filter(row=>row.status==='dns').length,
    disqualifications:rows.filter(row=>row.status==='dsq').length,bestFinish:positions.length?Math.min(...positions):null,
    averageFinish:positions.length?Math.round(positions.reduce((sum,p)=>sum+p,0)/positions.length*10)/10:null,rank};
}
async function driverRaceHistory(env,id,season) {
 return (await env.DB.prepare(`SELECT r.id AS raceId,r.name AS raceName,r.race_date AS raceDate,rr.team_name AS teamName,rr.position,rr.status,rr.points
   FROM race_results rr JOIN races r ON r.id=rr.race_id WHERE rr.driver_id=? AND r.status='published' AND r.season=?
   ORDER BY r.race_date DESC,r.id DESC LIMIT 50`).bind(id,season).all()).results;
}

