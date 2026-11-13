//
//  Persistence (phase 6, step 3): what players change on a host lasts, for
//  everyone who calls it after them, until the season ends. The generated
//  host is built from the seed as before; the changes are laid over it.
//
//  In v3.data, per season seed:
//    k.<seed>.<num>   the host's changes: { p: { path: entry },
//                     by: { path: [uid, handle, ms] }, pw: { user: password },
//                     pwBy: { user: [uid, handle, ms] } }
//    km.<seed>.<num>  mail players sent there: [{ to, from, subj, body, at }]
//    ko.<seed>.<num>  who was on lately: [{ u, id, tty, on, off }]
//    kp.<seed>.<uid>  a player's changes, oldest first: [[num, path, ms]]
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
    return ov;
}

function keepStore(seed, num, ov) {
    if (!Object.keys(ov.p).length && !Object.keys(ov.pw).length) {
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

function keepNotice(uid, text) {
    v3.data.set('kn.' + uid + '.' + nowMs() + '.' + v3.util.random(1000000), { m: text });
}

//  Notices waiting for this player: removed, and returned
function keepNotices() {
    var all = v3.data.getAll();
    var out = [];
    Object.keys(all).forEach(function (k) {
        if (k.indexOf('kn.' + v3.user.id + '.') === 0) {
            out.push(all[k].m);
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
    keepStore(ctx.seed, ctx.host.num, ov);
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

//  ---- the season's end ----

//  Everything players left anywhere, gone with the old network
function keepForget() {
    var all = v3.data.getAll();
    Object.keys(all).forEach(function (k) {
        if (/^(k|km|ko|kp)\./.test(k)) v3.data.delete(k);
    });
}
