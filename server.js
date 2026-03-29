// ════════════════════════════════════════════════════════════════
// TIPSTER PRO v16 — BACKEND SERVER
// Cache inteligente · Rotación de keys · Cierre automático
// ════════════════════════════════════════════════════════════════

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CONFIGURACIÓN ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

// ⚠️  AGREGA TUS KEYS AQUÍ (puedes poner varias para rotación)
const ODDS_API_KEYS = [
  '0d7b3ca65129ab72cc22a180f15627a1',  // KEY_1
  // 'TU_SEGUNDA_KEY_AQUI',            // KEY_2 (opcional)
];

const ODDS_BASE_HOST = 'api.the-odds-api.com';

// ── SPORT KEYS MAPEADOS ──────────────────────────────────────────
const SPORT_KEYS = {
  nba:        ['basketball_nba'],
  futbol:     ['soccer_epl','soccer_spain_la_liga','soccer_germany_bundesliga',
               'soccer_france_ligue_one','soccer_uefa_champs_league',
               'soccer_colombia_primera_a','soccer_brazil_campeonato',
               'soccer_argentina_primera_division','soccer_italy_serie_a',
               'soccer_portugal_primeira_liga',
               'soccer_international_friendlies',
               'soccer_conmebol_copa_america'],
  beisbol:    ['baseball_mlb'],
  futamer:    ['americanfootball_nfl','americanfootball_ncaa'],
  hockey:     ['icehockey_nhl'],
  tenis:      ['tennis_atp_aus_open_singles','tennis_wta_aus_open_singles',
               'tennis_atp_french_open','tennis_atp_wimbledon',
               'tennis_atp_us_open','tennis_wta_us_open'],
  voleibol:   ['volleyball_wovb_world_champs'],
  esports:    ['esports_lol_worlds','esports_cs2','esports_valorant_international'],
  baloncesto: ['basketball_euroleague','basketball_ncaab','basketball_wnba'],
  rugby:      ['rugbyleague_nrl','rugbyunion_premiership','rugbyunion_super_rugby'],
  golf:       ['golf_pga_championship','golf_masters_tournament','golf_us_open'],
  mma:        ['mma_mixed_martial_arts'],
  cricket:    ['cricket_test_match','cricket_international_t20','cricket_ipl'],
  formula1:   ['motorsport_formula_1_winner'],
  ciclismo:   ['cycling_tour_de_france_winner'],
  boxeo:      ['boxing_boxing'],
  snooker:    ['snooker_the_masters'],
  nascar:     ['motorsport_nascar_cup_series_winner'],
};

// ── ROTACIÓN DE KEYS ─────────────────────────────────────────────
const keyState = {
  currentIdx: 0,
  usage: ODDS_API_KEYS.map(() => ({ calls: 0, errors429: 0, lastError: null })),
};

function getActiveKey() {
  return ODDS_API_KEYS[keyState.currentIdx];
}

function rotateKey(reason = '') {
  const next = (keyState.currentIdx + 1) % ODDS_API_KEYS.length;
  if (next !== keyState.currentIdx) {
    console.warn(`[KEY] Rotando key ${keyState.currentIdx} → ${next} (${reason})`);
    keyState.currentIdx = next;
  }
}

function recordKeyUsage(idx, status) {
  keyState.usage[idx].calls++;
  if (status === 429) {
    keyState.usage[idx].errors429++;
    keyState.usage[idx].lastError = Date.now();
    rotateKey('429 Too Many Requests');
  }
}

// ── CACHE INTELIGENTE ────────────────────────────────────────────
// TTL según tipo de partido
const CACHE_TTL = {
  future:    90 * 60 * 1000,   // 90 min  — partidos futuros (>24h)
  today:     12 * 60 * 1000,   // 12 min  — partidos del día
  live:       2 * 60 * 1000,   //  2 min  — en vivo
  final:     Infinity,          // nunca   — finalizados
};

const cache = new Map();   // clave → { data, ts, ttl }
const finalIds = new Set(); // IDs de partidos ya finalizados

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, ts: Date.now(), ttl: ttlMs });
}

function getTTL(gameOrStatus) {
  if (gameOrStatus === 'Final' || gameOrStatus === 'final') return CACHE_TTL.final;
  if (gameOrStatus === 'Live'  || gameOrStatus === 'live')  return CACHE_TTL.live;
  // Scheduled: ¿es hoy?
  return CACHE_TTL.today;
}

