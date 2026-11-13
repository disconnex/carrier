//
//  CARRiER's game state, kept in the script's v3.data store (shared by every
//  node, one file). Design in docs/design.md.
//
//    season          { id, seed, started }      the network's seed
//    p.<user id>     a player (see newPlayer)
//    f.<number>      the first caller to identify it: [handle, kind, day]
//    n.<ms>.<id>     a Scene Daily item: { t, h, m }
//
//  First finds and news items are a key each, so two nodes writing at once
//  can't drop each other's change.
//

var FREE_MINUTES = 240; //  a day
var BANK_CAP = 600; //  unused minutes carry over up to this
var DEBT_FLOOR = -480; //  how far the phone bill can run
var HEAT_DECAY = 1; //  heat lost per hour
var NEWS_KEEP = 150;

var RANKS = [
    [0, 'Lamer'], [100, 'Wannabe'], [400, 'Phreak'], [1200, 'Hacker'], [3000, 'Elite'], [8000, 'Legion'],
];

//  The rep a rank starts at
function rankRep(name) {
    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i][1] === name) {
            return RANKS[i][0];
        }
    }
    return 0;
}

//  Past Wannabe, each rank also needs a job done for someone in the scene
//  (all made-up handles). done(p) says whether the player has done it.
var RANK_TESTS = {
    Phreak: { who: 'Ghost Line', job: 'Get into any system.',
        done: function (p) { return Object.keys(p.owned || {}).length > 0; } },
    Hacker: { who: 'The Operator', job: 'Get privileged access on a VAX, a UNIX box or a Prime.',
        done: function (p) {
            return Object.keys(p.owned || {}).some(function (n) {
                return p.owned[n] === 'p' && /^(vms|unix|prime)$/.test(p.found[n]);
            });
        } },
    Elite: { who: 'Cold Fusion', job: 'Make a call through a PBX with a barrier code.',
        done: function (p) { return (p.disaCalls || 0) > 0; } },
    Legion: { who: 'Ringmaster', job: 'Take a voice mailbox and stash a code in it.',
        done: function (p) { return !!p.vmb && (p.stash || []).length > 0; } },
};

//  A rank: by rep alone for a number, or for a player by rep and the rank
//  tests passed on the way up
function rankOf(x) {
    var player = typeof x === 'object' && x;
    var rep = player ? x.rep : x;
    var name = RANKS[0][1];
    for (var i = 1; i < RANKS.length; i++) {
        var t = RANK_TESTS[RANKS[i][1]];
        if (rep < RANKS[i][0] || (player && t && !t.done(player))) {
            break;
        }
        name = RANKS[i][1];
    }
    //  a rank earned in an earlier season is kept (phase 5)
    if (player && player.rankFloor && rankRep(player.rankFloor) > rankRep(name)) {
        name = player.rankFloor;
    }
    return name;
}

//  The next rank up for a player: { name, rep, test } or null at the top
function nextRank(p) {
    var cur = rankRep(rankOf(p));
    for (var i = 0; i < RANKS.length; i++) {
        if (RANKS[i][0] > cur) {
            return { name: RANKS[i][1], rep: RANKS[i][0], test: RANK_TESTS[RANKS[i][1]] || null };
        }
    }
    return null;
}

//  A new rank since last time: told once, and in the Scene Daily
function checkPromotion(p) {
    var r = rankOf(p);
    if (rankRep(r) > rankRep(p.rank || 'Lamer')) {
        p.rank = r;
        news(p.h, 'made ' + r + '.');
        return r;
    }
    return '';
}

//  The modem you have: earned with rank, or bought sooner on the Hack Shack
//  (phase 3). Faster scans and screens.
function modemOf(p) {
    var r = rankRep(rankOf(p));
    var g = p.gear || {};
    if (r >= rankRep('Hacker') || g.v32b) return { name: g.v32b ? 'V.32bis 14.4' : 'USR Courier 14.4', baud: 14400, speed: 0.6 };
    if (r >= rankRep('Phreak') || g.hst) return { name: g.hst ? 'USR Courier HST 9600' : 'Hayes Ultra 9600', baud: 9600, speed: 0.75 };
    return { name: 'Hayes-compatible 2400', baud: 2400, speed: 1 };
}

function today() {
    return v3.util.date('2006-01-02');
}

function nowMs() {
    return Date.now();
}

//  ---- the season ----

function season() {
    var s = v3.data.get('season');
    if (!s) {
        s = { id: 1, seed: String(hash32(String(nowMs()) + '|' + v3.util.random(1000000000))), started: today() };
        v3.data.set('season', s);
        seasonTips(s);
    }
    return s;
}

//  Word on the street when a season opens: a few exchanges worth a look
function seasonTips(s) {
    var boss = bossNumber(s.seed);
    if (boss) {
        news('the scene', 'Word is ' + npaCity(boss.slice(0, 3)) + '\'s Switching Control Center dials in from ' + boss.slice(0, 3) + '-' + boss.slice(3, 6) + '.');
    }
    var said = 0;
    for (var tries = 0; tries < 4000 && said < 3; tries++) {
        var npa = NPAS[v3.util.random(NPAS.length)][0];
        var nxx = String(200 + v3.util.random(800));
        var prof = exchangeProfile(s.seed, npa, nxx);
        if (prof === 'edu' || prof === 'gov' || (prof === 'telco' && said === 2)) {
            var what = { edu: 'crawling with carriers', gov: 'full of iron, and hot', telco: 'phone company. Careful.' }[prof];
            news('the scene', 'Word is ' + npa + '-' + nxx + ' is ' + what);
            said++;
        }
    }
}

