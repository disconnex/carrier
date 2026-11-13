//
//  CARRiER's HP3000 hosts (phase 6): MPE's accounts, groups and files, and
//  the command interpreter that works on them.
//
//  MPE has no directory tree: a file is FILE.GROUP.ACCOUNT, eight letters
//  each. Every machine has the SYS account (PUB.SYS holds the system's
//  programs and logs), the vendor's (SUPPORT, TELESUP), HPOFFICE, and the
//  organization's own. You log on as USER.ACCOUNT into a group (PUB unless
//  you say). In the tree (carrier_fs.js) an account is a directory of
//  groups, each a directory of files; who may read a group is its mode,
//  and members of an account share its group bits. System manager (SM)
//  capability reads everything.
//
//  The three things to find (docs/design.md):
//    * the way up: a job stream with MANAGER.SYS's password in its !JOB
//      line (BACKJOB.PUB.SYS, or a nightly job in the organization's own
//      account), or a user's password list. The welcome message points the
//      way.
//    * leads: NOTES (remote sites) in the organization's PUB group,
//      DIALUPS.NET.SYS (SM only)
//    * loot: REPORT and LISTUSER (SM only; LISTUSER shows passwords), and
//      the file the organization would least want taken
//

var MPE_WAYS = ['job', 'nightly', 'stuff'];

function mpeWorld(ctx) {
    var h = ctx.host;
    var r = rng(hash32(ctx.seed + '|mpe|' + h.num));
    var staff = someUsers(h, 8).filter(function (n) { return ['operator', 'field', 'admin'].indexOf(n) < 0; })
        .slice(0, 5).map(function (n) { return n.toUpperCase().slice(0, 8); });
    var org = (h.org.split(' ')[0] || 'COMPANY').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'COMPANY';
    if (['SYS', 'SUPPORT', 'TELESUP', 'HPOFFICE'].indexOf(org) >= 0) org = 'CORP';
    var w = { h: h, r: r, kind: 'hp3000', staff: staff, boss: staff[0], peers: staff.slice(1), org: org, real: {} };
    staff.forEach(function (n) {
        w.real[n] = pick(r, UNIX_FIRST) + ' ' + pick(r, UNIX_LAST);
    });
    w.way = pick(r, MPE_WAYS);
    w.stuffUser = w.peers[0];
    w.secret = h.secret;
    return w;
}

//  The organization's own users, [USER.ACCT, password, SM]: LISTUSER shows
//  them to a system manager, and they log on like any other
function mpeStaff(w) {
    var list = w.staff.map(function (n, i) { return [n + '.' + w.org, pick(rng(hash32(w.h.num + n)), SECRET_WORDS), i === 0]; });
    list.push(['MGR.' + w.org, pick(rng(hash32(w.h.num + 'mgr')), SECRET_WORDS), true]);
    return list;
}

//  A date as LISTF ,2 and the logon banner show it: SUN, NOV  7, 1993
function mpeDate(daysAgo) {
    var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    return MON[d.getMonth()] + ' ' + padStart(String(d.getDate()), 2) + ' 1993';
}

function mpeFile(own, grp, mode, text, days, type, code) {
    var f = fsFile(own, grp, mode, text, mpeDate(days), type);
    if (code) f.code = code;
    return f;
}

//  ---- the tree ----