// ── PETICIÓN HTTPS CON KEY ACTIVA ────────────────────────────────
function oddsRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const keyIdx = keyState.currentIdx;
    const options = {
      hostname: ODDS_BASE_HOST,
      path: urlPath,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        recordKeyUsage(keyIdx, res.statusCode);
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── CORS ─────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJSON(res, code, data) {
  setCORS(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── MAPEO SPORT KEY → INTERNO ────────────────────────────────────
function mapSportFromKey(key) {
  if (key.includes('basketball_nba') || key.includes('basketball_wnba') || key.includes('basketball_ncaab')) return 'nba';
  if (key.includes('basketball_euro') || key.includes('basketball_nba_pre')) return 'baloncesto';
  if (key.includes('soccer'))              return 'futbol';
  if (key.includes('baseball'))            return 'beisbol';
  if (key.includes('americanfootball'))    return 'futamer';
  if (key.includes('icehockey'))           return 'hockey';
  if (key.includes('tennis'))              return 'tenis';
  if (key.includes('volleyball'))          return 'voleibol';
  if (key.includes('esports'))             return 'esports';
  if (key.includes('rugby'))               return 'rugby';
  if (key.includes('golf'))                return 'golf';
  if (key.includes('mma'))                 return 'mma';
  if (key.includes('cricket'))             return 'cricket';
  if (key.includes('formula') || key.includes('motorsport_formula')) return 'formula1';
  if (key.includes('cycling'))             return 'ciclismo';
  if (key.includes('boxing'))              return 'boxeo';
  if (key.includes('snooker'))             return 'snooker';
  if (key.includes('nascar'))              return 'nascar';
  return 'nba';
}

// ── CALCULAR ESTADO Y PERÍODO ────────────────────────────────────
function parseGameStatus(game, scoreEntry) {
  const now       = new Date();
  const commence  = new Date(game.commence_time);
  const diffMs    = now - commence;
  const elapsed   = diffMs / 60000;
  const sport     = mapSportFromKey(game.sport_key || '');

  let status = 'Scheduled', period = '', scoreH = 0, scoreA = 0;

  if (scoreEntry) {
    if (scoreEntry.completed) { status = 'Final'; period = 'Final'; }
    else if (scoreEntry.scores && elapsed > 0) { status = 'Live'; }
    if (scoreEntry.scores) {
      const hE = scoreEntry.scores.find(s => s.name === game.home_team);
      const aE = scoreEntry.scores.find(s => s.name !== game.home_team);
      scoreH = hE ? parseInt(hE.score) || 0 : 0;
      scoreA = aE ? parseInt(aE.score) || 0 : 0;
    }
  } else if (elapsed > 0) {
    // Umbral por deporte: si superó el tiempo típico, no marcar como Live
    const maxLive = {
      futbol: 115, nba: 55, beisbol: 220, hockey: 75, tenis: 240,
      rugby: 100, cricket: 480, golf: 360, formula1: 120, nascar: 220,
      mma: 30, boxeo: 60, snooker: 120, voleibol: 150, esports: 90,
      baloncesto: 55, ciclismo: 300, futamer: 200,
    };
    const limit = maxLive[sport] || 180;
    if (elapsed < limit) status = 'Live';
  }

  // Calcular período en vivo
  if (status === 'Live') {
    if (sport === 'futbol') {
      const min = Math.min(90, Math.round(elapsed > 45 ? elapsed - 15 : elapsed));
      period = (elapsed >= 45 && elapsed <= 60) ? 'HT' : (min >= 90 ? "90+'" : `${min}'`);
    } else if (sport === 'nba' || sport === 'baloncesto') {
      const q = Math.min(4, Math.floor(elapsed / 12) + 1);
      const rem = Math.max(0, 12 - (elapsed % 12));
      const mm = Math.floor(rem), ss = Math.round((rem - mm) * 60);
      period = `Q${q} ${mm}:${ss < 10 ? '0'+ss : ss}`;
    } else if (sport === 'beisbol') {
      period = `${Math.min(9, Math.floor(elapsed/20)+1)}ª entrada`;
    } else if (sport === 'hockey') {
      const p = Math.min(3, Math.floor(elapsed/20)+1);
      period = `P${p} ${Math.round(elapsed%20)}:00`;
    } else if (sport === 'tenis') {
      period = `Set ${Math.min(5, Math.floor(elapsed/30)+1)}`;
    } else if (sport === 'rugby') {
      period = `${elapsed < 45 ? '1°' : '2°'} ${Math.min(80,Math.round(elapsed))}'`;
    } else if (sport === 'cricket') {
      period = `Over ${Math.round(elapsed * 0.6)}`;
    } else if (sport === 'golf') {
      period = `Hoyo ${Math.min(18, Math.round(elapsed/8)+1)}`;
    } else if (sport === 'snooker') {
      period = `Frame ${Math.min(25, Math.floor(elapsed/15)+1)}`;
    } else if (sport === 'formula1' || sport === 'nascar') {
      period = `Vuelta ${Math.round(elapsed * 1.5)}`;
    } else if (sport === 'mma' || sport === 'boxeo') {
      period = `Round ${Math.min(12, Math.floor(elapsed/5)+1)}`;
    } else {
      period = 'En Vivo';
    }
  }

  // Hora programada en COT (UTC-5)
  if (status === 'Scheduled') {
    const cotMs = commence.getTime() - 5 * 3600000;
    const cot   = new Date(cotMs);
    const h = cot.getUTCHours().toString().padStart(2,'0');
    const m = cot.getUTCMinutes().toString().padStart(2,'0');
    const timeStr = `${h}:${m}`;
    const todayCOT = new Date(now.getTime() - 5*3600000).toISOString().slice(0,10);
    const gameCOT  = cot.toISOString().slice(0,10);
    const tmrw     = new Date(new Date(todayCOT).getTime() + 86400000).toISOString().slice(0,10);
    if (gameCOT === todayCOT)   period = `Hoy ${timeStr} COT`;
    else if (gameCOT === tmrw)  period = `Mañana ${timeStr} COT`;
    else                        period = `${cot.toISOString().slice(5,10)} ${timeStr}`;
  }

  return { status, period, scoreH, scoreA };
}

// ── EXTRAER CUOTAS ────────────────────────────────────────────────
function extractOdds(game) {
  const bm  = game.bookmakers && game.bookmakers[0];
  const h2h = bm?.markets?.find(m => m.key === 'h2h');
  if (!h2h) return { home: 1.90, away: 1.90, draw: null };
  const homeO = h2h.outcomes?.find(o => o.name === game.home_team)?.price || 1.90;
  const awayO = h2h.outcomes?.find(o => o.name === game.away_team)?.price || 1.90;
  const drawO = h2h.outcomes?.find(o => o.name === 'Draw')?.price || null;
  return { home: homeO, away: awayO, draw: drawO };
}


// ── FECHAS FIFA 2025-2026 ────────────────────────────────────────
// Ventanas oficiales FIFA en las que solo hay selecciones nacionales
const FIFA_WINDOWS = [
  ['2025-10-06','2025-10-14'], ['2025-11-10','2025-11-18'],
  ['2026-03-23','2026-03-31'], ['2026-06-01','2026-06-09'],
  ['2026-09-07','2026-09-15'], ['2026-10-05','2026-10-13'],
  ['2026-11-09','2026-11-17'],
];

// Palabras clave de competiciones de clubes (NO selecciones)
const CLUB_KEYWORDS = [
  'premier','la liga','laliga','bundesliga','serie a','ligue 1',
  'champions league','europa league','conference league',
  'eredivisie','primeira liga','super lig','mls','betplay','dimayor',
  'libertadores','sudamericana','brasileirao','argentina primera',
  'fa cup','copa del rey','dfb pokal','coppa italia','coupe de france',
  'scottish','championship','segunda','liga 2','serie b','ligue 2',
  'segunda b','rfef','3. liga','acb','nba','mlb','nfl','nhl','nba',
];

function isFIFAWindow() {
  const now = new Date();
  const todayStr = new Date(now.getTime() - 5*3600000).toISOString().slice(0,10);
  return FIFA_WINDOWS.some(([start, end]) => todayStr >= start && todayStr <= end);
}

function isNationalTeamGame(game) {
  const key  = (game.sport_key || '').toLowerCase();
  const home = (game.home_team || '').toLowerCase();
  const away = (game.away_team || '').toLowerCase();
  // Amistosos internacionales y clasificaciones
  if (key.includes('international') || key.includes('world_cup') ||
      key.includes('euro') || key.includes('copa_america') ||
      key.includes('conmebol') || key.includes('concacaf') ||
      key.includes('africa') || key.includes('nations_league')) return true;
  // Detectar nombres de países (no clubes)
  const countries = ['colombia','argentina','brasil','mexico','uruguay','chile',
    'peru','ecuador','bolivia','venezuela','paraguay','estados unidos',
    'usa','spain','england','germany','france','italy','portugal',
    'netherlands','belgium','croatia','denmark','sweden','norway',
    'poland','czech','austria','switzerland','scotland','wales',
    'japan','south korea','australia','senegal','nigeria','ghana',
    'morocco','egypt','saudi arabia','iran','new zealand','canada',
    'costa rica','panama','jamaica','honduras','el salvador',
    'aruba','liechtenstein','armenia','belarus','lithuania','georgia',
    'sweden','finland','ukraine','russia','serbia','romania','hungary',
    'turkey','greece','bulgaria','slovakia','slovenia'];
  const isCountryHome = countries.some(c => home.includes(c));
  const isCountryAway = countries.some(c => away.includes(c));
  return isCountryHome && isCountryAway;
}

function shouldSkipForFIFA(game) {
  if (!isFIFAWindow()) return false;
  const key = (game.sport_key || '').toLowerCase();
  if (!key.includes('soccer')) return false; // solo fútbol tiene ventana FIFA
  return !isNationalTeamGame(game);
}

// ── CALCULAR EV ───────────────────────────────────────────────────
function calcEV(prob, cuota) {
  return parseFloat(((prob * cuota) - 1).toFixed(3));
}

// ── ROUTE: /api/games ─────────────────────────────────────────────
async function handleGames(req, res, params) {
  const sport  = params.get('sport') || 'nba';
  const force  = params.get('force') === '1';
  const cacheKey = `games_${sport}`;

  if (!force) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] ${sport} (${cached.games.length} partidos)`);
      return sendJSON(res, 200, { ...cached, fromCache: true });
    }
  }

  const keys  = SPORT_KEYS[sport] || SPORT_KEYS['nba'];
  const allGames = [];
  let remaining = '?';

  for (const key of keys) {
    // No consultar si todos los juegos de este key están finalizados
    if (finalIds.has(`key_${key}`)) continue;

    try {
      const apiKey = getActiveKey();
      // Solo traer partidos desde hace 3h (en vivo posibles) hasta +7 días
      // Desde medianoche de HOY en COT (UTC-5) = 05:00 UTC de hoy
      const nowUtc = new Date();
      const cotMidnight = new Date(Date.UTC(
        new Date(nowUtc.getTime() - 5*3600000).getUTCFullYear(),
        new Date(nowUtc.getTime() - 5*3600000).getUTCMonth(),
        new Date(nowUtc.getTime() - 5*3600000).getUTCDate(),
        5, 0, 0, 0  // 00:00 COT = 05:00 UTC
      ));
      const fetchFrom = cotMidnight.toISOString();
      const fetchTo   = new Date(nowUtc.getTime() + 7 * 24 * 3600000).toISOString();
      const oddsRes = await oddsRequest(
        `/v4/sports/${key}/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h&oddsFormat=decimal&dateFormat=iso&commenceTimeFrom=${fetchFrom}&commenceTimeTo=${fetchTo}`
      );
      remaining = oddsRes.headers['x-requests-remaining'] || remaining;
      if (!Array.isArray(oddsRes.body)) continue;

      // Scores: solo último día
      let scoreMap = {};
      try {
        const scoresRes = await oddsRequest(
          `/v4/sports/${key}/scores/?apiKey=${getActiveKey()}&daysFrom=1&dateFormat=iso`
        );
        if (Array.isArray(scoresRes.body)) {
          scoresRes.body.forEach(s => { scoreMap[s.id] = s; });
        }
      } catch(_) {}

      let allFinal = true;
      oddsRes.body.forEach(game => {
        if (finalIds.has(game.id)) return; // ya finalizado, skip

        // ── FILTRO FECHA FIFA ────────────────────────────────────────
        if (shouldSkipForFIFA(game)) return; // en ventana FIFA, omitir clubes


        const scoreEntry = scoreMap[game.id] || null;
        const { status, period, scoreH, scoreA } = parseGameStatus(game, scoreEntry);

        // ── FILTRAR PARTIDOS TERMINADOS ──────────────────────────────
        // Si el scoreEntry dice completed=true => Final definitivo
        if (scoreEntry && scoreEntry.completed) {
          finalIds.add(game.id);
          return; // no mostrar
        }
        // Si lleva más de 4h desde inicio y no hay score activo => probablemente terminó
        const elapsedMin = (Date.now() - new Date(game.commence_time).getTime()) / 60000;
        if (elapsedMin > 240 && status !== 'Live') {
          finalIds.add(game.id);
          return; // no mostrar
        }
        // ────────────────────────────────────────────────────────────

        const odds = extractOdds(game);

        // Calcular probabilidades y EV
        const probHome = parseFloat((1 / odds.home).toFixed(3));
        const probAway = parseFloat((1 / odds.away).toFixed(3));
        const probDraw = odds.draw ? parseFloat((1 / odds.draw).toFixed(3)) : null;
        const evHome = calcEV(probHome, odds.home);
        const evAway = calcEV(probAway, odds.away);

        if (status === 'Final') {
          finalIds.add(game.id);
          return; // no enviar finalizados al frontend
        }
        allFinal = false;

        const ttlMs = getTTL(status);
        cacheSet(`game_${game.id}`, { status, period, scoreH, scoreA }, ttlMs);

        allGames.push({
          id:        `api_${game.id}`,
          apiId:     game.id,
          sport:     mapSportFromKey(key),
          sportKey:  key,
          home:      game.home_team,
          away:      game.away_team,
          status,
          period,
          scoreH,
          scoreA,
          scheduled: period.startsWith('Hoy') ? 'Hoy' : period.startsWith('Mañana') ? 'Mañana' : 'Próximo',
          odds,
          probHome, probAway, probDraw,
          evHome, evAway,
          isValue:   evHome > 0.03 || evAway > 0.03,
          fromAPI:   true,
          commence:  game.commence_time,
        });
      });

      if (allFinal) finalIds.add(`key_${key}`);

    } catch(e) {
      console.error(`[ERROR] ${key}:`, e.message);
    }
  }

  const result = {
    games: allGames,
    count: allGames.length,
    requestsRemaining: remaining,
    sport,
    updatedAt: new Date().toISOString(),
    keyStatus: keyState.usage.map((u, i) => ({
      key: `KEY_${i+1}`,
      calls: u.calls,
      errors429: u.errors429,
      active: i === keyState.currentIdx,
    })),
  };

  // TTL del cache: usar el menor (por si hay partidos en vivo)
  const hasLive   = allGames.some(g => g.status === 'Live');
  const hasToday  = allGames.some(g => g.status === 'Scheduled' && g.scheduled === 'Hoy');
  const cacheTTL  = hasLive ? CACHE_TTL.live : hasToday ? CACHE_TTL.today : CACHE_TTL.future;
  cacheSet(cacheKey, result, cacheTTL);

  console.log(`[API] ${sport}: ${allGames.length} partidos · ${remaining} req restantes · TTL ${Math.round(cacheTTL/60000)}min`);
  sendJSON(res, 200, result);
}

// ── ROUTE: /api/resolve — cierre automático de apuestas ──────────
async function handleResolve(req, res, params) {
  const gameId  = params.get('gameId');
  const apiId   = params.get('apiId');
  const sportKey = params.get('sportKey') || 'basketball_nba';

  if (!apiId || !sportKey) return sendJSON(res, 400, { error: 'Faltan parámetros: apiId, sportKey' });

  // Si ya está en cache como final, devolver de cache
  const cached = cacheGet(`game_${apiId}`);
  if (cached && cached.status === 'Final') {
    return sendJSON(res, 200, { status: 'Final', ...cached, fromCache: true });
  }

  try {
    const scoresRes = await oddsRequest(
      `/v4/sports/${sportKey}/scores/?apiKey=${getActiveKey()}&daysFrom=3&dateFormat=iso`
    );
    if (!Array.isArray(scoresRes.body)) return sendJSON(res, 502, { error: 'API error' });

    const entry = scoresRes.body.find(s => s.id === apiId);
    if (!entry) return sendJSON(res, 404, { error: 'Partido no encontrado' });

    let scoreH = 0, scoreA = 0;
    if (entry.scores) {
      const scores = entry.scores;
      scoreH = parseInt(scores[0]?.score) || 0;
      scoreA = parseInt(scores[1]?.score) || 0;
    }
    const status = entry.completed ? 'Final' : 'Live';
    if (status === 'Final') {
      finalIds.add(apiId);
      cacheSet(`game_${apiId}`, { status, scoreH, scoreA, period: 'Final' }, CACHE_TTL.final);
    }
    sendJSON(res, 200, { status, scoreH, scoreA, completed: entry.completed, home: entry.home_team, away: entry.away_team });
  } catch(e) {
    sendJSON(res, 500, { error: e.message });
  }
}

// ── ROUTE: /api/status ────────────────────────────────────────────
async function handleStatus(req, res) {
  try {
    const r = await oddsRequest(`/v4/sports/?apiKey=${getActiveKey()}`);
    const remaining = r.headers['x-requests-remaining'] || '?';
    const used      = r.headers['x-requests-used']      || '?';
    sendJSON(res, 200, {
      ok: true,
      requestsRemaining: remaining,
      requestsUsed: used,
      cacheSize: cache.size,
      finalizedGames: finalIds.size,
      keyStatus: keyState.usage.map((u, i) => ({
        key: `KEY_${i+1}`,
        calls: u.calls,
        errors429: u.errors429,
        active: i === keyState.currentIdx,
      })),
      serverTime: new Date().toISOString(),
    });
  } catch(e) { sendJSON(res, 500, { ok: false, error: e.message }); }
}

// ── ROUTE: /api/live — partidos en vivo de todos los deportes ────
async function handleLive(req, res) {
  const cached = cacheGet('all_live');
  if (cached) return sendJSON(res, 200, { ...cached, fromCache: true });

  // Los deportes más probables de tener partidos en vivo ahora
  const liveKeys = [
    'basketball_nba', 'soccer_epl', 'soccer_spain_la_liga',
    'soccer_colombia_primera_a', 'soccer_uefa_champs_league',
    'soccer_international_friendlies', 'baseball_mlb', 'icehockey_nhl',
    'tennis_atp_french_open', 'tennis_atp_wimbledon', 'tennis_atp_us_open',
    'mma_mixed_martial_arts', 'americanfootball_nfl',
  ];

  const liveGames = [];
  const now = new Date();

  await Promise.allSettled(liveKeys.map(async (key) => {
    try {
      const scoresRes = await oddsRequest(
        `/v4/sports/${key}/scores/?apiKey=${getActiveKey()}&daysFrom=1&dateFormat=iso`
      );
      if (!Array.isArray(scoresRes.body)) return;
      scoresRes.body.forEach(entry => {
        if (entry.completed) return; // ya terminó
        const commence = new Date(entry.commence_time);
        const elapsedMin = (now - commence) / 60000;
        if (elapsedMin <= 0 || elapsedMin > 300) return; // no empezó o pasó mucho tiempo
        const scoreH = entry.scores ? (parseInt(entry.scores[0]?.score) || 0) : 0;
        const scoreA = entry.scores ? (parseInt(entry.scores[1]?.score) || 0) : 0;
        liveGames.push({
          id: `live_${entry.id}`,
          apiId: entry.id,
          sport: mapSportFromKey(key),
          sportKey: key,
          home: entry.home_team,
          away: entry.away_team,
          status: 'Live',
          scoreH, scoreA,
          fromAPI: true,
          commence: entry.commence_time,
        });
      });
    } catch(_) {}
  }));

  const result = { games: liveGames, count: liveGames.length, updatedAt: now.toISOString() };
  cacheSet('all_live', result, CACHE_TTL.live); // cache 2 min
  sendJSON(res, 200, result);
}

// ── ROUTE: /api/sports ────────────────────────────────────────────
async function handleSports(req, res) {
  const cached = cacheGet('sports_list');
  if (cached) return sendJSON(res, 200, { sports: cached, fromCache: true });
  try {
    const r = await oddsRequest(`/v4/sports/?apiKey=${getActiveKey()}`);
    if (Array.isArray(r.body)) cacheSet('sports_list', r.body, CACHE_TTL.future);
    sendJSON(res, 200, { sports: r.body, updatedAt: new Date().toISOString() });
  } catch(e) { sendJSON(res, 500, { error: e.message }); }
}

// ── SERVIR EL HTML ────────────────────────────────────────────────
function serveHTML(res) {
  const htmlPath = path.join(__dirname, 'tipster_pro_v16.html');
  if (fs.existsSync(htmlPath)) {
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(htmlPath));
  } else {
    sendJSON(res, 200, { status: 'TIPSTER PRO v16 Backend OK', nota: 'Falta tipster_pro_v16.html en esta carpeta' });
  }
}


// ── ROUTE: /api/arbitrage — surebets cross-market ────────────────
async function handleArbitrage(req, res, params) {
  const cacheKey = 'arbitrage_data';
  const cached = cacheGet(cacheKey);
  if (cached) return sendJSON(res, 200, { ...cached, fromCache: true });

  // Buscar arbitraje entre h2h de diferentes bookmakers
  const arbKeys = [
    'basketball_nba','soccer_epl','soccer_spain_la_liga',
    'soccer_uefa_champs_league','baseball_mlb','soccer_colombia_primera_a',
  ];
  const opportunities = [];
  const apiKey = getActiveKey();

  for (const key of arbKeys.slice(0, 3)) { // limitar llamadas
    try {
      const r = await oddsRequest(
        `/v4/sports/${key}/odds/?apiKey=${apiKey}&regions=eu,us,uk&markets=h2h&oddsFormat=decimal&dateFormat=iso`
      );
      if (!Array.isArray(r.body)) continue;
      r.body.forEach(game => {
        if (!game.bookmakers || game.bookmakers.length < 2) return;
        // Buscar la mejor cuota por outcome entre todos los bookmakers
        const bestOdds = {};
        game.bookmakers.forEach(bm => {
          const h2h = bm.markets?.find(m => m.key === 'h2h');
          if (!h2h) return;
          h2h.outcomes?.forEach(o => {
            if (!bestOdds[o.name] || o.price > bestOdds[o.name].price) {
              bestOdds[o.name] = { price: o.price, book: bm.title };
            }
          });
        });
        // Calcular si hay arbitraje (suma de 1/cuota < 1)
        const outs = Object.entries(bestOdds);
        if (outs.length < 2) return;
        const margin = outs.reduce((acc, [,v]) => acc + 1/v.price, 0);
        if (margin < 1.0) {
          const profit = ((1/margin - 1)*100).toFixed(2);
          opportunities.push({
            sport: mapSportFromKey(key),
            home: game.home_team, away: game.away_team,
            commence: game.commence_time,
            margin: parseFloat(margin.toFixed(4)),
            profit: parseFloat(profit),
            legs: outs.map(([name, v]) => ({ name, price: v.price, book: v.book })),
          });
        }
      });
    } catch(e) { console.error('[ARB]', key, e.message); }
  }

  opportunities.sort((a,b) => b.profit - a.profit);
  const result = { opportunities, count: opportunities.length, updatedAt: new Date().toISOString() };
  cacheSet(cacheKey, result, CACHE_TTL.today); // cache 12min
  sendJSON(res, 200, result);
}

// ── ROUTE: /api/props — mercados de jugadores (simulado) ─────────
async function handleProps(req, res, params) {
  const gameId = params.get('gameId');
  const sport  = params.get('sport') || 'futbol';

  // Mercados de props por deporte (simulados con cuotas reales de estructura)
  const propMarkets = {
    futbol: [
      { market: 'Goleador', players: [
        { name:'Goleador del partido', outcomes:[{label:'Sí',cuota:2.10},{label:'No',cuota:1.65}] },
        { name:'Anota en 1er tiempo', outcomes:[{label:'Sí',cuota:3.50},{label:'No',cuota:1.30}] },
      ]},
      { market: 'Tiros a puerta', players: [
        { name:'Más de 2.5 tiros a puerta', outcomes:[{label:'Sí',cuota:1.85},{label:'No',cuota:1.90}] },
        { name:'Más de 1.5 tiros a puerta', outcomes:[{label:'Sí',cuota:1.35},{label:'No',cuota:2.90}] },
      ]},
      { market: 'Tarjetas', players: [
        { name:'Tarjeta amarilla', outcomes:[{label:'Sí',cuota:2.50},{label:'No',cuota:1.50}] },
        { name:'Tarjeta roja', outcomes:[{label:'Sí',cuota:8.00},{label:'No',cuota:1.08}] },
      ]},
      { market: 'Asistencias', players: [
        { name:'Da asistencia', outcomes:[{label:'Sí',cuota:3.20},{label:'No',cuota:1.30}] },
      ]},
      { market: 'Paradas del Portero', players: [
        { name:'Más de 2.5 paradas', outcomes:[{label:'Sí',cuota:1.75},{label:'No',cuota:2.00}] },
        { name:'Más de 4.5 paradas', outcomes:[{label:'Sí',cuota:3.40},{label:'No',cuota:1.30}] },
        { name:'Sin goles encajados', outcomes:[{label:'Sí',cuota:2.30},{label:'No',cuota:1.58}] },
      ]},
    ],
    nba: [
      { market: 'Puntos (PTS)', players: [
        { name:'Más de 24.5 PTS', outcomes:[{label:'Sí',cuota:1.90},{label:'No',cuota:1.90}] },
        { name:'Más de 29.5 PTS', outcomes:[{label:'Sí',cuota:2.50},{label:'No',cuota:1.50}] },
      ]},
      { market: 'Rebotes (REB)', players: [
        { name:'Más de 8.5 REB', outcomes:[{label:'Sí',cuota:1.85},{label:'No',cuota:1.95}] },
        { name:'Más de 5.5 REB', outcomes:[{label:'Sí',cuota:1.45},{label:'No',cuota:2.60}] },
      ]},
      { market: 'Asistencias (AST)', players: [
        { name:'Más de 6.5 AST', outcomes:[{label:'Sí',cuota:1.90},{label:'No',cuota:1.90}] },
        { name:'Más de 4.5 AST', outcomes:[{label:'Sí',cuota:1.55},{label:'No',cuota:2.35}] },
      ]},
    ],
  };

  const markets = propMarkets[sport] || propMarkets['futbol'];
  sendJSON(res, 200, { markets, gameId, sport, updatedAt: new Date().toISOString() });
}

// ── SERVIDOR PRINCIPAL ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const route  = url.pathname;
  const params = url.searchParams;

  if (req.method === 'OPTIONS') { setCORS(res); res.writeHead(204); res.end(); return; }

  const ts = new Date().toLocaleTimeString('es-CO');
  console.log(`[${ts}] ${req.method} ${route}`);

  try {
    if (route === '/' || route === '/app')         return serveHTML(res);
    if (route === '/tipster_pro_v16.html')         return serveHTML(res);
    if (route === '/api/games')                    return await handleGames(req, res, params);
    if (route === '/api/resolve')                  return await handleResolve(req, res, params);
    if (route === '/api/status')                   return await handleStatus(req, res);
    if (route === '/api/sports')                   return await handleSports(req, res);
    if (route === '/api/live')                     return await handleLive(req, res);
    if (route === '/api/arbitrage')                return await handleArbitrage(req, res, params);
    if (route === '/api/props')                    return await handleProps(req, res, params);
    if (route === '/health')                       return sendJSON(res, 200, { ok: true });
    sendJSON(res, 404, { error: 'Ruta no encontrada' });
  } catch(e) {
    console.error('Server error:', e);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║      TIPSTER PRO v16 — SERVIDOR ACTIVO  ✅      ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  App:  http://localhost:${PORT}                     ║`);
  console.log('║  Cache: inteligente (live 2min · hoy 12min)      ║');
  console.log('║  Keys:  rotación automática en 429               ║');
  console.log('║  Cierre: automático via /api/resolve             ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Rutas:                                          ║');
  console.log('║   GET /          → App HTML                      ║');
  console.log('║   GET /api/games?sport=nba                       ║');
  console.log('║   GET /api/resolve?apiId=X&sportKey=Y            ║');
  console.log('║   GET /api/status                                ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE')
    console.error(`\n❌ Puerto ${PORT} ocupado. Cierra el proceso anterior.`);
  else console.error('Error:', e.message);
  process.exit(1);
});