//  ---- players ----

function newPlayer(home) {
    return {
        h: v3.user.handle,
        home: home, //  area code
        phone: home + String(200 + v3.util.random(700)) + padStart(String(v3.util.random(10000)), 4).replace(/ /g, '0'),
        min: FREE_MINUTES,
        day: today(),
        heat: 0,
        heatAt: nowMs(),
        rep: 0,
        busts: [], //  ms of each bust, the last few
        grounded: 0, //  ms until which the modem is gone
        found: {}, //  number -> kind, or 'C?' / 'T?' until dialed
        owned: {}, //  number -> 'u' (user) or 'p' (privileged)
        loot: {}, //  number -> 1
        scan: {}, //  npa+nxx -> hex bitmap of the 1000 ten-number blocks scanned
        dials: 0,
        firsts: 0,
        seenNews: 0,
        season: 0,
        started: nowMs(),
        cash: 0,
        wares: [],
        gear: {},
        badges: {},
    };
}

//  Fields added since phase 1, for players from before them
function upgradePlayer(p, seed) {
    p.cash = p.cash || 0;
    p.wares = p.wares || [];
    p.gear = p.gear || {};
    p.badges = p.badges || {};
    p.started = p.started || nowMs();
    //  the Hack Shack is on everyone's found list
    var fence = fenceNumber(seed, p.home);
    if (!p.found[fence]) {
        p.found[fence] = 'fence';
    }
}

function loadPlayer() {
    var p = v3.data.get('p.' + v3.user.id);
    if (!p) {
        return null;
    }
    //  v3.data hands back Go-backed values, whose arrays don't grow with
    //  push(); a plain JavaScript copy behaves like any other object
    p = JSON.parse(JSON.stringify(p));
    p.h = v3.user.handle;
    return p;
}

function savePlayer(p) {
    v3.data.set('p.' + v3.user.id, p);
}

//  The daily refill and the heat cooling off since the last visit
function settle(p) {
    var d = today();
    if (p.day !== d) {
        if (p.min < 0) {
            p.min += FREE_MINUTES;
        } else {
            p.min = Math.min(BANK_CAP, p.min + FREE_MINUTES);
        }
        p.day = d;
    }
    var now = nowMs();
    var hours = (now - (p.heatAt || now)) / 3600000;
    p.heat = Math.max(0, p.heat - hours * HEAT_DECAY);
    p.heatAt = now;
}

function isGrounded(p) {
    return p.grounded && p.grounded > nowMs();
}

//  Spend minutes for one call. Past zero the bill runs up, and the heat
//  from each call triples (the phone bill gets noticed).
function chargeCall(p, npa) {
    var cost = npa === p.home ? 1 : 3;
    p.min = Math.max(DEBT_FLOOR, p.min - cost);
    p.dials += 1;
    return p.min < 0 ? 3 : 1;
}

function addHeat(p, n) {
    p.heat = Math.min(100, p.heat + n);
}

//  Whether this action gets you busted. risk: 'dial' (one of many, a small
//  chance each) or 'act' (a login, applying to a board: a bigger one).
function bustRoll(p, risk) {
    if (p.heat >= 100) {
        return true;
    }
    if (risk === 'dial') {
        return p.heat > 60 && Math.random() < (p.heat - 60) / 2000;
    }
    return p.heat > 50 && Math.random() < (p.heat - 50) / 100;
}

//  Busted: a time-out, longer for a repeat offender this week. Rank, rep
//  and finds are never touched; today's minutes go with the modem.
function bust(p, where) {
    var now = nowMs();
    p.busts = (p.busts || []).filter(function (t) { return now - t < 7 * 86400000; });
    var hours = Math.min(24, 4 * (1 + p.busts.length));
    p.busts.push(now);
    p.grounded = now + hours * 3600000;
    p.heat = 30;
    p.heatAt = now;
    p.min = Math.min(p.min, 0);
    p.lastBust = now;
    //  the codes in your pocket go; a voice mailbox keeps its stash, and a
    //  shell account somewhere else keeps half of them
    var kept = (p.gear || {}).shell ? (p.codes || []).slice(0, Math.floor((p.codes || []).length / 2)) : [];
    p.codes = kept;
    news(p.h, 'got busted ' + where + '. Grounded for ' + hours + ' hours.');
    return hours;
}

//  ---- finds and rep ----

//  Record that this player identified a number. Returns the rep earned:
//  0 if they had it already, triple if nobody had identified it before.
function identify(p, num, kind) {
    var known = p.found[num];
    if (known && known !== 'C?' && known !== 'T?') {
        return 0;
    }
    p.found[num] = kind;
    if (p.leadNums && p.leadNums[num]) {
        delete p.leadNums[num];
        p.leadsDialed = (p.leadsDialed || 0) + 1;
    }
    var base = FIND_REP[kind] || 1;
    var first = v3.data.get('f.' + num);
    if (!first) {
        v3.data.set('f.' + num, [p.h, kind, today()]);
        p.firsts += 1;
        base *= 3;
        if (base >= 30) {
            news(p.h, 'found a ' + KIND_NAMES[kind] + (/^NUA/.test(num) ? ' on Telenet' : ' in ' + num.slice(0, 3) + '-' + num.slice(3, 6)));
        }
    }
    p.rep += base;
    return base;
}

