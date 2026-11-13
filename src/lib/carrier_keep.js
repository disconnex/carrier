//
//  Persistence (phase 6, step 3): what players change on a host lasts, for
//  everyone who calls it after them, until the season ends. The generated
//  host is built from the seed as before; the changes are laid over it.
//
//  In v3.data, per season seed:
//    k.<seed>.<num>   the host's changes: { p: { path: entry },
//                     by: { path: [uid, handle, ms] }, pw: { user: password },
//                     pwBy: { user: [uid, handle, ms] },
//                     acc: { USER: [password, privileged] } (accounts players
//                     added: AUTHORIZE, EDIT_PROFILE, NEWUSER),
//                     h: [kind, profile, name, org] (for the sweep),
//                     note: the security notice the admins put up }
//    ksw.<seed>       the day the admins last swept
//    km.<seed>.<num>  mail players sent there: [{ to, from, subj, body, at }]
//    ko.<seed>.<num>  who was on lately: [{ u, id, tty, on, off }]
//    kp.<seed>.<uid>  a player's changes, oldest first: [[num, path, ms]]
//    kw.<seed>.<num>  messages between players on the host now (write,
//                     PHONE, MESSAGE, TELL): [{ to, from, tty, m, at, id }]
//    kn.<uid>.<ms>.<rand>  a notice for a player: "your account on X is gone"
//
//  An entry is a directory { d: 1, o, g, m, t }, a file { o, g, m, t, x }
//  (x its text), a program or data file { o, g, m, t, y, z, s } (its type,
//  size and strings), a link { l } or a removal { rm: 1 }: owner, group,
//  mode, date as ls shows it.
//

var KEEP_FILES = 16;
var KEEP_BYTES = 8192;
var KEEP_PLANTED = 20;
var KEEP_MAIL = 10;
var KEEP_SEEN = 8;
//  a caller whose hangup wasn't seen counts as on for this long
var KEEP_ON_MS = 15 * 60000;

function keepKey(seed, num) {
    return 'k.' + seed + '.' + num;
}

//  A stored value, copied: v3.data hands back Go-backed values whose arrays
//  don't grow
function keepGet(key, dflt) {
    var v = v3.data.get(key);
    return v ? JSON.parse(JSON.stringify(v)) : dflt;
}

function keepLoad(seed, num) {
    var ov = keepGet(keepKey(seed, num), null) || {};
    ov.p = ov.p || {};
    ov.by = ov.by || {};
    ov.pw = ov.pw || {};
    ov.pwBy = ov.pwBy || {};
    ov.acc = ov.acc || {};
    return ov;
}

//  What the sweep needs to know about the host, kept with its changes
function keepMeta(ctx, ov) {
    var h = ctx.host;
    ov.h = [h.kind, h.prof || 'biz', h.name, h.org || ''];
}

function keepStore(seed, num, ov) {
    if (!Object.keys(ov.p).length && !Object.keys(ov.pw).length && !Object.keys(ov.acc).length && !ov.note) {
        v3.data.delete(keepKey(seed, num));
        return;
    }
    v3.data.set(keepKey(seed, num), ov);
}

function keepDepth(path) {
    return fsSplit(path).length;
}

//  The host's changes laid over its generated tree, shallowest first
function keepApply(fs, ov) {
    Object.keys(ov.p).sort(function (a, b) { return keepDepth(a) - keepDepth(b); }).forEach(function (path) {
        var e = ov.p[path];
        var parts = fsSplit(path);
        if (!parts.length) return;
        if (e.rm) {
            var look = fsLook(fs, '/', path, { root: true }, true);
            if (look.node && look.parent) delete look.parent.kids[look.name];
            return;
        }
        var node;
        if (e.l) {
            node = { link: e.l };
        } else if (e.d) {
            var have = fsLook(fs, '/', path, { root: true }, true).node;
            if (have && have.dir) {
                have.own = e.o; have.grp = e.g; have.mode = e.m; have.mt = e.t;
                return;
            }
            node = fsDir(e.o, e.g, e.m, e.t);
        } else {
            node = fsFile(e.o, e.g, e.m, e.x || '', e.t, e.y);
            if (e.y) {
                node.size = e.z;
                node.strs = e.s || [];
            }
            //  what the generated file did when read (loot, a lead) it
            //  still does
            var was = fsLook(fs, '/', path, { root: true }, true).node;
            if (was && !was.dir && !was.link) {
                node.onRead = was.onRead;
                node.repeat = was.repeat;
                node.dev = was.dev;
                //  an MPE system log stays a log; a VMS file keeps its version
                node.log = was.log;
                node.code = was.code;
                node.ver = was.ver;
            }
        }
        fsPut(fs.root, path, node);
    });
}

