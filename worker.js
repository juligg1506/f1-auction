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
    id: team.id, name: team.name, budget: team.budget,
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
        return json({ discordId: session.discordId, username: session.username, admin: session.admin, team }, 200, cors);
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
  return json({ version: 2, antiSnipeSeconds: 15, discordConfigured: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_AUCTION_CHANNEL_ID) }, 200, cors);
}
if (path === '/api/transfers' && request.method === 'GET') {
  return json({ transfers: await transferHistory(env) }, 200, cors);
}
const driverMatch = /^\/api\/drivers\/(\d+)$/.exec(path);
if (driverMatch && request.method === 'GET') {
  const id = Number(driverMatch[1]);
  if (!Number.isSafeInteger(id) || id < 1) return safeError('Ungültiger Fahrer', 400);
  const driver = await env.DB.prepare(`SELECT d.id, d.name, d.team_id AS teamId,
    t.name AS teamName, d.discord_active AS active FROM drivers d
    LEFT JOIN teams t ON t.id = d.team_id WHERE d.id = ?`).bind(id).first();
  if (!driver) return safeError('Fahrer nicht gefunden', 404);
  return json({ driver, transfers: await transferHistory(env, id) }, 200, cors);
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
        const error = new Error('Discord HTTP ' + response.status); error.retryAfter = retry; throw error;
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