function firstFinder(num) {
    var f = v3.data.get('f.' + num);
    return f ? f[0] : '';
}

//  A break-in: the host's worth again, double for a privileged account, the
//  first time this player gets each level.
function breakIn(p, host, priv) {
    var had = p.owned[host.num];
    if (had === 'p' || (had === 'u' && !priv)) {
        return 0;
    }
    var worth = (FIND_REP[host.kind] || 5) * (priv ? 2 : 1);
    p.owned[host.num] = priv ? 'p' : 'u';
    p.rep += worth;
    if (priv && worth >= 30) {
        news(p.h, 'got ' + (host.kind === 'unix' ? 'root' : 'privileged access') + ' on a ' + KIND_NAMES[host.kind]);
    }
    return worth;
}

//  One piece of loot from a host, once each: id names it ('main' for the
//  first kind every host has), worth defaults to the host's find value
function takeLoot(p, host, id, worth) {
    id = id || 'main';
    var have = p.loot[host.num];
    var list = have === 1 ? ['main'] : have ? String(have).split(',') : [];
    if (list.indexOf(id) >= 0) {
        return 0;
    }
    list.push(id);
    p.loot[host.num] = list.join(',');
    worth = worth || FIND_REP[host.kind] || 5;
    p.rep += worth;
    addWare(p, host, id);
    return worth;
}

//  ---- cash, wares and the fence (phase 3) ----
//  Loot you can sell goes into your wares: { what, num, id, kind }. The fence
//  pays the price below; the first to sell a piece of loot gets it in full,
//  each seller after gets less (s.<num>.<id> counts the sales).

var WARE_PRICES = {
    'the SYSUAF account list': 60, '/etc/passwd': 40, 'the system administration directory': 50,
    'the account report': 45, 'a remote access barrier code': 30, 'a COSMOS data line list': 70,
    'a grades file': 35, 'a payroll file': 55, 'a contract index': 80, 'a switch report': 65,
};

function addWare(p, host, id) {
    var what = { main: { vms: 'the SYSUAF account list', unix: '/etc/passwd', prime: 'the system administration directory',
        hp3000: 'the account report', pbx: 'a remote access barrier code' }[host.kind] }[id] ||
        { modems: 'a modem pool list', lsys: 'a UUCP L.sys file', dialups: 'a dialup list', sites: 'a remote sites list',
            backupnode: 'a backup node number', sir: 'a COSMOS data line list',
            prize: { edu: 'a grades file', biz: 'a payroll file', gov: 'a contract index', telco: 'a switch report' }[host.prof] }[id];
    if (!what) {
        return;
    }
    p.wares = p.wares || [];
    p.wares.push({ what: what, num: host.num, id: id, kind: host.kind });
}

//  What the fence pays for a ware right now
function warePrice(w) {
    var base = WARE_PRICES[w.what] || 15;
    var sold = v3.data.get('s.' + w.num + '.' + w.id) || 0;
    return Math.max(2, Math.round(base / (1 + sold)));
}

//  Sell ware i; returns the cash it fetched
function sellWare(p, i) {
    var w = p.wares[i];
    var price = warePrice(w);
    v3.data.set('s.' + w.num + '.' + w.id, (v3.data.get('s.' + w.num + '.' + w.id) || 0) + 1);
    p.wares.splice(i, 1);
    p.cash = (p.cash || 0) + price;
    p.sold = (p.sold || 0) + 1;
    return price;
}

//  ---- gear (phase 3) ----
//  durable: owned once. count: a consumable, bought one at a time.
//  rank: the fence won't sell it to anyone below.

var GEAR = [
    { id: 'hst', name: 'USR Courier HST 9600', price: 150, rank: 'Wannabe', durable: true,
        about: 'A 9600 baud modem before your rank gets you one. Faster scans and screens.' },
    { id: 'v32b', name: 'V.32bis 14.4 modem', price: 400, rank: 'Phreak', durable: true,
        about: '14,400 baud. The fastest thing on the block.' },
    { id: 'excl', name: 'Exclusion list', price: 60, rank: 'Lamer', durable: true,
        about: 'CARRiER skips numbers already on your found list and blocks already scanned. Saves minutes.' },
    { id: 'nudge', name: 'Nudge strings', price: 80, rank: 'Wannabe', durable: true,
        about: 'Sends a CR to lines that go quiet. A few "timeouts" are carriers that only wake up for one.' },
    { id: 'tonedet', name: 'Tone detect', price: 70, rank: 'Wannabe', durable: true,
        about: 'Waits out lines that ring and ring. A few are PBX dial tones and voice mail that answer late.' },
    { id: 'bluebox', name: 'Blue box', price: 250, rank: 'Phreak', durable: true,
        about: '2600 Hz and MF tones. Free long distance into a crossbar exchange. An ESS exchange hears it.' },
    { id: 'redbox', name: 'Red box', price: 20, rank: 'Wannabe',
        about: 'Quarter tones: one call from a payphone. That call adds no heat.' },
    { id: 'beige', name: 'Beige box', price: 35, rank: 'Phreak',
        about: 'A lineman\'s set on a neighbour\'s line. Use it from Gear and tools: heat drops by 40.' },
    { id: 'crack', name: 'Crack 4.1', price: 120, rank: 'Phreak', durable: true,
        about: 'Run it on a stolen /etc/passwd. In a while: accounts on that box, and maybe a reused password next door.' },
    { id: 'shell', name: 'Public-access UNIX shell', price: 300, rank: 'Hacker', durable: true,
        about: 'Somewhere to keep things. A bust takes half the codes you carry, not all.' },
];

