//
//  CTFs (phase 6, step 6): a season's chain of flags across the network.
//  A flag is a file on a host; reading it records it, and its text points
//  at the next. The first reader of each flag gets full rep and cash, later
//  readers less, and the first to read them all goes in the Hall of Fame.
//  If nobody finds the next flag for a few days, the Scene Daily drops a
//  hint, then a stronger one.
//
//  A CTF is data: CTF_BUILTIN below, or a sysop's own JSON file in
//  scripts/data/carrier/ctf/ (one a season, in turn by name; the door's
//  ctf=<name> setting picks one, ctf=off turns them off). docs/ctf.md has
//  the format. The network is new each season, so a flag names the kind of
//  host it wants, and each season finds one from its seed:
//    host: { kind: 'unix', prof: 'edu' }   a carrier of that kind there
//          { lead: 1, kind: 'unix' }        one the first flag's host calls
//                                           (its Systems or L.sys)
//          { num: '6172530042' }            a fixed number (a landmark)
//    place: 'file' (default), 'plan' (a staff member's .plan, UNIX) or
//           'strings' (inside a program at path; strings shows it)
//    path, priv (only root or SYSTEM can read it), encode ('plain' or
//    'rot13'), text, hint1, hint2, rep, cash
//  Text may use {flag} and, for flag N, {num.N} {name.N} {user.N} {path.N}.
//
//  In v3.data:
//    ctf.<seed>.<id>  { f: { i: [[uid, handle, ms]] }, hinted: { i: level },
//                     told: true once the start is in the Scene Daily,
//                     winner: handle }
//    ctfh.<seed>      the day the hints were last looked at
//    ctfwin.<season>  { title, h }: who finished first, for the Hall of Fame
//  A player's own: p.ctf = { id: [flag indexes they've read] }
//

var CTF_BUILTIN = {
    id: 'longdistance',
    title: 'Long Distance',
    bonus: 150,
    start: 'There\'s a CTF on this season: "Long Distance", five flags. The first is in uucppublic on a university UNIX box, {num.1}.',
    flags: [
        {
            host: { kind: 'unix', prof: 'edu' }, path: '/usr/spool/uucppublic/.flag',
            text: '{flag}\n\nThat\'s the first.  The second is on the machine this one calls every\nnight.  uucp keeps the list; root or uucp can read it.\n',
            hint1: 'CTF "Long Distance": the first flag is in /usr/spool/uucppublic on {num.1}. Look for a dot file.',
            hint2: 'CTF "Long Distance": ls -a /usr/spool/uucppublic on {name.1}, {num.1}.',
        },
        {
            host: { lead: 1, kind: 'unix' }, path: '/etc/.flag', priv: true, encode: 'rot13',
            text: '{flag}\n\nTwo down.  The third is in a .plan: {user.3} on {name.3}, {num.3}.\n',
            hint1: 'CTF "Long Distance": flag two is where only root can read it, on the machine {name.1} calls at night.',
            hint2: 'CTF "Long Distance": flag two is a dot file in /etc on {num.2}. It isn\'t in English: try ROT13.',
        },
        {
            host: { kind: 'unix', prof: 'biz' }, place: 'plan',
            text: '{flag}\nThree.  The fourth is inside a program: strings /usr/local/bin/scan on {name.4}, {num.4}.\n',
            hint1: 'CTF "Long Distance": flag three is in somebody\'s .plan on a company UNIX box.',
            hint2: 'CTF "Long Distance": finger {user.3} on {num.3}.',
        },
        {
            host: { kind: 'unix', prof: 'gov' }, place: 'strings', path: '/usr/local/bin/scan',
            text: '{flag}\nfour of five\nlast: the VAX at {num.5}, DUA0:[PUBLIC]FLAG.TXT\n',
            hint1: 'CTF "Long Distance": flag four is inside a program on a government UNIX box.',
            hint2: 'CTF "Long Distance": strings /usr/local/bin/scan on {num.4}.',
        },
        {
            host: { kind: 'vms', prof: 'edu' }, path: '/PUBLIC/FLAG.TXT',
            text: '{flag}\n\nThat\'s all five.  Nice work.\n',
            hint1: 'CTF "Long Distance": the last flag is on a university VAX.',
            hint2: 'CTF "Long Distance": TYPE DUA0:[PUBLIC]FLAG.TXT on {num.5}.',
        },
    ],
};

var CTF_SHARE = [1, 0.6, 0.3];
var CTF_HINT_DAYS = [3, 6];
var CTF_CACHE = {};