function mpeTree(ctx) {
    var w = mpeWorld(ctx);
    var r = w.r;
    var old = function () { return 200 + Math.floor(r() * 400); };
    var recent = function () { return 1 + Math.floor(r() * 60); };
    var root = fsDir('MANAGER.SYS', 'SYS', 'rwxr-xr-x', mpeDate(old()));
    var put = function (path, node) { return fsPut(root, path, node); };
    var dir = function (path, acct, mode) {
        var have = fsLook({ root: root, home: '/' }, '/', path, { root: true }, true).node;
        if (have && have.dir) return have;
        return put(path, fsDir('MGR.' + acct, acct, mode, mpeDate(old())));
    };
    //  accounts and groups: SYS lets anyone read PUB; the others keep to
    //  their members, except the organization's PUB, which someone opened
    dir('/SYS', 'SYS', 'rwxr-xr-x');
    dir('/SYS/PUB', 'SYS', 'rwxr-xr-x');
    dir('/SYS/NET', 'SYS', 'rwx------');
    dir('/SYS/SCHED', 'SYS', 'rwxr-x---');
    ['SUPPORT', 'TELESUP', 'HPOFFICE'].forEach(function (a) {
        dir('/' + a, a, 'rwxrwx---');
        dir('/' + a + '/PUB', a, 'rwxrwx---');
    });
    dir('/' + w.org, w.org, 'rwxrwxr-x');
    dir('/' + w.org + '/PUB', w.org, 'rwxrwxr-x');
    dir('/' + w.org + '/DATA', w.org, 'rwxrwx---');
    dir('/' + w.org + '/JOBS', w.org, 'rwxrwx---');

    ['FCOPY', 'EDITOR', 'QUERY', 'SPOOK', 'SYSDUMP', 'LISTDIR5', 'STORE', 'RESTORE', 'SORT', 'DBUTIL', 'COBOLII', 'FORTRAN'].forEach(function (p) {
        var f = put('/SYS/PUB/' + p, mpeFile('MANAGER.SYS', 'SYS', 'r-xr-xr-x', '', old(), 'exec', 'PROG'));
        f.size = 20000 + Math.floor(r() * 200000);
        f.strs = [p, 'END OF PROGRAM', 'HP32'];
    });
    put('/SYS/PUB/CATALOG', mpeFile('MANAGER.SYS', 'SYS', 'r--r--r--', '', old(), 'data')).size = 89000;
    put('/SYS/PUB/COMMAND', mpeFile('MANAGER.SYS', 'SYS', 'r--r--r--', '', old(), 'data')).size = 41000;
    var logn = 400 + Math.floor(r() * 500);
    for (var i = 0; i < 3; i++) {
        var lf = put('/SYS/PUB/LOG' + padStart(String(logn + i), 4).replace(/ /g, '0'), mpeFile('MANAGER.SYS', 'SYS', 'rw-------', '', 2 - i, 'data', 'LOG'));
        lf.size = 30000 + Math.floor(r() * 40000);
        lf.log = true;
    }
    put('/SYS/PUB/BACKJOB', mpeFile('MANAGER.SYS', 'SYS', w.way === 'job' ? 'rw-r--r--' : 'rw-------', function () {
        return '!JOB BACKUP,' + (w.way === 'job' ? w.secret[0] + '/' + w.secret[1] : 'MANAGER.SYS') + ';OUTCLASS=,1\n!COMMENT  NIGHTLY STORE TO TAPE -- ' + w.boss + '\n' +
            '!FILE T;DEV=TAPE\n!STORE @.@.@;*T;SHOW\n!TELLOP BACKUP DONE\n!EOJ\n';
    }, recent())).onRead = w.way === 'job' ? function (c, io) { io.say('A job stream logs itself on: whose account, and its password, in the !JOB line.'); } : null;
    var dl = put('/SYS/NET/DIALUPS', mpeFile('MANAGER.SYS', 'SYS', 'rw-------', function () {
        return 'DS/3000 DIAL-UP LINES, ' + w.h.org.toUpperCase() + '\n\n' + leadsOf(ctx, 3).map(function (num, i) {
            return '  LDEV ' + (40 + i) + '   ' + fmtNum(num) + '   2400';
        }).join('\n') + '\n';
    }, recent()));
    dl.onRead = function (c, io) {
        gotLeads(c, io, leadsOf(c, 3), 'dialups');
        io.say('Dial-up lines: numbers that answer with a carrier. They\'re on your found list.');
    };
    put('/SYS/NET/NMCONFIG', mpeFile('MANAGER.SYS', 'SYS', 'rw-------', '', old(), 'data')).size = 52000;
    put('/SYS/SCHED/JOBLIST', mpeFile('MANAGER.SYS', 'SYS', 'rw-r-----', 'BACKJOB.PUB.SYS        02:00  DAILY\nNIGHTLY.PUB.' + w.org + '   23:30  DAILY\n', recent()));
    put('/TELESUP/PUB/DIAGNOTE', mpeFile('MGR.TELESUP', 'TELESUP', 'rw-rw----', 'TELESUPPORT DIAL-IN: HELLO MGR.TELESUP  -- CALL THE RESPONSE CENTER FIRST.\n', old()));
    put('/SUPPORT/PUB/PATCHES', mpeFile('FIELD.SUPPORT', 'SUPPORT', 'rw-rw----', 'PATCHES APPLIED THIS SYSTEM:\n  G.03.04  ' + mpeDate(old()) + '\n', old()));
    put('/HPOFFICE/PUB/MAILDIR', mpeFile('MAIL.HPOFFICE', 'HPOFFICE', 'rw-rw----', '', recent(), 'data')).size = 120000;

    //  the organization
    var o = '/' + w.org;
    put(o + '/PUB/NOTES', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw-r--', function () {
        return 'REMOTE SITES -- CALL BEFORE 6PM\n' + leadsOf(ctx, 5).slice(3).map(function (num) { return '  ' + fmtNum(num); }).join('\n') + '\n';
    }, recent())).onRead = function (c, io) {
        var ls = leadsOf(c, 5).slice(3);
        gotLeads(c, io, ls, 'sites');
        if (ls.length) io.say('Remote sites: if those numbers answer with a carrier, they\'re on your found list now.');
    };
    put(o + '/PUB/NIGHTLY', mpeFile(w.peers[1] + '.' + w.org, w.org, w.way === 'nightly' ? 'rw-rw-r--' : 'rw-rw----', function () {
        return '!JOB NIGHTLY,' + (w.way === 'nightly' ? w.secret[0] + '/' + w.secret[1] : w.peers[1] + '.' + w.org) + ';OUTCLASS=,1\n!RUN REPORTS.PUB.' + w.org + '\n!TELLOP NIGHTLY REPORTS DONE\n!EOJ\n';
    }, recent())).onRead = w.way === 'nightly' ? function (c, io) { io.say('A job stream logs itself on: whose account, and its password, in the !JOB line.'); } : null;
    put(o + '/PUB/PWLIST', mpeFile(w.stuffUser + '.' + w.org, w.org, w.way === 'stuff' ? 'rw-rw-r--' : 'rw-------', function () {
        var lines = ['BANK CARD   ' + (1000 + hash32(w.stuffUser) % 9000), 'DIALUP      ' + pick(rng(hash32(w.stuffUser)), SECRET_WORDS)];
        if (w.way === 'stuff') lines.splice(1, 0, fit(w.secret[0], 14) + w.secret[1] + '   (' + w.boss + ' CHANGED IT AGAIN)');
        return lines.join('\n') + '\n';
    }, recent())).onRead = w.way === 'stuff' ? function (c, io) { io.say('A password, and whose it is. HELLO that account.'); } : null;
    var rp = put(o + '/PUB/REPORTS', mpeFile(w.boss + '.' + w.org, w.org, 'r-xr-xr-x', '', recent(), 'exec', 'PROG'));
    rp.size = 48000;
    rp.strs = ['MONTH END', 'REPORTS', w.org];
    put(o + '/JOBS/MONTHEND', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw----', '!JOB MONTHEND,' + w.boss + '.' + w.org + ';OUTCLASS=,1\n!RUN REPORTS\n!EOJ\n', recent()));
    var prize = unixPrize({ h: w.h });
    if (prize) {
        var name = { edu: 'GRADES', biz: 'PAYROLL', gov: 'CONTRACT', telco: 'SWITCHRP' }[w.h.prof];
        put(o + '/DATA/' + name, mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw----', prize[2].toUpperCase(), recent())).onRead = function (c, io) {
            gotLoot(c, io, prize[1], 'prize', 15);
        };
    }
    if (w.h.prof === 'telco') {
        var cz = cosmosNear(ctx.seed, w.h);
        put(o + '/PUB/FRAMENTS', mpeFile(w.boss + '.' + w.org, w.org, 'rw-rw-r--', function () {
            if (!cz) return 'MLT DOWN AGAIN.\n';
            var ca = hostAtNum(ctx, cz, 'cosmos');
            return 'MLT DOWN AGAIN.\nCOSMOS IS ON ' + fmtNum(cz).slice(2) + '. LOGIN ' + ca.accounts[0][0] +
                (ca.accounts[0][1] ? ' PW ' + ca.accounts[0][1].toUpperCase() : ' (NO PW)') + ', WC ' + ca.wc + '\n';
        }, recent())).onRead = function (c, io) {
            if (cz) {
                gotLeads(c, io, [cz], 'cosmos');
                io.say('COSMOS: the phone company\'s own database. It\'s on your found list.');
            }
        };
    }
    ctfTree(ctx, root);
    return { root: root, home: '/', w: w };
}