//  Zines: each one adds notebook pages (carrier_notes.js, zine: <id>)
var ZINES = [
    { id: 'phrack25', name: 'Phrack 25', price: 15, about: 'Unix cracking tips, hiding out under Unix, the blue box.' },
    { id: 'phrack27', name: 'Phrack 26 and 27', price: 20, about: 'COSMOS parts one and two, looking around in DECnet.' },
    { id: 'phrack32', name: 'Phrack 32', price: 10, about: 'Unix "nasties".' },
    { id: 'phrack40', name: 'Phrack 40', price: 15, about: 'BT Tymnet, all three parts.' },
    { id: 'phrack43', name: 'Phrack 43', price: 10, about: 'Playing hide and seek, Unix style.' },
    { id: 'lodtj4', name: 'LOD/H Technical Journal 4', price: 25, about: 'The Telenet directory.' },
];

function gearItem(id) {
    return GEAR.concat(ZINES).filter(function (g) { return g.id === id; })[0] || null;
}

function hasGear(p, id) {
    return !!(p.gear && p.gear[id]);
}

//  Buy an item: '' if bought, else why not
function buyGear(p, id) {
    var g = gearItem(id);
    p.gear = p.gear || {};
    if (!g) return 'Never heard of it.';
    if (g.rank && rankRep(rankOf(p)) < rankRep(g.rank)) return 'The fence won\'t sell that to a ' + rankOf(p) + '. Come back a ' + g.rank + '.';
    if ((g.durable || /^(phrack|lod)/.test(id)) && p.gear[id]) return 'You already have one.';
    if ((p.cash || 0) < g.price) return 'That\'s $' + g.price + '. You have $' + (p.cash || 0) + '.';
    p.cash -= g.price;
    p.gear[id] = g.durable || /^(phrack|lod)/.test(id) ? 1 : (p.gear[id] || 0) + 1;
    return '';
}

//  Use one of a consumable: true if there was one
function useGear(p, id) {
    if (!p.gear || !p.gear[id]) return false;
    p.gear[id] -= 1;
    if (!p.gear[id]) delete p.gear[id];
    return true;
}

//  ---- Crack (phase 3) ----
//  A run on a stolen passwd file takes CRACK_MINUTES of real time. When it
//  finishes, it gives two user accounts on that host, and the same password
//  on one of its neighbours (people reuse them). p.jobs: [{ num, done }];
//  p.cracked: { number: [[user, pw, false], ...] }.

var CRACK_MINUTES = 20;
var CRACK_WORDS = ['wizard', 'secret', 'dragon', 'snoopy', 'qwerty', 'letmein', 'trustno1', 'garfield', 'enterprise',
    'computer', 'baseball', 'mustang', 'tiger', 'falcon'];

function startCrack(p, num) {
    p.jobs = p.jobs || [];
    if (p.jobs.some(function (j) { return j.num === num; }) || (p.cracked && p.cracked[num])) {
        return false;
    }
    p.jobs.push({ num: num, done: nowMs() + CRACK_MINUTES * 60000 });
    return true;
}

//  Finished runs: their results added, and returned as [{ num, accounts, reused }]
function finishCracks(p, seed) {
    var now = nowMs();
    var done = [];
    p.jobs = (p.jobs || []).filter(function (j) {
        if (j.done > now) return true;
        var r = rng(hash32(seed + '|crack|' + j.num));
        var users = someUsersFor(j.num, 5);
        var accts = [[users[1], pick(r, CRACK_WORDS), false], [users[3], pick(r, CRACK_WORDS), false]];
        //  a password a player set (root's, SYSTEM's) or an account a
        //  player added falls to the wordlist if it's weak
        var ov = keepLoad(seed, j.num);
        Object.keys(ov.pw).forEach(function (u) {
            if (crackWeak(ov.pw[u], users)) accts.push([u, ov.pw[u], true]);
        });
        Object.keys(ov.acc).forEach(function (u) {
            if (crackWeak(ov.acc[u][0], users)) accts.push([u, ov.acc[u][0], !!ov.acc[u][1]]);
        });
        p.cracked = p.cracked || {};
        p.cracked[j.num] = accts;
        p.crackedAt = p.crackedAt || {};
        p.crackedAt[j.num] = now;
        var res = { num: j.num, accounts: accts, reused: '' };
        var host = { num: j.num, kind: 'unix' };
        var next = neighbours(seed, host, 'unix', 1)[0];
        if (next) {
            p.cracked[next] = (p.cracked[next] || []).concat([[accts[0][0], accts[0][1], false]]);
            addLead(p, next);
            res.reused = next;
        }
        p.crackRuns = (p.crackRuns || 0) + 1;
        done.push(res);
        return false;
    });
    return done;
}

//  Words Crack's dictionary has besides CRACK_WORDS
var CRACK_MORE = ['password', 'root', 'toor', 'admin', 'system', 'unix', 'hacker', 'god', 'love', 'sex', 'secret1', 'test',
    'guest', 'master', 'cracker', 'phreak', 'elite', 'eleet', 'owned', 'r00t', 'h4x0r', 'carrier', 'modem', 'wargames'];