//  The season a call is in
function ctfSeasonOf(ctx) {
    if (ctx.season) return ctx.season;
    if (typeof SEASON !== 'undefined' && SEASON && SEASON.seed === ctx.seed) return SEASON;
    return null;
}

//  A player's flags in this season's CTF
function ctfMine(p, seed, c) {
    p.ctf = p.ctf || {};
    var k = seed + '.' + c.id;
    p.ctf[k] = p.ctf[k] || [];
    return p.ctf[k];
}

function ctfSetting() {
    return typeof SETTINGS !== 'undefined' && SETTINGS.ctf ? String(SETTINGS.ctf) : '';
}

//  The season's CTF, or null when they're off or none is usable
function ctfOf(season) {
    var key = season.id + '|' + season.seed;
    if (CTF_CACHE[key] !== undefined) return CTF_CACHE[key];
    var want = ctfSetting();
    var ctf = null;
    if (want.toLowerCase() !== 'off') {
        var files = [];
        try {
            files = (v3.fs.list('carrier/ctf') || []).filter(function (f) { return !f.isDir && /\.json$/i.test(f.name); })
                .map(function (f) { return f.name; }).sort();
        } catch (e) {
            files = [];
        }
        var name = want ? want.replace(/\.json$/i, '') + '.json' : files.length ? files[(season.id - 1) % files.length] : '';
        if (name && files.indexOf(name) >= 0) {
            try {
                ctf = ctfCheck(JSON.parse(v3.fs.read('carrier/ctf/' + name)));
            } catch (e) {
                ctf = null;
            }
        }
        if (!ctf) ctf = CTF_BUILTIN;
    }
    if (ctf) ctf = ctfPlaced(season.seed, ctf);
    CTF_CACHE[key] = ctf;
    return ctf;
}

//  The season's placement, worked out once and kept (finding hosts for the
//  flags scans the network): ctfr.<seed>.<id> holds each flag's host
function ctfPlaced(seed, c) {
    var key = 'ctfr.' + seed + '.' + c.id;
    var kept = v3.data.get(key);
    var sig = String(hash32(JSON.stringify(c.flags)));
    if (kept && kept.sig === sig) {
        kept = JSON.parse(JSON.stringify(kept));
        var out = { id: c.id, title: c.title, bonus: c.bonus || 150, start: c.start || '', flags: [] };
        c.flags.forEach(function (f, i) {
            var k = kept.flags[i] || {};
            out.flags.push({ i: i, spec: f, num: k.num || '', kind: k.kind || '', prof: k.prof || '', name: k.name || '', user: k.user || '', path: k.path || f.path || '' });
        });
        return out;
    }
    var r = ctfResolve(seed, c);
    v3.data.set(key, { sig: sig, flags: r.flags.map(function (f) { return { num: f.num, kind: f.kind, prof: f.prof, name: f.name, user: f.user, path: f.path }; }) });
    return r;
}

//  A sysop's CTF, checked enough not to break the game: null if it won't do
function ctfCheck(c) {
    if (!c || !/^[a-z0-9_-]{1,24}$/i.test(String(c.id || '')) || !c.flags || !c.flags.length || c.flags.length > 12) return null;
    for (var i = 0; i < c.flags.length; i++) {
        var f = c.flags[i];
        if (!f || !f.host || typeof f.text !== 'string') return null;
        if (f.host.lead && !(f.host.lead >= 1 && f.host.lead <= i)) return null;
        if ((f.place || 'file') !== 'plan' && !/^\/[^\s]+$/.test(String(f.path || ''))) return null;
    }
    c.title = String(c.title || c.id).slice(0, 40);
    return c;
}

//  A lead of host num of kind, not taken yet: '' if it has none
function ctfLeadOf(seed, num, kind, prof, taken) {
    var res = lineResult(seed, num.slice(0, 3), num.slice(3, 6), num.slice(6));
    return hostLeads(seed, hostAt(seed, num, res.kind, prof), 3).filter(function (n) {
        return !taken[n] && n !== num && lineResult(seed, n.slice(0, 3), n.slice(3, 6), n.slice(6)).kind === kind;
    })[0] || '';
}