//  The entry that records what is at path now
function keepEntry(fs, path) {
    var look = fsLook(fs, '/', path, { root: true }, true);
    var n = look.node;
    if (!n) return { rm: 1 };
    if (n.link) return { l: n.link };
    if (n.dir) return { d: 1, o: n.own, g: n.grp, m: n.mode, t: n.mt };
    if (n.type !== 'text') {
        //  a program or data: its kind, size and strings, not its bytes
        return { o: n.own, g: n.grp, m: n.mode, t: n.mt, y: n.type, z: fsSize(n), s: n.strs || [] };
    }
    return { o: n.own, g: n.grp, m: n.mode, t: n.mt, x: fsText(n) };
}

//  Marks a path the caller changed, to be kept when the command is done
function keepMark(fs, path) {
    if (!fs.keep) return;
    fs.keep.dirty[fsReal(fs, fsAbs('/', path, fs.home))] = true;
}

function keepBytes(ov) {
    var n = 0;
    Object.keys(ov.p).forEach(function (k) { n += k.length + (ov.p[k].x || '').length; });
    return n;
}

//  Sets up a host's tree to keep what the caller changes. pristine() builds
//  the host as generated, to tell a removed generated file from a removed
//  file a player made.
function keepOpen(ctx, fs, pristine) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    keepApply(fs, ov);
    fs.keep = { ctx: ctx, dirty: {}, pristine: pristine, gen: null };
    return ov;
}

//  Whether the generated host has something at path
function keepGenerated(fs, path) {
    if (!fs.keep.gen) fs.keep.gen = fs.keep.pristine();
    return !!fsLook(fs.keep.gen, '/', path, { root: true }, true).node;
}

//  Keeps what the last command changed. Returns '' or 'full' when the host
//  has no room for it (it then lasts only the call).
function keepSave(fs) {
    var k = fs.keep;
    if (!k) return '';
    var paths = Object.keys(k.dirty);
    if (!paths.length) return '';
    k.dirty = {};
    var ctx = k.ctx;
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var me = [String(v3.user.id), ctx.p.h, nowMs()];
    var lost = {};
    paths.forEach(function (path) {
        var e = keepEntry(fs, path);
        var prev = ov.by[path];
        if (prev && prev[0] !== me[0]) lost[prev[0]] = path;
        //  a removal takes what was kept under it with it
        if (e.rm) {
            Object.keys(ov.p).forEach(function (q) {
                if (q.indexOf(path + '/') === 0) { delete ov.p[q]; delete ov.by[q]; }
            });
            if (!keepGenerated(fs, path)) {
                delete ov.p[path];
                delete ov.by[path];
                return;
            }
        }
        ov.p[path] = e;
        ov.by[path] = me;
    });
    if (Object.keys(ov.p).length > KEEP_FILES || keepBytes(ov) > KEEP_BYTES) {
        return 'full';
    }
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    Object.keys(lost).forEach(function (uid) {
        keepNotice(uid, 'Something you left on ' + ctx.host.name + ' (' + lost[uid] + ') has been changed.');
    });
    keepPlanted(ctx, paths.filter(function (p) { return ov.p[p]; }));
    return '';
}

//  A player's own list of changes, kept to KEEP_PLANTED: the oldest goes
//  back to what the host had
function keepPlanted(ctx, paths) {
    if (!paths.length) return;
    var key = 'kp.' + ctx.seed + '.' + v3.user.id;
    var list = keepGet(key, []).filter(function (x) {
        return !(x[0] === ctx.host.num && paths.indexOf(x[1]) >= 0);
    });
    paths.forEach(function (p) { list.push([ctx.host.num, p, nowMs()]); });
    while (list.length > KEEP_PLANTED) {
        var old = list.shift();
        var ov = keepLoad(ctx.seed, old[0]);
        if (ov.by[old[1]] && ov.by[old[1]][0] === String(v3.user.id)) {
            delete ov.p[old[1]];
            delete ov.by[old[1]];
            keepStore(ctx.seed, old[0], ov);
        }
    }
    v3.data.set(key, list);
}