//  Whether Crack 4.1 would get pw: a dictionary word, a user's name, or
//  six lowercase letters or fewer
function crackWeak(pw, users) {
    var lw = String(pw).toLowerCase();
    return CRACK_WORDS.indexOf(lw) >= 0 || CRACK_MORE.indexOf(lw) >= 0 || (users || []).indexOf(lw) >= 0 ||
        /^[a-z]{1,6}$/.test(pw);
}

//  Whether a password on num was set after the player last ran Crack
//  there, so another run is worth it
function crackStale(p, seed, num) {
    var by = keepLoad(seed, num).pwBy;
    var at = (p.crackedAt || {})[num] || 0;
    return Object.keys(by).some(function (u) { return by[u][2] > at; });
}

//  The made-up users of a host (as carrier_hosts.js someUsers names them)
function someUsersFor(num, n) {
    var r = rng(hash32(num + '|users'));
    var names = ['jsmith', 'kwong', 'mdavis', 'operator', 'tlee', 'rgarcia', 'bjones', 'admin', 'pmiller',
        'lchen', 'dbrown', 'sclark', 'field', 'nwilson', 'aharris'];
    var out = [];
    for (var i = 0; i < n && names.length; i++) {
        out.push(names.splice(Math.floor(r() * names.length), 1)[0]);
    }
    return out;
}

//  ---- badges (phase 3) ----
//  Kept across seasons in p.badges: { id: 'yyyy-mm-dd' }. test(p) says
//  whether it's earned; cash is paid once when it is.

var BADGES = [
    { id: 'carrier', name: 'First Carrier', about: 'Dial a carrier.', cash: 0,
        test: function (p) { return Object.keys(p.found).some(function (n) { return p.found[n] !== 'C?' && p.found[n] !== 'T?' && !/^(fax|fence)$/.test(p.found[n]); }); } },
    { id: 'in', name: 'You\'re In', about: 'Log into any system.', cash: 10,
        test: function (p) { return Object.keys(p.owned).length > 0; } },
    { id: 'root', name: 'Root', about: 'Root on a UNIX box.', cash: 25, test: function (p) { return ownedKind(p, 'unix', 'p'); } },
    { id: 'system', name: 'SYSTEM', about: 'Privileged on a VAX.', cash: 25, test: function (p) { return ownedKind(p, 'vms', 'p'); } },
    { id: 'primos', name: 'Primos Prime', about: 'Privileged on a Prime.', cash: 25, test: function (p) { return ownedKind(p, 'prime', 'p'); } },
    { id: 'mgr', name: 'MANAGER.SYS', about: 'Privileged on an HP3000.', cash: 25, test: function (p) { return ownedKind(p, 'hp3000', 'p'); } },
    { id: 'craft', name: 'Craft Login', about: 'Log into a PBX maintenance port.', cash: 15, test: function (p) { return ownedKind(p, 'pbx', ''); } },
    { id: 'barrier', name: 'Barrier Broken', about: 'Call through a PBX with a barrier code.', cash: 20, test: function (p) { return (p.disaCalls || 0) > 0; } },
    { id: 'box', name: 'Box of Your Own', about: 'Take a voice mailbox.', cash: 15, test: function (p) { return !!p.vmb; } },
    { id: 'hoard', name: 'Code Hoarder', about: 'Ten codes stashed in voice mail.', cash: 50, test: function (p) { return (p.stash || []).length >= 10; } },
    { id: 'full', name: 'Full Exchange', about: 'Scan all 10,000 numbers of one exchange.', cash: 50,
        test: function (p) { return Object.keys(p.scan || {}).some(function (ex) { return /^f{250}$/.test(p.scan[ex]); }); } },
    { id: 'catalog', name: 'Card Catalog', about: 'A hundred numbers on your found list.', cash: 30, test: function (p) { return Object.keys(p.found).length >= 100; } },
    { id: 'pioneer', name: 'Pioneer', about: 'First to find ten systems.', cash: 40, test: function (p) { return (p.firsts || 0) >= 10; } },
    { id: 'dots', name: 'Connect the Dots', about: 'Dial ten numbers a system\'s files led you to.', cash: 30, test: function (p) { return (p.leadsDialed || 0) >= 10; } },
    { id: 'packet', name: 'Packet Rat', about: 'Find a system on Telenet.', cash: 20,
        test: function (p) { return Object.keys(p.found).some(function (n) { return /^NUA/.test(n); }); } },
    { id: 'club', name: 'Welcome to the Club', about: 'Get busted. Everybody does.', cash: 10, test: function (p) { return !!p.lastBust; } },
    { id: 'ghost', name: 'Ghost', about: 'A week without a bust.', cash: 40,
        test: function (p) { return nowMs() - Math.max(p.lastBust || 0, p.started || nowMs()) >= 7 * 86400000; } },
    { id: 'owl', name: 'Night Owl', about: 'Play between 2 and 5 in the morning.', cash: 10, test: function (p) { return !!p.owl; } },
    { id: 'fence', name: 'Fence\'s Favourite', about: 'Sell fifty pieces of loot.', cash: 75, test: function (p) { return (p.sold || 0) >= 50; } },
    { id: 'wordlist', name: 'Wordlist', about: 'Crack a password file.', cash: 20, test: function (p) { return (p.crackRuns || 0) > 0; } },
    { id: 'tone', name: '2600', about: 'Make a call on a blue box.', cash: 20, test: function (p) { return (p.blueCalls || 0) > 0; } },
    { id: 'quarter', name: 'Quarter Back', about: 'Make a call on a red box.', cash: 10, test: function (p) { return (p.redCalls || 0) > 0; } },
    { id: 'tracks', name: 'Clean Hands', about: 'Cover your tracks on a system.', cash: 20, test: function (p) { return (p.cleaned || 0) > 0; } },
    { id: 'talker', name: 'Smooth Talker', about: 'Talk an admin who caught you into letting you stay.', cash: 30,
        test: function (p) { return (p.bluffs || 0) > 0; } },
    { id: 'wirecenter', name: 'Wire Center', about: 'Get into COSMOS.', cash: 60, test: function (p) { return ownedKind(p, 'cosmos', ''); } },
    { id: 'raider', name: 'Raider', about: 'Help bring down a raid.', cash: 50, test: function (p) { return (p.raids || 0) > 0; } },
    { id: 'mvp', name: 'Ringleader', about: 'Do the most on a raid.', cash: 100, test: function (p) { return (p.raidMVPs || 0) > 0; } },
    { id: 'mabell', name: 'Ma Bell', about: 'Crack the season\'s Switching Control Center first.', cash: 500, test: function (p) { return (p.bossWins || 0) > 0; } },
    { id: 'rat', name: 'Rat', about: 'Tip off the phone company about a rival.', cash: 0, test: function (p) { return (p.tips || 0) > 0; } },
    { id: 'trust', name: 'Trusted Host', about: 'Get into a system through another one\'s trust.', cash: 25, test: function (p) { return (p.hops || 0) > 0; } },
    { id: 'archivist', name: 'Archivist', about: 'Every page of the notebook.', cash: 100, test: function (p) { var n = notesFor(p); return n.stuck === 0 && n.zines === 0; } },
    { id: 'loaded', name: 'Fully Loaded', about: 'Own every piece of durable gear.', cash: 100,
        test: function (p) { return GEAR.every(function (g) { return !g.durable || hasGear(p, g.id); }); } },
    { id: 'legion', name: 'Legion', about: 'Make the top rank.', cash: 250, test: function (p) { return rankOf(p) === 'Legion'; } },
];