//  A carrier of kind in an exchange of profile prof, from r, that a caller
//  can get into (it has an account the network left open). leadKind: a
//  later flag is on a machine this one calls, so it must call one of those.
function ctfPick(seed, r, kind, prof, taken, leadKind) {
    for (var t = 0; t < 400; t++) {
        var npa = SEASON_NPAS[Math.floor(r() * SEASON_NPAS.length)][0];
        var nxx = String(200 + Math.floor(r() * 800));
        if (exchangeProfile(seed, npa, nxx) !== prof || SPECIAL_EXCHANGES[npa + nxx]) continue;
        var start = Math.floor(r() * 9000);
        for (var l = start; l < start + 800; l++) {
            var num = npa + nxx + ('000' + l).slice(-4);
            var res = lineResult(seed, npa, nxx, num.slice(6));
            if (res.result !== 'CARRIER' || res.kind !== kind || taken[num] || landmarkAt(num)) continue;
            var h = hostAt(seed, num, kind, prof);
            if (!h.accounts.some(function (a) { return !a[2]; })) continue;
            if (leadKind && !ctfLeadOf(seed, num, leadKind, prof, taken)) continue;
            return num;
        }
    }
    return '';
}

//  Each flag's host for this season: { num, kind, prof, name, user, path }
function ctfResolve(seed, c) {
    var out = { id: c.id, title: c.title, bonus: c.bonus || 150, start: c.start || '', flags: [] };
    var taken = {};
    //  the kind of machine a later flag needs each flag's host to call
    var needs = {};
    c.flags.forEach(function (f) {
        if (f.host.lead) needs[f.host.lead - 1] = f.host.kind || 'unix';
    });
    c.flags.forEach(function (f, i) {
        var r = rng(hash32(seed + '|ctf|' + c.id + '|' + i));
        var num = '';
        var kind = f.host.kind || 'unix';
        if (f.host.num) {
            num = String(f.host.num);
            var lr = lineResult(seed, num.slice(0, 3), num.slice(3, 6), num.slice(6));
            kind = lr.kind || kind;
        } else if (f.host.lead) {
            var from = out.flags[f.host.lead - 1];
            num = from && from.num ? ctfLeadOf(seed, from.num, kind, from.prof, taken) : '';
            //  a fixed number with no such lead: one like it, somewhere
            if (!num) num = ctfPick(seed, r, kind, from ? from.prof : 'edu', taken, needs[i]);
        } else {
            num = ctfPick(seed, r, kind, f.host.prof || 'edu', taken, needs[i]);
        }
        var fl = { i: i, spec: f, num: num, kind: kind, prof: '', name: '', user: '', path: f.path || '' };
        if (num) {
            taken[num] = true;
            fl.prof = exchangeProfile(seed, num.slice(0, 3), num.slice(3, 6));
            var h = hostAt(seed, num, kind, fl.prof);
            fl.name = h.name;
            if ((f.place || 'file') === 'plan' && kind === 'unix') {
                var w = unixWorld({ host: h, seed: seed, ov: { pw: {} } });
                fl.user = w.planUsers[0] || w.peers[0] || w.boss;
                fl.path = unixHome(w, fl.user) + '/.plan';
            }
        }
        out.flags.push(fl);
    });
    return out;
}

//  A flag's token: the same for everyone this season
function ctfToken(seed, c, i) {
    return 'CTF{' + (hash32(seed + '|flag|' + c.id + '|' + i) >>> 0).toString(16) + '}';
}

function ctfRender(seed, c, text, i) {
    return String(text || '').replace(/\{(flag|num|name|user|path)(?:\.(\d+))?\}/g, function (all, what, n) {
        if (what === 'flag') return ctfToken(seed, c, i);
        var f = c.flags[(parseInt(n, 10) || i + 1) - 1];
        if (!f) return all;
        return what === 'num' ? (f.num ? fmtNum(f.num) : '?') : f[what] || '?';
    });
}

function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function (ch) {
        var b = ch <= 'Z' ? 65 : 97;
        return String.fromCharCode((ch.charCodeAt(0) - b + 13) % 26 + b);
    });
}

//  The paths flags hold on the host: what players can't change for good
function ctfPaths(ctx) {
    var season = ctfSeasonOf(ctx);
    if (!season) return [];
    var c = ctfOf(season);
    if (!c) return [];
    return c.flags.filter(function (f) { return f.num === ctx.host.num && f.path; }).map(function (f) { return f.path; });
}