//  The operator's welcome message, which says too much
function mpeWelcome(w) {
    var lines = ['** ' + w.h.org.toUpperCase() + ' **', 'REPORT PROBLEMS TO THE COMPUTER ROOM, X4410.'];
    if (w.way === 'job') lines.push('BACKUPS NOW STREAM FROM BACKJOB.PUB.SYS.  DO NOT EDIT IT.');
    if (w.way === 'nightly') lines.push('NIGHTLY REPORTS RUN FROM NIGHTLY.PUB.' + w.org + '.  ' + w.peers[1] + ': TAKE YOUR PASSWORD OUT OF IT.');
    if (w.way === 'stuff') lines.push(w.stuffUser + ': PWLIST.PUB.' + w.org + ' IS NOT A SAFE.  GET IT OFF THE SYSTEM.');
    return lines.join('\n') + '\n';
}

//  ---- file names ----

//  Parses FILE[.GROUP[.ACCOUNT]] (with @, ? and # in any part) against
//  where you are: { file, group, acct } or null when it isn't a name
function mpeName(sh, s) {
    var parts = String(s || '').toUpperCase().split('/')[0].split('.');
    if (parts.length > 3 || parts.some(function (p) { return !/^[A-Z@?#][A-Z0-9@?#]{0,7}$/.test(p); })) return null;
    return { file: parts[0], group: parts[1] || sh.group, acct: parts[2] || sh.acct };
}

function mpePattern(s) {
    return new RegExp('^' + s.replace(/@/g, '.*').replace(/\?/g, '[A-Z0-9]').replace(/#/g, '[0-9]') + '$');
}

//  The files a name matches: [{ acct, group, file, node, gnode }], or
//  { err } with MPE's message
function mpeFind(sh, s) {
    var n = mpeName(sh, s);
    if (!n) return { err: 'BAD FILE NAME.  (CIERR 9000)' };
    var out = [];
    var root = sh.fs.root;
    var acctRe = mpePattern(n.acct), grpRe = mpePattern(n.group), fileRe = mpePattern(n.file);
    var wild = /[@?#]/.test(n.acct + n.group + n.file);
    var sawGroup = false;
    var denied = false;
    Object.keys(root.kids).sort().forEach(function (a) {
        if (!acctRe.test(a)) return;
        var an = root.kids[a];
        if (!fsCan(an, sh.who, 'x')) { denied = true; return; }
        Object.keys(an.kids).sort().forEach(function (g) {
            if (!grpRe.test(g)) return;
            sawGroup = true;
            var gn = an.kids[g];
            if (!fsCan(gn, sh.who, 'x') || (wild && !fsCan(gn, sh.who, 'r'))) { denied = true; return; }
            Object.keys(gn.kids).sort().forEach(function (f) {
                if (fileRe.test(f)) out.push({ acct: a, group: g, file: f, node: gn.kids[f], gnode: gn });
            });
        });
    });
    if (!out.length) {
        if (!sawGroup) return { err: wild ? 'NO FILES FOUND IN FILE-SET (CIWARN 431)' : 'NONEXISTENT GROUP  (FSERR 52)', name: n };
        return { err: denied ? 'SECURITY VIOLATION  (FSERR 93)' : wild ? 'NO FILES FOUND IN FILE-SET (CIWARN 431)' : 'NONEXISTENT PERMANENT FILE  (FSERR 52)', name: n };
    }
    return out;
}

function mpeRead(sh, f) {
    if (!fsCan(f.node, sh.who, 'r')) {
        sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        return null;
    }
    if (f.node.onRead) {
        sh.after = (sh.after || []).concat([f.node.onRead]);
        if (!f.node.repeat) f.node.onRead = null;
    }
    return f.node.type === 'exec' || f.node.type === 'data' ? unixGarbage(f.node) : fsText(f.node);
}

//  Writes a new file, or over one; returns the node or null
function mpeWrite(sh, s, text) {
    var n = mpeName(sh, s);
    if (!n || /[@?#]/.test(n.file + n.group + n.acct)) {
        sh.out('BAD FILE NAME.  (CIERR 9000)\n');
        return null;
    }
    var gl = fsLook(sh.fs, '/', '/' + n.acct + '/' + n.group, sh.who);
    if (gl.err || !gl.node) {
        sh.out(gl.err === 'denied' ? 'SECURITY VIOLATION  (FSERR 93)\n' : 'NONEXISTENT GROUP  (FSERR 52)\n');
        return null;
    }
    var had = gl.node.kids[n.file];
    if ((had && !fsCan(had, sh.who, 'w')) || (!had && !fsCan(gl.node, sh.who, 'w'))) {
        sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        return null;
    }
    var f = had || mpeFile(sh.who.user, n.acct, 'rw-rw----', '', 0);
    f.text = text;
    f.type = 'text';
    delete f.size;
    f.mt = mpeDate(0);
    gl.node.kids[n.file] = f;
    keepMark(sh.fs, '/' + n.acct + '/' + n.group + '/' + n.file);
    return f;
}

//  ---- the commands ----

var MPE_QUIET = ['LISTF', 'SHOWME', 'SHOWJOB', 'SHOWTIME', 'HELP', 'CHGROUP'];

function runHP(ctx, io) {
    var h = ctx.host;
    ctx.ov = keepLoad(ctx.seed, h.num);
    var t = era();
    io.out('\r\n:');
    var acct = null;
    var group = 'PUB';
    for (var tries = 0; tries < MAX_TRIES && !acct; ) {
        var l = io.line(true);
        if (l === null) return;
        var m = /^\s*:?\s*HELLO\s+([A-Z0-9]+\.[A-Z0-9]+)(\/(\S+?))?(,([A-Z0-9]+))?\s*$/i.exec(l);
        if (!m) {
            io.out('EXPECTED HELLO, :JOB, :DATA, OR (CMD) AS LOGON.  (CIERR 1402)\r\n:');
            continue;
        }
        var ua = m[1].toUpperCase();
        group = (m[5] || 'PUB').toUpperCase();
        var all = keepAccounts(ctx, h.accounts.concat(mpeStaff(mpeWorld(ctx))), true);
        var match = all.filter(function (a) { return a[0] === ua; });
        if (!match.length) {
            var acctPart = ua.split('.')[1];
            var known = all.some(function (a) { return a[0].split('.')[1] === acctPart; });
            io.out((known ? 'INVALID USER NAME. (CIERR 1426)' : 'NON-EXISTENT ACCOUNT. (CIERR 1437)') + '\r\n:');
            failedLogin(ctx);
            tries++;
            continue;
        }
        var open = match.filter(function (a) { return a[1] === ''; })[0];
        if (open) {
            acct = open;
            break;
        }
        var pw = m[3];
        if (pw === undefined) {
            io.out('ENTER USER PASSWORD:');
            pw = io.line(false);
            if (pw === null) return;
            io.out('\r\n');
        }
        acct = findAccount({ accounts: all }, ua, pw, true);
        if (!acct) {
            io.out('INVALID PASSWORD FOR "' + ua + '" ON LOGON.  (CIERR 1441)\r\n:');
            failedLogin(ctx);
            tries++;
        }
    }
    if (!acct) {
        return;
    }
    var fs = mpeTree(ctx);
    keepOpen(ctx, fs, function () { return mpeTree(ctx); });
    var w = fs.w;
    var who = acct[0].toUpperCase();
    var acctName = who.split('.')[1];
    if (!fsLook(fs, '/', '/' + acctName + '/' + group, { root: true }).node) {
        io.out('NON-EXISTENT GROUP.  (CIERR 1429)\r\n');
        return;
    }
    io.out('HP3000 / MPE V ' + h.version + ' (BASE ' + h.version + '). ' + t.hp + '\r\n');
    io.out(unixLines(mpeWelcome(w)));
    if (ctx.ov.note) io.out(unixLines(ctx.ov.note.toUpperCase() + '\n'));
    var priv = loggedIn(ctx, acct, io);
    var sh = { ctx: ctx, io: io, fs: fs, w: w, user: who, acct: acctName, group: group, priv: priv, job: 100 + h.users, pw: acct[1] };
    sh.who = { user: who, groups: [acctName], root: !!priv };
    sh.out = function (s) { io.out(unixLines(s)); };
    sh.tty = 'LDEV ' + (20 + v3.util.random(9));
    sh.on = keepOn(ctx, who, sh.tty);
    var deaf = keepListen(ctx, io, who, sh.on, function (x) {
        return unixLines('\nFROM/S' + (40 + hash32(x.from) % 50) + ' ' + x.from + '/' + x.m.replace(/\n/g, ' ') + '\n');
    });
    mpeShell(sh);
    deaf();
    keepOff(ctx, sh.on);
}

function mpeShell(sh) {
    var ctx = sh.ctx;
    var io = sh.io;
    for (;;) {
        io.out(':');
        var cmd = io.line(true);
        if (cmd === null) return;
        var c = cmd.trim();
        if (!c) continue;
        var verb = c.split(/[\s,;]/)[0].toUpperCase();
        var args = c.slice(verb.length).trim();
        if (verb !== 'TELL' && verb !== 'TELLOP' && verb !== 'BYE' && watched(ctx, io, MPE_QUIET.indexOf(verb) >= 0 ? 0.3 : 1)) return;
        var fn = MPE_CMDS[verb];
        if (!fn) {
            sh.out('UNKNOWN COMMAND NAME.  (CIERR 975)\n');
            continue;
        }
        var res = fn(sh, args);
        if (sh.after) {
            var after = sh.after;
            sh.after = null;
            after.forEach(function (f) { f(ctx, io); });
        }
        if (keepSave(sh.fs) === 'full') {
            sh.out('OUT OF DISC SPACE  (FSERR 46)\n');
            io.say('This HP has no room for more of what players leave. What you just did lasts only this call.');
        }
        if (res === 'exit' || io.over) return;
    }
}

//  An entry in the newest system log file: who changed the directory, and
//  how. LISTLOG would show it; PURGE LOG@.PUB.SYS takes it away.
function mpeAudit(sh, what) {
    var logs = Object.keys(fsLook(sh.fs, '/', '/SYS/PUB', { root: true }).node.kids).filter(function (k) { return /^LOG\d{4}$/.test(k); }).sort();
    if (!logs.length) return;
    keepLog(sh.fs, '/SYS/PUB/' + logs[logs.length - 1], [era().hp + '  ' + sh.user + '  ' + what], 40);
}

//  Whether name is a privileged user the host came with
function mpePrivAccount(sh, name) {
    return name === 'MANAGER.SYS' || sh.ctx.host.accounts.concat(mpeStaff(sh.w)).some(function (a) { return a[0].toUpperCase() === name && a[2]; });
}

//  ;PASS=x and ;CAP=y from a NEWUSER or ALTUSER line
function mpeParms(a) {
    var out = {};
    a.split(';').slice(1).forEach(function (kv) {
        var m = /^\s*([A-Z]+)\s*=\s*(.*?)\s*$/i.exec(kv);
        if (m) out[m[1].toUpperCase()] = m[2];
    });
    return out;
}

var MPE_HELP = {
    LISTF: 'LISTF [fileset][,level]\n  LISTF @            files in your group\n  LISTF @.@          every group in your account\n  LISTF @.PUB.SYS,1  with sizes',
    PRINT: 'PRINT filename      lists a file on your terminal',
    CHGROUP: 'CHGROUP group       moves you to another group in your account',
    SHOWME: 'SHOWME              who and where you are',
    SHOWJOB: 'SHOWJOB             the jobs and sessions on the system',
    TELL: 'TELL user.acct;text  sends a user a message',
    PURGE: 'PURGE filename      deletes a file',
    BUILD: 'BUILD filename      makes an empty file',
    RENAME: 'RENAME old,new',
    RUN: 'RUN program         FCOPY.PUB.SYS and EDITOR.PUB.SYS are the useful ones',
    LISTUSER: 'LISTUSER user.acct  (AM or SM capability)',
    LISTACCT: 'LISTACCT acct       (SM capability)',
    REPORT: 'REPORT [group.acct] disc and CPU use by account (AM or SM capability)',
    BYE: 'BYE                 ends your session',
};

var MPE_CMDS = {
    BYE: function (sh) {
        sh.out('CPU=1. CONNECT=4. ' + era().hp + '\n');
        return 'exit';
    },
    HELLO: function (sh) {
        sh.out('CPU=1. CONNECT=4. ' + era().hp + '\n');
        return 'exit';
    },
    HELP: function (sh, a) {
        var k = a.split(/[\s,;]/)[0].toUpperCase();
        if (k && MPE_HELP[k]) sh.out(MPE_HELP[k] + '\n');
        else if (k) sh.out('NO HELP AVAILABLE FOR ' + k + '.  (CIWARN 9050)\n');
        else sh.out('COMMANDS:\n' + unixColumns(Object.keys(MPE_HELP).sort()));
    },
    SHOWTIME: function (sh) { sh.out(era().hp + '\n'); },
    SHOWME: function (sh) {
        var t = era().hp;
        sh.out('USER: #S' + sh.job + ',' + sh.user + ',' + sh.group + '        (NOT IN BREAK)\nMPE VERSION: HP32033' + sh.w.h.version + '.  (BASE ' + sh.w.h.version + ').\n' +
            'CURRENT: ' + t + '\nLOGON:   ' + t + '\nCPU SECONDS: 1        CONNECT MINUTES: 1\n$STDIN LDEV: 20       $STDLIST LDEV: 20\n');
    },
    SHOWJOB: function (sh) {
        var t = era().hp.slice(-8);
        var out = 'JOBNUM  STATE IPRI JIN  JLIST    INTRODUCED  JOB NAME\n\n';
        if (adminOnline(sh.ctx)) out += '#S2     EXEC        20   20       ' + t + '  MANAGER.SYS\n';
        sh.w.staff.slice(1, 1 + Math.min(4, sh.w.h.users)).forEach(function (n, i) {
            out += fit('#S' + (40 + i * 7), 8) + 'EXEC        ' + fit(String(30 + i), 5) + fit(String(30 + i), 9) + t + '  ' + n + '.' + sh.w.org + '\n';
        });
        keepOthersOn(sh.ctx.seed, sh.w.h.num).forEach(function (x, i) {
            out += fit('#S' + (sh.job - 3 - i), 8) + 'EXEC        20   20       ' + t + '  ' + x.u + '\n';
        });
        out += fit('#S' + sh.job, 8) + 'EXEC        20   20       ' + t + '  ' + sh.user + '\n';
        sh.out(out + '\n');
    },
    CHGROUP: function (sh, a) {
        var g = (a || 'PUB').toUpperCase().split(/[\s,;]/)[0];
        var gl = fsLook(sh.fs, '/', '/' + sh.acct + '/' + g, sh.who);
        if (gl.err === 'denied' || (gl.node && !fsCan(gl.node, sh.who, 'x'))) {
            sh.out('SECURITY VIOLATION  (FSERR 93)\n');
        } else if (!gl.node) {
            sh.out('NON-EXISTENT GROUP.  (CIERR 1429)\n');
        } else {
            sh.group = g;
        }
    },
    LISTF: function (sh, a) {
        var parts = a.split(',');
        var set = (parts[0] || '').trim() || '@';
        var level = parseInt((parts[1] || '0').trim(), 10) || 0;
        var found = mpeFind(sh, set);
        if (found.err) {
            sh.out(found.err + '\n');
            return;
        }
        var groups = [];
        found.forEach(function (f) {
            var key = f.acct + '.' + f.group;
            if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key: key, acct: f.acct, group: f.group, files: [] });
            groups[groups.length - 1].files.push(f);
        });
        var out = '';
        groups.forEach(function (g) {
            if (set.indexOf('.') >= 0 || level > 0) out += '\nACCOUNT=  ' + fit(g.acct, 10) + 'GROUP=  ' + g.group + '\n';
            if (level === 0) {
                out += '\nFILENAME\n\n' + unixColumns(g.files.map(function (f) { return fit(f.file, 9); })).replace(/^/gm, '') + '\n';
            } else {
                out += '\nFILENAME  CODE  ------------LOGICAL RECORD-----------  ----SPACE----\n                  SIZE  TYP        EOF      LIMIT R/B  SECTORS #X MX\n\n';
                g.files.forEach(function (f) {
                    var size = fsSize(f.node);
                    var rec = f.node.type === 'text' ? 80 : 128;
                    var eof = Math.max(1, Math.ceil(size / rec));
                    out += fit(f.file, 10) + fit(f.node.code || '', 5) + padStart(String(rec), 6) + 'B  FA' + padStart(String(eof), 11) + padStart(String(eof + 1000 - eof % 1000), 11) +
                        '   1' + padStart(String(Math.ceil(eof * rec / 256) + 16), 9) + '  1  8' + (level > 1 ? '   ' + f.node.mt : '') + '\n';
                });
            }
        });
        sh.out(out);
    },
    PRINT: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        if (!name) {
            sh.out('MISSING FILE NAME.  (CIERR 9030)\n');
            return;
        }
        var found = mpeFind(sh, name);
        if (found.err) {
            sh.out((/CIWARN/.test(found.err) ? 'NONEXISTENT PERMANENT FILE  (FSERR 52)' : found.err) + '\n');
            return;
        }
        found.forEach(function (f) {
            var text = mpeRead(sh, f);
            if (text !== null) sh.out(text);
        });
    },
    PURGE: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        var found = name ? mpeFind(sh, name) : { err: 'MISSING FILE NAME.  (CIERR 9030)' };
        if (found.err) {
            sh.out((/CIWARN/.test(found.err) ? 'NONEXISTENT PERMANENT FILE  (FSERR 52)' : found.err) + '\n');
            return;
        }
        var logs = 0;
        found.forEach(function (f) {
            if (!fsCan(f.node, sh.who, 'w') || !fsCan(f.gnode, sh.who, 'w')) {
                sh.out('SECURITY VIOLATION  (FSERR 93)\n');
                return;
            }
            if (f.node.log) logs++;
            delete f.gnode.kids[f.file];
            keepMark(sh.fs, '/' + f.acct + '/' + f.group + '/' + f.file);
        });
        if (logs) cleaned(sh.ctx, sh.io);
    },
    BUILD: function (sh, a) {
        var name = a.split(/[\s,;]/)[0];
        if (!name) {
            sh.out('MISSING FILE NAME.  (CIERR 9030)\n');
            return;
        }
        var n = mpeName(sh, name);
        if (n && fsLook(sh.fs, '/', '/' + n.acct + '/' + n.group + '/' + n.file, { root: true }).node) {
            sh.out('DUPLICATE PERMANENT FILE NAME  (FSERR 100)\n');
            return;
        }
        mpeWrite(sh, name, '');
    },
    RENAME: function (sh, a) {
        var p = a.split(',');
        if (p.length < 2) {
            sh.out('MISSING PARAMETER.  (CIERR 9031)\n');
            return;
        }
        var found = mpeFind(sh, p[0].trim());
        if (found.err) {
            sh.out(found.err + '\n');
            return;
        }
        var f = found[0];
        var to = mpeName(sh, p[1].trim());
        if (!to) {
            sh.out('BAD FILE NAME.  (CIERR 9000)\n');
            return;
        }
        var gl = fsLook(sh.fs, '/', '/' + to.acct + '/' + to.group, sh.who);
        if (!fsCan(f.gnode, sh.who, 'w') || !gl.node || !fsCan(gl.node, sh.who, 'w')) {
            sh.out('SECURITY VIOLATION  (FSERR 93)\n');
            return;
        }
        delete f.gnode.kids[f.file];
        gl.node.kids[to.file] = f.node;
        keepMark(sh.fs, '/' + f.acct + '/' + f.group + '/' + f.file);
        keepMark(sh.fs, '/' + to.acct + '/' + to.group + '/' + to.file);
    },
    TELL: function (sh, a) {
        var m = /^([A-Z0-9.#]+)\s*;?\s*(.*)$/i.exec(a);
        if (!m) {
            sh.out('MISSING PARAMETER.  (CIERR 9031)\n');
            return;
        }
        var to = m[1].toUpperCase();
        //  another player on as them gets it
        if (m[2] && keepWriteTo(sh.ctx, to, sh.user, sh.tty, m[2])) return;
        if (to === 'MANAGER.SYS' || to === 'MGR.SYS') {
            if (bluff(sh.ctx, sh.io, m[2])) return 'exit';
            return;
        }
        sh.out(sh.w.staff.some(function (n) { return to === n + '.' + sh.w.org; }) ? 'MESSAGE NOT ACCEPTED: QUIET MODE.  (CIWARN 3020)\n' : 'NO SUCH USER LOGGED ON.  (CIERR 3015)\n');
    },
    TELLOP: function (sh, a) {
        if (bluff(sh.ctx, sh.io, a)) return 'exit';
    },
    LISTUSER: function (sh, a) { return mpeListUser(sh, a); },
    NEWUSER: function (sh, a) { return mpeNewUser(sh, a); },
    ALTUSER: function (sh, a) { return mpeAltUser(sh, a); },
    LISTACCT: function (sh, a) {
        if (!sh.priv) {
            sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
            return;
        }
        sh.out(Object.keys(sh.fs.root.kids).sort().map(function (k) {
            return '********************\nACCOUNT: ' + k + '\nPASSWORD: ' + (k === 'SYS' ? 'HPONLY' : '') + '\nCAP: AM,AL,GL,ND,SF,BA,IA' + (k === 'SYS' ? ',SM,OP,PM' : '') + '\nGROUPS: ' +
                Object.keys(sh.fs.root.kids[k].kids).join(', ');
        }).join('\n') + '\n');
        gotLoot(sh.ctx, sh.io, 'the account report');
    },
    REPORT: function (sh) {
        if (!sh.priv) {
            sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
            return;
        }
        var out = 'ACCOUNT\n/GROUP     FILESPACE-SECTORS    CPU-SECONDS    CONNECT-MINUTES\n';
        Object.keys(sh.fs.root.kids).sort().forEach(function (a, i) {
            out += fit(a, 11) + fit(String(41200 - i * 6100), 21) + fit(String(9100 - i * 900), 15) + (3300 - i * 410) + '\n';
            Object.keys(sh.fs.root.kids[a].kids).forEach(function (g, j) {
                out += fit(' /' + g, 11) + fit(String(12000 - i * 1500 - j * 900), 21) + fit(String(3000 - i * 300 - j * 100), 15) + (900 - i * 100 - j * 40) + '\n';
            });
        });
        sh.out(out);
        gotLoot(sh.ctx, sh.io, 'the account report');
    },
    RUN: function (sh, a) {
        var name = a.split(/[\s,;]/)[0].toUpperCase();
        var n = mpeName(sh, name);
        var found = n ? mpeFind(sh, name) : { err: 'x' };
        if (found.err && n && n.group === sh.group && n.acct === sh.acct) {
            n = { file: n.file, group: 'PUB', acct: 'SYS' };
            found = mpeFind(sh, n.file + '.PUB.SYS');
        }
        if (found.err) {
            sh.out('NONEXISTENT PERMANENT FILE  (FSERR 52)\nPROGRAM FILE NOT FOUND.  (CIERR 1102)\n');
            return;
        }
        var f = found[0];
        if (f.node.type !== 'exec' || !fsCan(f.node, sh.who, 'x')) {
            sh.out(f.node.type !== 'exec' ? 'INVALID PROGRAM FILE.  (CIERR 610)\n' : 'SECURITY VIOLATION  (FSERR 93)\n');
            return;
        }
        if (f.file === 'FCOPY' && f.acct === 'SYS') return mpeFcopy(sh);
        if (f.file === 'EDITOR' && f.acct === 'SYS') return mpeEditor(sh);
        sh.out('\nEND OF PROGRAM\n');
    },
    EDITOR: function (sh) { return mpeEditor(sh); },
    FCOPY: function (sh) { return mpeFcopy(sh); },
};

function mpeListUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var set = (a.split(/[\s,;]/)[0] || '@.' + sh.acct).toUpperCase();
    var parts = set.split('.');
    var ure = mpePattern(parts[0] || '@');
    var are = mpePattern(parts[1] || sh.acct);
    var users = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true).map(function (x) { return [x[0].toUpperCase(), String(x[1]).toUpperCase(), x[2]]; });
    var seen = {};
    var rows = users.filter(function (u) {
        var p = u[0].split('.');
        if (seen[u[0]] || !ure.test(p[0]) || !are.test(p[1])) return false;
        seen[u[0]] = true;
        return true;
    });
    if (!rows.length) {
        sh.out('NONEXISTENT USER.  (CIERR 1433)\n');
        return;
    }
    sh.out(rows.map(function (u) {
        return '********************\nUSER: ' + u[0] + '\nHOME GROUP: PUB              PASSWORD: ' + u[1] + '\nMAX PRI   : 150             LOC ATTR: $00000000\n' +
            'LOGON CNT : ' + (1 + hash32(u[0]) % 9) + '               CAP: ' + (u[2] ? 'SM,AM,AL,GL,ND,SF,BA,IA,PH' : 'ND,SF,BA,IA');
    }).join('\n') + '\n');
    gotLoot(sh.ctx, sh.io, 'the account report');
}

//  NEWUSER user[.acct];PASS=pw;CAP=SM,...: a new user in an account, as an
//  account or system manager may add one
function mpeNewUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var name = (a.split(';')[0] || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,7}(\.[A-Z][A-Z0-9]{0,7})?$/.test(name)) {
        sh.out(name ? 'INVALID USER NAME.  (CIERR 1426)\n' : 'MISSING USER NAME.  (CIERR 3060)\n');
        return;
    }
    if (name.indexOf('.') < 0) name += '.' + sh.acct;
    if (!fsLook(sh.fs, '/', '/' + name.split('.')[1], { root: true }).node) {
        sh.out('NON-EXISTENT ACCOUNT. (CIERR 1437)\n');
        return;
    }
    var all = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true);
    if (all.some(function (x) { return x[0].toUpperCase() === name; })) {
        sh.out('DUPLICATE USER NAME.  (CIERR 3061)\n');
        return;
    }
    var p = mpeParms(a);
    keepAddAccount(sh.ctx, name, (p.PASS || '').toUpperCase(), /SM/.test((p.CAP || '').toUpperCase()));
    mpeAudit(sh, 'NEWUSER ' + name + (p.CAP ? ';CAP=' + p.CAP.toUpperCase() : ''));
}

//  ALTUSER user[.acct];PASS=pw: a new password. MANAGER.SYS's takes the box.
function mpeAltUser(sh, a) {
    if (!sh.priv) {
        sh.out('LACKING SM OR AM CAPABILITY.  (CIERR 3010)\n');
        return;
    }
    var name = (a.split(';')[0] || '').trim().toUpperCase();
    if (name && name.indexOf('.') < 0) name += '.' + sh.acct;
    var all = keepAccounts(sh.ctx, sh.ctx.host.accounts.concat(mpeStaff(sh.w)), true);
    var had = all.filter(function (x) { return x[0].toUpperCase() === name; })[0];
    if (!had && name !== 'MANAGER.SYS') {
        sh.out('NONEXISTENT USER.  (CIERR 1433)\n');
        return;
    }
    var p = mpeParms(a);
    if (p.PASS === undefined) return;
    var pw = p.PASS.toUpperCase();
    if (sh.ctx.ov.acc[name]) {
        keepAddAccount(sh.ctx, name, pw, sh.ctx.ov.acc[name][1]);
    } else if (mpePrivAccount(sh, name)) {
        keepSetPassword(sh.ctx, name, pw);
        sh.io.say('The ' + name + ' password is yours now. Anyone holding the old one is locked out. Careful what you leave behind.');
    } else {
        //  the ordinary users' passwords stay as they were: the ways in
        //  are everyone's
        sh.out('PASSWORD NOT CHANGED: USER IS LOGGED ON.  (CIWARN 3072)\n');
        return;
    }
    mpeAudit(sh, 'ALTUSER ' + name + ';PASS=');
}

function mpeFcopy(sh) {
    sh.out('\nHP31900A.05.02 FILE COPIER (C) HEWLETT-PACKARD CO. 1990\n\n');
    for (;;) {
        sh.io.out('>');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase();
        if (c === 'EXIT' || c === 'E' || c === '') {
            sh.out('\nEND OF PROGRAM\n');
            return;
        }
        var m = /^FROM\s*=\s*([A-Z0-9.@?#]+)\s*;\s*TO\s*=\s*\$?([A-Z0-9.]+)/.exec(c);
        if (!m) {
            sh.out('*ERROR*  UNRECOGNIZABLE COMMAND\n');
            continue;
        }
        var found = mpeFind(sh, m[1]);
        if (found.err) {
            sh.out('*ERROR*  ' + found.err + '\n');
            continue;
        }
        var text = mpeRead(sh, found[0]);
        if (text === null) continue;
        if (m[2] === 'STDLIST') {
            sh.out(text);
        } else if (mpeWrite(sh, m[2], found[0].node.type === 'text' ? text : '')) {
            sh.out('EOF FOUND IN FROMFILE AFTER RECORD ' + Math.max(0, text.split('\n').length - 2) + '\n\n' + (text.split('\n').length - 1) + ' RECORDS PROCESSED *** 0 ERRORS\n');
        }
    }
}

//  EDIT/3000: T to bring a file in, L ALL to list it, A to add lines (// to
//  stop), K to keep, E to leave
function mpeEditor(sh) {
    var lines = [];
    var name = '';
    sh.out('\nHP32201A.07.22  EDIT/3000  ' + era().hp + '\n(C) HEWLETT-PACKARD CO. 1990\n');
    for (;;) {
        sh.io.out('/');
        var l = sh.io.line(true);
        if (l === null) return 'exit';
        var c = l.trim().toUpperCase();
        var m;
        if (/^E(XIT)?$/.test(c)) {
            sh.out('\nEND OF PROGRAM\n');
            return;
        } else if ((m = /^T(EXT)?\s+(\S+)$/.exec(c))) {
            var found = mpeFind(sh, m[2]);
            if (found.err) {
                sh.out('*' + found.err.replace(/\s+\(.*$/, '') + '\n');
                continue;
            }
            var text = mpeRead(sh, found[0]);
            if (text === null) continue;
            lines = text.replace(/\n$/, '').split('\n');
            name = m[2];
            sh.out(lines.length + ' LINES\n');
        } else if (/^L(IST)?(\s+ALL)?$/.test(c)) {
            sh.out(lines.map(function (x, i) { return padStart(String(i + 1), 5) + '     ' + x; }).join('\n') + (lines.length ? '\n' : ''));
        } else if (/^A(DD)?$/.test(c)) {
            for (;;) {
                sh.io.out(padStart(String(lines.length + 1), 5) + '     ');
                var al = sh.io.line(true);
                if (al === null) return 'exit';
                if (al.trim() === '//') break;
                lines.push(al);
            }
        } else if ((m = /^K(EEP)?\s*(\S*)$/.exec(c))) {
            var to = m[2] || name;
            if (!to) {
                sh.out('*NO FILE NAME\n');
                continue;
            }
            if (mpeWrite(sh, to, lines.join('\n') + (lines.length ? '\n' : ''))) name = to;
        } else if (c) {
            sh.out('*UNRECOGNIZED COMMAND\n');
        }
    }
}