function ownedKind(p, kind, level) {
    return Object.keys(p.owned).some(function (n) {
        return p.found[n] === kind && (!level || p.owned[n] === level);
    });
}

//  New badges since last time: added, paid, in the Scene Daily, and returned
function checkBadges(p) {
    p.badges = p.badges || {};
    var h = new Date().getHours();
    if (h >= 2 && h < 5) {
        p.owl = 1;
    }
    var got = [];
    BADGES.forEach(function (b) {
        if (!p.badges[b.id] && b.test(p)) {
            p.badges[b.id] = today();
            p.cash = (p.cash || 0) + b.cash;
            news(p.h, 'earned the ' + b.name + ' badge.');
            got.push(b);
        }
    });
    return got;
}

//  A number from a host's files: onto the found list, still to be dialed.
//  True if it was new to this player.
function addLead(p, num) {
    if (p.found[num]) {
        return false;
    }
    p.found[num] = 'C?';
    p.rep += 2;
    p.leadNums = p.leadNums || {};
    p.leadNums[num] = 1;
    return true;
}

//  ---- codes ----
//  A barrier code: { c, disa (the DISA line it works on), uses }

var CODE_USES = 6;

function addCode(p, code, disa) {
    p.codes = p.codes || [];
    if (p.codes.concat(p.stash || []).some(function (x) { return x.c === code; })) {
        return false;
    }
    p.codes.push({ c: code, disa: disa, uses: CODE_USES });
    return true;
}

//  Use a carried code for one long-distance scan or call. Returns the code
//  and whether it burned: used up, or killed by the phone company when
//  you're hot.
function useCode(p, c) {
    var codes = p.codes || [];
    if (!codes.length) {
        return null;
    }
    codes.sort(function (a, b) { return b.uses - a.uses; });
    if (c) {
        var i = codes.map(function (x) { return x.c; }).indexOf(c);
        if (i < 0) {
            return null;
        }
        codes.unshift(codes.splice(i, 1)[0]);
    }
    var code = codes[0];
    code.uses -= 1;
    var burned = code.uses <= 0 || (p.heat > 70 && Math.random() < 0.4);
    if (burned) {
        codes.shift();
    }
    return { c: code.c, disa: code.disa, uses: code.uses, burned: burned };
}

//  ---- what's been scanned ----

function scanBits(p, ex) {
    var hex = p.scan[ex] || '';
    var bits = [];
    for (var i = 0; i < 250; i++) {
        var v = parseInt(hex.charAt(i) || '0', 16);
        bits.push(v & 8 ? 1 : 0, v & 4 ? 1 : 0, v & 2 ? 1 : 0, v & 1 ? 1 : 0);
    }
    return bits;
}

function markScanned(p, ex, block) {
    var bits = scanBits(p, ex);
    bits[block] = 1;
    var hex = '';
    for (var i = 0; i < 1000; i += 4) {
        hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
    }
    p.scan[ex] = hex.replace(/0+$/, '');
}

//  ---- the Scene Daily ----

function news(handle, text) {
    var t = nowMs();
    v3.data.set('n.' + t + '.' + (v3.user.id || 0), { t: t, h: handle, m: text });
}