//  The host's flags, put in its tree: called after the tree is built
function ctfTree(ctx, root) {
    var season = ctfSeasonOf(ctx);
    if (!season) return;
    var c = ctfOf(season);
    if (!c) return;
    c.flags.forEach(function (f, i) {
        if (f.num !== ctx.host.num || !f.path) return;
        var sp = f.spec;
        var text = ctfRender(ctx.seed, c, sp.text, i);
        if (sp.encode === 'rot13') text = rot13(text);
        var vms = ctx.host.kind !== 'unix';
        var own = sp.priv ? (vms ? 'SYSTEM' : 'root') : (sp.place === 'plan' ? f.user : vms ? 'SYSTEM' : 'bin');
        var mode = sp.priv ? 'rw-------' : 'rw-r--r--';
        var node;
        if (sp.place === 'strings') {
            node = fsExec(own, own, 24000 + hash32(f.path) % 9000, text.split('\n').filter(function (l) { return l; }), fsDate(9));
            node.mode = sp.priv ? 'rwx------' : 'rwxr-xr-x';
        } else {
            node = fsFile(own, sp.place === 'plan' ? 'staff' : own, mode, text, fsDate(9));
        }
        node.repeat = true;
        node.ctf = true;
        node.onRead = function (cx, io) { ctfFound(cx, io, i); };
        //  through a link on the way (a NeXT's /etc)
        fsPut(root, fsReal({ root: root }, f.path), node);
    });
}

function ctfState(seed, c) {
    var s = keepGet('ctf.' + seed + '.' + c.id, null) || {};
    s.f = s.f || {};
    s.hinted = s.hinted || {};
    return s;
}

//  The caller has read flag i
function ctfFound(ctx, io, i) {
    var season = ctfSeasonOf(ctx);
    var c = season ? ctfOf(season) : null;
    if (!c || !c.flags[i]) return;
    var p = ctx.p;
    var mine = ctfMine(p, ctx.seed, c);
    if (mine.indexOf(i) >= 0) return;
    mine.push(i);
    var key = 'ctf.' + ctx.seed + '.' + c.id;
    var st = ctfState(ctx.seed, c);
    var before = (st.f[i] || []).length;
    st.f[i] = (st.f[i] || []).concat([[String(v3.user.id), p.h, nowMs()]]);
    var share = CTF_SHARE[Math.min(before, CTF_SHARE.length - 1)];
    var rep = Math.round((c.flags[i].spec.rep || 40) * share);
    var cash = Math.round((c.flags[i].spec.cash || 25) * share);
    p.rep += rep;
    p.cash = (p.cash || 0) + cash;
    io.reward(rep, 'CTF "' + c.title + '", flag ' + (i + 1) + ' of ' + c.flags.length + (before ? '' : ', the first to find it') + ', and $' + cash);
    if (!before) news(p.h, 'found flag ' + (i + 1) + ' of ' + c.flags.length + ' in the CTF "' + c.title + '" first.');
    if (mine.length === c.flags.length) {
        var won = !st.winner;
        var bonus = won ? c.bonus : Math.round(c.bonus / 3);
        p.rep += bonus;
        io.reward(bonus, 'every flag in the CTF "' + c.title + '"' + (won ? ', the first to finish' : ''));
        if (won) {
            st.winner = p.h;
            v3.data.set('ctfwin.' + season.id, { title: c.title, h: p.h });
            news(p.h, 'finished the CTF "' + c.title + '" first. That\'s the Hall of Fame.');
        }
    }
    v3.data.set(key, st);
}

//  Once a day: the start in the Scene Daily, then hints for the flag
//  nobody has found yet once it has been a while
function ctfHints(season) {
    var c = ctfOf(season);
    if (!c) return;
    var day = today();
    var dk = 'ctfh.' + season.seed;
    if (v3.data.get(dk) === day) return;
    v3.data.set(dk, day);
    var key = 'ctf.' + season.seed + '.' + c.id;
    var st = ctfState(season.seed, c);
    if (!st.told && c.start) {
        news('the scene', ctfRender(season.seed, c, c.start, 0));
        st.told = true;
    }
    for (var i = 0; i < c.flags.length; i++) {
        if ((st.f[i] || []).length) continue;
        var since = i === 0 ? new Date(season.started + 'T00:00:00').getTime() : ((st.f[i - 1] || [])[0] || [0, 0, 0])[2];
        if (i > 0 && !since) break;
        var days = (nowMs() - since) / 86400000;
        var level = days >= CTF_HINT_DAYS[1] ? 2 : days >= CTF_HINT_DAYS[0] ? 1 : 0;
        var had = st.hinted[i] || 0;
        if (level > had) {
            var h = c.flags[i].spec['hint' + level];
            if (h) news('the scene', ctfRender(season.seed, c, h, i));
            st.hinted[i] = level;
        }
        break;
    }
    v3.data.set(key, st);
}

//  How a player stands in this season's CTF: [found, of]
function ctfProgress(p, season) {
    var c = ctfOf(season);
    if (!c) return null;
    return [ctfMine(p, season.seed, c).length, c.flags.length, c.title];
}