//  A notice for a player's next game; heat and rep come with it
function keepNotice(uid, text, heat, rep) {
    v3.data.set('kn.' + uid + '.' + nowMs() + '.' + v3.util.random(1000000), { m: text, heat: heat || 0, rep: rep || 0 });
}

//  Notices waiting for this player: what they bring applied to p, removed,
//  and returned
function keepNotices(p) {
    var all = v3.data.getAll();
    var out = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('kn.' + v3.user.id + '.') === 0) {
            var n = all[k];
            if (p && n.heat) addHeat(p, n.heat);
            if (p && n.rep) p.rep += n.rep;
            out.push(n.m);
            v3.data.delete(k);
        }
    });
    return out;
}

//  ---- passwords ----

//  Sets user's password on the host, as root does with passwd
function keepSetPassword(ctx, user, pw) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var prev = ov.pwBy[user];
    if (prev && prev[0] !== String(v3.user.id)) {
        keepNotice(prev[0], 'The ' + user + ' password you set on ' + ctx.host.name + ' doesn\'t work any more.');
    }
    ov.pw[user] = pw;
    ov.pwBy[user] = [String(v3.user.id), ctx.p.h, nowMs()];
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    if (ctx.ov) ctx.ov.pw[user] = pw;
}

//  A host's accounts as they are now: passwords players set put in, and
//  the accounts players added. fold: names don't care about case (VMS,
//  PRIMOS, MPE), and are kept upper case.
function keepAccounts(ctx, list, fold) {
    var ov = ctx.ov || keepLoad(ctx.seed, ctx.host.num);
    var norm = function (n) { return fold ? String(n).toUpperCase() : String(n); };
    var out = list.map(function (a) {
        var pw = ov.pw[norm(a[0])];
        return pw !== undefined ? [a[0], pw, a[2]] : a;
    });
    Object.keys(ov.acc).forEach(function (n) {
        out = out.filter(function (a) { return norm(a[0]) !== n; });
        out.push([n, ov.acc[n][0], !!ov.acc[n][1]]);
    });
    return out;
}

//  Adds an account to the host, or changes the password of one a player
//  added
function keepAddAccount(ctx, name, pw, priv) {
    var ov = keepLoad(ctx.seed, ctx.host.num);
    var prev = ov.pwBy[name];
    if (ov.acc[name] && prev && prev[0] !== String(v3.user.id)) {
        keepNotice(prev[0], 'The ' + name + ' account you left on ' + ctx.host.name + ' has been changed.');
    }
    ov.acc[name] = [pw, !!priv];
    ov.pwBy[name] = [String(v3.user.id), ctx.p.h, nowMs()];
    keepMeta(ctx, ov);
    keepStore(ctx.seed, ctx.host.num, ov);
    if (ctx.ov) ctx.ov.acc[name] = [pw, !!priv];
}

//  Adds lines to the end of a log file the system keeps (sulog, OPERATOR.LOG),
//  keeping the last max of them, and marks it to be kept
function keepLog(fs, path, lines, max) {
    var look = fsLook(fs, '/', path, { root: true });
    if (!look.node || look.node.dir) return;
    var have = fsText(look.node).split('\n').filter(function (l) { return l; });
    look.node.text = have.concat(lines).slice(-(max || 40)).join('\n') + '\n';
    look.node.type = 'text';
    delete look.node.size;
    keepMark(fs, look.path);
}

//  ---- who was on ----

function keepSeen(seed, num) {
    return keepGet('ko.' + seed + '.' + num, []);
}

//  Records the caller on the host as user; returns their entry's index
function keepOn(ctx, user, tty) {
    var key = 'ko.' + ctx.seed + '.' + ctx.host.num;
    var list = keepSeen(ctx.seed, ctx.host.num);
    list.push({ u: user, id: String(v3.user.id), tty: tty, on: nowMs(), off: 0 });
    while (list.length > KEEP_SEEN) list.shift();
    v3.data.set(key, list);
    return list[list.length - 1].on;
}