//  The newest items first
function readNews(limit) {
    var all = v3.data.getAll();
    var items = [];
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('n.') === 0) {
            items.push({ key: keys[i], v: all[keys[i]] });
        }
    }
    items.sort(function (a, b) { return b.v.t - a.v.t; });
    for (var j = NEWS_KEEP; j < items.length; j++) {
        v3.data.delete(items[j].key);
    }
    return items.slice(0, limit).map(function (x) { return x.v; });
}

//  ---- the leaderboard ----

function leaders() {
    var all = v3.data.getAll();
    var out = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('p.') === 0) {
            var p = all[k];
            out.push({ id: k.slice(2), h: p.h, rep: p.rep, rank: rankOf(p), finds: Object.keys(p.found || {}).length, firsts: p.firsts || 0,
                owned: Object.keys(p.owned || {}).length, busts: (p.busts || []).length });
        }
    });
    out.sort(function (a, b) { return b.rep - a.rep || b.firsts - a.firsts; });
    return out;
}

//  ---- seasons and the Hall of Fame (phase 5) ----
//  A season runs SEASON_DAYS, or until someone cracks the boss. The next
//  one's seed comes from the last, so two nodes rolling it over at once
//  write the same season. hof.<id>: the season's record.

var SEASON_DAYS = 30;

function seasonOver(s) {
    var started = new Date(s.started + 'T00:00:00').getTime();
    return !!s.bossDown || nowMs() - started > SEASON_DAYS * 86400000;
}

//  The season, rolled over to a new one if this one is done
function currentSeason() {
    var s = season();
    if (!seasonOver(s)) {
        return s;
    }
    var all = leaders();
    var raids = [];
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        var st = raidState(s, i);
        if (st.done) raids.push(raidAt(s.seed, i).name + ': ' + st.done.mvp);
    }
    v3.data.set('hof.' + s.id, { id: s.id, started: s.started, ended: today(), top: all[0] ? all[0].h + ' (' + all[0].rep + ' rep)' : '',
        boss: s.bossDown || '', raids: raids });
    var next = { id: s.id + 1, seed: String(hash32(s.seed + '|next|' + (s.id + 1))), started: today() };
    v3.data.set('season', next);
    keepForget();
    news('the scene', 'Season ' + s.id + ' is over' + (s.bossDown ? ': ' + s.bossDown + ' cracked the phone company.' : '.') + ' The network is new.');
    seasonTips(next);
    return next;
}

function hallOfFame() {
    var all = v3.data.getAll();
    return Object.keys(all).filter(function (k) { return k.indexOf('hof.') === 0; })
        .map(function (k) { return all[k]; }).sort(function (a, b) { return b.id - a.id; });
}

//  A new season for a player: this season's finds and score go, the rest
//  stays (badges, gear, cash, the rank title, lifetime totals)
function resetForSeason(p, s) {
    p.life = p.life || { rep: 0, seasons: 0, firsts: 0 };
    p.life.rep += p.rep || 0;
    p.life.firsts += p.firsts || 0;
    p.life.seasons += 1;
    p.rankFloor = rankOf(p);
    p.rep = 0;
    p.firsts = 0;
    p.found = {};
    p.owned = {};
    p.loot = {};
    p.scan = {};
    p.codes = [];
    p.stash = [];
    p.vmb = null;
    p.wares = [];
    p.cracked = {};
    p.jobs = [];
    p.leadNums = {};
    p.raidsClaimed = {};
    p.bossLogin = null;
    p.season = s.id;
    upgradePlayer(p, s.seed);
}

//  ---- raids (phase 5) ----
//  Four a season, one after another. Each needs pieces from different
//  callers: its dial-in (find the number), an account (a piece of loot of
//  the right kind) and some barrier codes. Every contribution is its own
//  key, rc.<season>.<raid>.<ms>.<user id>.<random> = { h, piece }, so two nodes
//  can't drop each other's; rd.<season>.<raid> marks one done. Rewards are
//  claimed by each contributor on their next visit.

var RAIDS_PER_SEASON = 4;
var RAID_TARGETS = [
    { name: 'The Lost City', what: 'an elite board that never answers for strangers', kind: 'bbs', ware: 'a UUCP L.sys file' },
    { name: 'Operation Night Owl', what: 'a phone company billing VAX', kind: 'vms', ware: 'the SYSUAF account list' },
    { name: 'Granite Mainframe', what: 'Granite Aerospace\'s mainframe', kind: 'hp3000', ware: 'the account report' },
    { name: 'Operation Ma Bell', what: 'the login to the phone company\'s Switching Control Center', kind: 'unix', ware: '/etc/passwd' },
];

//  Raid i of a season: its target number (a carrier in a named exchange),
//  the loot it needs and how many codes
function raidAt(seed, i) {
    var t = RAID_TARGETS[i];
    var r = rng(hash32(seed + '|raid|' + i));
    for (var tries = 0; tries < 400; tries++) {
        var npa = NPAS[Math.floor(r() * NPAS.length)][0];
        var nxx = String(200 + Math.floor(r() * 800));
        var prof = exchangeProfile(seed, npa, nxx);
        if (!prof || prof === 'res') continue;
        for (var l = 0; l < 3000; l++) {
            var line = ('000' + l).slice(-4);
            if (lineResult(seed, npa, nxx, line).result === 'CARRIER') {
                return { i: i, name: t.name, what: t.what, num: npa + nxx + line, npa: npa, nxx: nxx, ware: t.ware, codes: 2 + i, boss: i === RAIDS_PER_SEASON - 1 };
            }
        }
    }
    return null;
}

//  Where a raid stands: { dial, acct, codes, by: { handle: pieces }, done }
function raidState(s, i) {
    var all = v3.data.getAll();
    var pre = 'rc.' + s.id + '.' + i + '.';
    var st = { dial: '', acct: '', codes: 0, by: {}, done: all['rd.' + s.id + '.' + i] || null };
    Object.keys(all).sort().forEach(function (k) {
        if (k.indexOf(pre) !== 0) return;
        var c = all[k];
        if (c.piece === 'dial' && !st.dial) st.dial = c.h;
        else if (c.piece === 'acct' && !st.acct) st.acct = c.h;
        else if (c.piece === 'code') st.codes++;
        else return;
        st.by[c.h] = (st.by[c.h] || 0) + 1;
    });
    return st;
}

//  The raid open now: the first not yet done, or -1 when all are
function openRaid(s) {
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        if (!raidState(s, i).done) return i;
    }
    return -1;
}

function contribute(p, s, i, piece) {
    //  the time, the caller and a random tail: two pieces never share a key
    v3.data.set('rc.' + s.id + '.' + i + '.' + nowMs() + '.' + v3.user.id + '.' + v3.util.random(1000000), { h: p.h, piece: piece });
}

//  Whether raid i has every piece; if so, marks it done (once) and says so
function raidComplete(p, s, i) {
    var raid = raidAt(s.seed, i);
    var st = raidState(s, i);
    if (st.done || !st.dial || !st.acct || st.codes < raid.codes) {
        return !!st.done;
    }
    var mvp = Object.keys(st.by).sort(function (a, b) { return st.by[b] - st.by[a]; })[0];
    v3.data.set('rd.' + s.id + '.' + i, { at: today(), mvp: mvp });
    news('the scene', raid.name + ' went down. ' + Object.keys(st.by).length + ' callers did it; ' + mvp + ' did the most.');
    return true;
}

var RAID_REP = 60, RAID_CASH = 40;

//  Rewards for raids this player helped finish: [{ raid, pieces, rep, cash }]
function claimRaids(p, s) {
    p.raidsClaimed = p.raidsClaimed || {};
    var got = [];
    for (var i = 0; i < RAIDS_PER_SEASON; i++) {
        var key = s.id + '.' + i;
        if (p.raidsClaimed[key]) continue;
        var st = raidState(s, i);
        var n = st.by[p.h] || 0;
        if (!st.done || !n) continue;
        p.raidsClaimed[key] = 1;
        var raid = raidAt(s.seed, i);
        var g = { raid: raid, pieces: n, rep: RAID_REP * n, cash: RAID_CASH * n, mvp: st.done.mvp === p.h };
        p.rep += g.rep;
        p.cash = (p.cash || 0) + g.cash;
        p.raids = (p.raids || 0) + 1;
        if (g.mvp) p.raidMVPs = (p.raidMVPs || 0) + 1;
        if (raid.boss) {
            p.bossLogin = bossLogin(s.seed);
        }
        got.push(g);
    }
    return got;
}

//  The boss falls: the first caller in wins the season. True if it was you.
function bossDown(p) {
    var s = season();
    if (s.bossDown) {
        return false;
    }
    s.bossDown = p.h;
    v3.data.set('season', s);
    p.bossWins = (p.bossWins || 0) + 1;
    news(p.h, 'cracked the phone company\'s Switching Control Center. The season is theirs.');
    return true;
}

//  ---- rivals (phase 5) ----
//  A tip to the phone company about a rival (tip.<their id>.<ms>), or a code
//  given to someone (gift.<their id>.<ms>): each lands when they next play.

var TIP_COST = 50;

function tipOff(p, rivalId, rivalHandle) {
    if ((p.cash || 0) < TIP_COST) {
        return 'A tip costs $' + TIP_COST + '. You have $' + (p.cash || 0) + '.';
    }
    p.cash -= TIP_COST;
    if (Math.random() < 0.3) {
        addHeat(p, 20);
        news('the scene', p.h + ' tried to rat out ' + rivalHandle + '. It came back on them.');
        return 'It came back on you. Heat +20.';
    }
    v3.data.set('tip.' + rivalId + '.' + nowMs(), { from: p.h });
    p.tips = (p.tips || 0) + 1;
    return 'The phone company has a new name on its list: ' + rivalHandle + '.';
}

function giveCode(p, toId, toHandle) {
    if (!(p.codes || []).length) {
        return 'You aren\'t carrying any codes.';
    }
    var code = p.codes.shift();
    v3.data.set('gift.' + toId + '.' + nowMs(), { from: p.h, code: code });
    return 'Code ' + code.c + ' is on its way to ' + toHandle + '.';
}

//  Tips and gifts waiting for this player: applied, removed, and returned
function collectMail(p) {
    var all = v3.data.getAll();
    var mine = v3.user.id;
    var notes = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('tip.' + mine + '.') === 0) {
            addHeat(p, 20);
            notes.push('Somebody tipped off the phone company about you. Heat +20.');
            news('the scene', 'Somebody tipped off the phone company about ' + p.h + '.');
            v3.data.delete(k);
        } else if (k.indexOf('gift.' + mine + '.') === 0) {
            var g = all[k];
            if (addCode(p, g.code.c, g.code.disa)) {
                notes.push(g.from + ' sent you code ' + g.code.c + ' for ' + fmtNum(g.code.disa) + '.');
            }
            v3.data.delete(k);
        }
    });
    return notes.concat(keepNotices(p));
}