function keepOff(ctx, on) {
    var key = 'ko.' + ctx.seed + '.' + ctx.host.num;
    var list = keepSeen(ctx.seed, ctx.host.num);
    list.forEach(function (x) {
        if (x.on === on && x.id === String(v3.user.id)) x.off = nowMs();
    });
    v3.data.set(key, list);
}

//  Other players on the host now, and everyone on it lately
function keepOthersOn(seed, num) {
    var now = nowMs();
    return keepSeen(seed, num).filter(function (x) {
        return x.id !== String(v3.user.id) && !x.off && now - x.on < KEEP_ON_MS;
    });
}

//  A real clock time as hh:mm
function keepClock(ms) {
    var d = new Date(ms);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

//  ---- live messages between players ----

//  Sends text to whoever is on the host now as user to. Returns false when
//  nobody is.
function keepWriteTo(ctx, to, from, tty, text) {
    var up = String(to).toUpperCase();
    if (!keepOthersOn(ctx.seed, ctx.host.num).some(function (x) { return String(x.u).toUpperCase() === up; })) return false;
    var key = 'kw.' + ctx.seed + '.' + ctx.host.num;
    var list = keepGet(key, []);
    list.push({ to: up, from: from, tty: tty, m: String(text).slice(0, 400), at: nowMs(), id: String(v3.user.id) });
    while (list.length > 20) list.shift();
    v3.data.set(key, list);
    return true;
}

//  Messages for the caller on as user since ms, taken out of the store
function keepInbox(ctx, user, since) {
    var key = 'kw.' + ctx.seed + '.' + ctx.host.num;
    var list = keepGet(key, []);
    if (!list.length) return [];
    var up = String(user).toUpperCase();
    var mine = function (x) { return x.to === up && x.id !== String(v3.user.id) && x.at >= since; };
    var got = list.filter(mine);
    if (got.length) v3.data.set(key, list.filter(function (x) { return !mine(x); }));
    return got;
}

//  While a shell runs, the terminal checks for messages as it waits for a
//  key; show turns one into what the host prints. Returns a function that
//  puts back what was there before (a call from one host to another).
function keepListen(ctx, io, user, since, show) {
    var before = io.poll;
    io.poll = function () {
        return keepInbox(ctx, user, since).map(show).join('');
    };
    return function () { io.poll = before; };
}

//  ---- mail between players ----

function keepMail(seed, num) {
    return keepGet('km.' + seed + '.' + num, []);
}

function keepSendMail(ctx, to, from, subj, body) {
    var key = 'km.' + ctx.seed + '.' + ctx.host.num;
    var list = keepMail(ctx.seed, ctx.host.num);
    list.push({ to: to, from: from, subj: subj, body: body, at: nowMs() });
    while (list.length > KEEP_MAIL) list.shift();
    v3.data.set(key, list);
}

//  ---- the admins' sweep (phase 6, step 4) ----
//  Once a day, on the first game of the day, the admins of every host where
//  players left something look around. /tmp is emptied. Anything else a
//  player left may be found, by chance: more on a watched box (government,
//  the phone company), less when it's hidden (a dot file, a ... directory,
//  a system directory), more when its owner is hot. What's found is taken
//  away and its owner hears about it, with heat. A password a player set
//  that survives pays its holder rep for the day; one that's found is put
//  back, the box gets a security notice, and the Scene Daily hears.

var SWEEP_CHANCE = { gov: 0.35, telco: 0.4, edu: 0.15, biz: 0.12, res: 0.05 };
var SWEEP_HEAT = { gov: 15, telco: 20, edu: 6, biz: 5, res: 3 };
var HOLD_REP = { gov: 30, telco: 40, edu: 15, biz: 10, res: 5 };

//  A system's own logs and histories: the trail, not something planted
function keepTrace(path) {
    return /^\/\.(sh_)?history$|\/sulog$|\/OPERATOR\.LOG$|\/EDIT_PROFILE\.LOG$|^\/SYS\/PUB\/LOG\d{4}$/.test(path);
}

//  How likely the admins are to come across what's at path, against a
//  thing in plain sight: they check the password files and trust files,
//  and rarely look in dot files or among the system's own
function keepHidden(path) {
    var name = path.split('/').pop();
    if (/^(passwd|shadow|hosts\.equiv|\.rhosts)$/.test(name)) return 1.3;
    if (fsSplit(path).some(function (s) { return s.charAt(0) === '.' || /^\.\.\.+$/.test(s); })) return 0.35;
    if (/^\/(dev|lib|usr\/lib|usr\/spool|usr\/adm|var\/adm|etc|bin|usr\/bin|SYS0|CMDNC0|SYSOVL|SYS)\//.test(path)) return 0.6;
    return 1;
}

//  A player's heat as last saved, 0 to 100
function keepHeatOf(uid) {
    var p = uid ? v3.data.get('p.' + uid) : null;
    return p && p.heat ? p.heat : 0;
}

//  The day's sweep, if it hasn't run today. Returns what it did, for tests:
//  { found: [[uid, num, what]], held: [[uid, num, user]] }
function keepSweep(seed) {
    var day = today();
    var dk = 'ksw.' + seed;
    var res = { found: [], held: [] };
    if (v3.data.get(dk) === day) return res;
    //  first, so a second node opening the game now doesn't sweep again
    v3.data.set(dk, day);
    var all = v3.data.getAll();
    var prefix = 'k.' + seed + '.';
    Object.keys(all).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        var num = key.slice(prefix.length);
        var ov = keepLoad(seed, num);
        var meta = ov.h || ['', 'biz', num, ''];
        var prof = meta[1];
        var base = SWEEP_CHANCE[prof] || 0.12;
        var r = rng(hash32(seed + '|sweep|' + day + '|' + num));
        var odds = function (uid, how) { return base * how * (1 + keepHeatOf(uid) / 50); };
        var lost = {};
        var caught = [];
        Object.keys(ov.p).sort().forEach(function (path) {
            if (keepTrace(path)) return;
            var owner = ov.by[path] ? ov.by[path][0] : '';
            var tmp = /^\/(tmp|var\/tmp|usr\/tmp)\//.test(path);
            if (tmp || r() < odds(owner, keepHidden(path))) {
                delete ov.p[path];
                delete ov.by[path];
                if (owner && !tmp) (lost[owner] = lost[owner] || []).push(path);
            }
        });
        Object.keys(ov.acc).sort().forEach(function (n) {
            var owner = ov.pwBy[n] ? ov.pwBy[n][0] : '';
            if (r() < odds(owner, 1)) {
                delete ov.acc[n];
                delete ov.pwBy[n];
                if (owner) (lost[owner] = lost[owner] || []).push('the ' + n + ' account');
            }
        });
        Object.keys(ov.pw).sort().forEach(function (u) {
            var owner = ov.pwBy[u] ? ov.pwBy[u][0] : '';
            if (r() < odds(owner, 0.8)) {
                delete ov.pw[u];
                delete ov.pwBy[u];
                caught.push(u);
                if (owner) {
                    keepNotice(owner, 'The admins on ' + meta[2] + ' caught on and put the ' + u + ' password back. Heat +' + 2 * (SWEEP_HEAT[prof] || 5) + '.',
                        2 * (SWEEP_HEAT[prof] || 5), 0);
                    res.found.push([owner, num, u]);
                }
            } else if (owner) {
                var pay = HOLD_REP[prof] || 10;
                keepNotice(owner, 'You still hold ' + meta[2] + ' (' + u + '). +' + pay + ' rep.', 0, pay);
                res.held.push([owner, num, u]);
            }
        });
        Object.keys(lost).forEach(function (uid) {
            var heat = SWEEP_HEAT[prof] || 5;
            keepNotice(uid, 'The admins on ' + meta[2] + ' found what you left (' + lost[uid].join(', ') + ') and cleaned it up. Heat +' + heat + '.', heat, 0);
            lost[uid].forEach(function (w) { res.found.push([uid, num, w]); });
        });
        if (caught.length) {
            ov.note = 'SECURITY NOTICE: an intruder was found on this system and removed. Change your password. Report anything unusual to the system manager.';
            news('the scene', 'The admins at ' + (meta[3] || meta[2]) + ' caught an intruder on ' + meta[2] + ' and took the ' + caught.join(' and ') + ' password back.');
        }
        keepStore(seed, num, ov);
    });
    return res;
}

//  ---- the season's end ----

//  Everything players left anywhere, gone with the old network
function keepForget() {
    var all = v3.data.getAll();
    Object.keys(all).forEach(function (k) {
        if (/^(k|km|ko|kp|kw|ksw)\./.test(k)) v3.data.delete(k);
    });
}
